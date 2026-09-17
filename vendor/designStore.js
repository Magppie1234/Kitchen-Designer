// lib/designStore.js — persistence for projects, rooms, revisions and the audit trail,
// on the local SQLite store (lib/db.js).
//
// The shapes here mirror what the builder UI already holds in memory: a project is the
// S.project details object plus a name; a room's `state` is the ROOM_STATE_KEYS snapshot
// the UI stashes per room. Two write paths with very different meanings:
//   saveRoomState  — autosave. Keeps a revision before a solved layout or its geometry
//                    changes; view metadata and pricing-only updates remain recovery-only.
//   createRevision — an immutable numbered snapshot with a reason (save / generate /
//                    redesign / quote / share / closure / restore / room-delete).
//                    Revisions are never updated or deleted.
//
// Functions stay async even though node:sqlite is synchronous — callers (lib/designApi.js)
// await them, and a hosted database could be swapped back in without touching the API layer.
//
// Auth is still an open decision, so every write is attributed to the single seeded user
// (defaultUserId). The functions already take the actor where it matters, so wiring real
// users in later is a call-site change, not a schema change.
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const jstr = (v) => JSON.stringify(v ?? {});
const jparse = (v) => { try { return JSON.parse(v); } catch { return {}; } };

let cachedUserId = null;
export async function defaultUserId() {
  if (cachedUserId) return cachedUserId;
  const row = getDb().prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get();
  if (!row) throw new Error('no users seeded — check db/migrations/001_init.sql');
  cachedUserId = row.id;
  return cachedUserId;
}

export async function audit(action, { projectId = null, roomId = null, actor = null, detail = {} } = {}) {
  getDb().prepare('INSERT INTO audit_log (project_id, room_id, actor, action, detail) VALUES (?,?,?,?,?)')
    .run(projectId, roomId, actor || (await defaultUserId()), action, jstr(detail));
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const roomSummary = (r) => ({
  id: r.id, name: r.name, category: r.category, seriesId: r.series_id,
  sort: r.sort, updatedAt: r.updated_at,
});

export async function listProjects() {
  const db = getDb();
  const projects = db.prepare(
    `SELECT p.id, p.name, p.details, p.status, p.submitted_at, p.created_at, p.updated_at,
       (SELECT count(*) FROM revisions rv JOIN rooms r2 ON rv.room_id = r2.id WHERE r2.project_id = p.id) AS revs
     FROM projects p WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC`).all();
  const rooms = db.prepare(
    `SELECT id, project_id, name, category, series_id, sort, value, updated_at
     FROM rooms WHERE deleted_at IS NULL ORDER BY sort, created_at`).all();
  const byProject = new Map();
  for (const r of rooms) {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
    byProject.get(r.project_id).push({ ...roomSummary(r), value: r.value });
  }
  return projects.map((p) => {
    const rs = byProject.get(p.id) || [];
    return {
      id: p.id, name: p.name, details: jparse(p.details),
      status: p.status || 'assigned', submittedAt: p.submitted_at,
      revisionCount: p.revs, value: rs.reduce((a, r) => a + (r.value || 0), 0),
      designedRooms: rs.filter((r) => r.value != null).length,
      createdAt: p.created_at, updatedAt: p.updated_at,
      rooms: rs,
    };
  });
}

// Workflow status (assigned -> in-process -> submitted). SAL-04's auto-assignment feed
// reads these buckets; single-designer today, so no designer column yet — that seam is
// the users table, not this function.
export async function setProjectStatus(projectId, status) {
  if (!['assigned', 'in-process', 'submitted'].includes(status)) throw Object.assign(new Error(`invalid status '${status}'`), { status: 400 });
  const res = getDb().prepare(
    `UPDATE projects SET status = ?, submitted_at = CASE WHEN ? = 'submitted' THEN ${NOW} ELSE submitted_at END, updated_at = ${NOW}
     WHERE id = ? AND deleted_at IS NULL`).run(status, status, projectId);
  if (!res.changes) throw Object.assign(new Error('project not found'), { status: 404 });
  await audit('project.status', { projectId, detail: { status } });
  return { id: projectId, status };
}

// Submit: freeze every room's CURRENT stored state as a 'submitted' revision, then mark
// the project submitted — the value shown in the Submitted bucket comes from the rooms'
// value snapshots and stays live if the design is later reopened and edited.
export async function submitProject(projectId) {
  const rooms = getDb().prepare('SELECT id, state FROM rooms WHERE project_id = ? AND deleted_at IS NULL').all(projectId);
  if (!rooms.length) throw Object.assign(new Error('project has no rooms to submit'), { status: 400 });
  const revs = [];
  for (const r of rooms) revs.push(await createRevision(r.id, 'submitted', jparse(r.state)));
  await setProjectStatus(projectId, 'submitted');
  return { id: projectId, status: 'submitted', revisions: revs.map((x) => x.number) };
}

// OBS-01, dashboard-level: per room, the engine's frozen output vs the design as refined.
export async function projectObservability(projectId) {
  const db = getDb();
  const rooms = db.prepare('SELECT id, name, state FROM rooms WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort, created_at').all(projectId);
  return rooms.map((r) => {
    const cur = jparse(r.state), curPlan = cur.plan || {};
    const gen = db.prepare(
      `SELECT number, state, created_at FROM revisions
       WHERE room_id = ? AND reason IN ('generate','redesign') ORDER BY number DESC LIMIT 1`).get(r.id);
    const genPlan = gen ? (jparse(gen.state).plan || {}) : null;
    const bomDelta = (a = {}, b = {}) => {
      const codes = new Set([...Object.keys(a), ...Object.keys(b)]);
      let n = 0; for (const c of codes) n += Math.abs((a[c] || 0) - (b[c] || 0)); return n;
    };
    const edits = cur.editLog || [];
    return {
      roomId: r.id, name: r.name,
      generated: genPlan ? { revision: gen.number, at: gen.created_at, total: genPlan.price?.breakdown?.total ?? null, modules: Object.values(genPlan.bom || {}).reduce((x, y) => x + y, 0) } : null,
      current: { total: curPlan.price?.breakdown?.total ?? null, modules: Object.values(curPlan.bom || {}).reduce((x, y) => x + y, 0) },
      moduleChanges: genPlan ? bomDelta(genPlan.bom, curPlan.bom) : 0,
      edits: edits.length,
      remarks: edits.flatMap((e) => e.remarks || []),
      revisionCount: db.prepare('SELECT count(*) AS n FROM revisions WHERE room_id = ?').get(r.id).n,
    };
  });
}

export async function getProject(projectId) {
  const db = getDb();
  const p = db.prepare(
    `SELECT id, name, details, status, submitted_at, created_at, updated_at
     FROM projects WHERE id = ? AND deleted_at IS NULL`).get(projectId);
  if (!p) return null;
  const rooms = db.prepare(
    `SELECT id, name, category, series_id, sort, state, updated_at
     FROM rooms WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort, created_at`).all(projectId);
  return {
    id: p.id, name: p.name, details: jparse(p.details),
    status: p.status || 'assigned', submittedAt: p.submitted_at,
    createdAt: p.created_at, updatedAt: p.updated_at,
    rooms: rooms.map((r) => ({ ...roomSummary(r), state: jparse(r.state) })),
  };
}

export async function createProject({ name, details = {}, room = null }) {
  const owner = await defaultUserId();
  const id = randomUUID();
  getDb().prepare('INSERT INTO projects (id, owner_id, name, details) VALUES (?,?,?,?)')
    .run(id, owner, name || 'Untitled Project', jstr(details));
  if (room) await createRoom(id, room);
  await audit('project.create', { projectId: id, detail: { name } });
  return getProject(id);
}

export async function updateProject(projectId, { name, details }) {
  const res = getDb().prepare(
    `UPDATE projects SET
       name = coalesce(?, name),
       details = coalesce(?, details),
       updated_at = ${NOW}
     WHERE id = ? AND deleted_at IS NULL`)
    .run(name ?? null, details === undefined ? null : jstr(details), projectId);
  if (!res.changes) throw Object.assign(new Error('project not found'), { status: 404 });
  await audit('project.update', { projectId, detail: { name, details } });
  return getProject(projectId);
}

export async function deleteProject(projectId) {
  getDb().prepare(`UPDATE projects SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ?`).run(projectId);
  await audit('project.delete', { projectId });
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function touchProject(projectId) {
  getDb().prepare(`UPDATE projects SET updated_at = ${NOW} WHERE id = ?`).run(projectId);
}

function getRoomRow(roomId) {
  return getDb().prepare(
    `SELECT id, project_id, name, category, series_id, state, sort, updated_at
     FROM rooms WHERE id = ? AND deleted_at IS NULL`).get(roomId);
}

export async function createRoom(projectId, { name, category = 'rk-show', seriesId = null, state = {}, sort = 0 }) {
  const id = randomUUID();
  getDb().prepare('INSERT INTO rooms (id, project_id, name, category, series_id, state, sort) VALUES (?,?,?,?,?,?,?)')
    .run(id, projectId, name || 'New Room', category, seriesId, jstr(state), sort);
  touchProject(projectId);
  await audit('room.create', { projectId, roomId: id, detail: { name, category } });
  const r = getRoomRow(id);
  return { ...roomSummary(r), state: jparse(r.state) };
}

export async function updateRoom(roomId, { name, category, seriesId, sort }) {
  const res = getDb().prepare(
    `UPDATE rooms SET
       name = coalesce(?, name),
       category = coalesce(?, category),
       series_id = coalesce(?, series_id),
       sort = coalesce(?, sort),
       updated_at = ${NOW}
     WHERE id = ? AND deleted_at IS NULL`)
    .run(name ?? null, category ?? null, seriesId ?? null, sort ?? null, roomId);
  if (!res.changes) throw Object.assign(new Error('room not found'), { status: 404 });
  const r = getRoomRow(roomId);
  touchProject(r.project_id);
  await audit('room.update', { projectId: r.project_id, roomId, detail: { name, category, seriesId } });
  return { ...roomSummary(r), projectId: r.project_id };
}

// Autosave: preserve the previous layout when its geometry or presentation changes.
// The room's value snapshot (₹ total) is refreshed here so project listings never have to
// parse full state JSON.
export function layoutSignature(state) {
  return JSON.stringify([state?.walls,state?.openings,state?.structures,state?.anchors,state?.zones,
    state?.plan?.runs,state?.plan?.tiers,state?.plan?.island,state?.planStyle||'detailed',state?.planTier||'overlay']);
}

export async function saveRoomState(roomId, state, { preservePrevious = true } = {}) {
  const previous=getRoomRow(roomId);
  if (!previous) throw Object.assign(new Error('room not found'), { status: 404 });
  const oldState=jparse(previous.state);
  if(preservePrevious && oldState?.plan && layoutSignature(oldState)!==layoutSignature(state)) {
    await createRevision(roomId,'before-layout-change',oldState);
  }
  const value = state?.plan?.price?.breakdown?.total ?? null;
  const res = getDb().prepare(
    `UPDATE rooms SET state = ?, value = coalesce(?, value), updated_at = ${NOW} WHERE id = ? AND deleted_at IS NULL`)
    .run(jstr(state), value != null ? Math.round(value) : null, roomId);
  if (!res.changes) throw Object.assign(new Error('room not found'), { status: 404 });
  const r = getRoomRow(roomId);
  touchProject(r.project_id);
  return { updatedAt: r.updated_at };
}

// Deleting a room counts as a revision: snapshot the final state first, then soft-delete.
export async function deleteRoom(roomId) {
  const r = getRoomRow(roomId);
  if (!r) throw Object.assign(new Error('room not found'), { status: 404 });
  await createRevision(roomId, 'room-delete', jparse(r.state));
  getDb().prepare(`UPDATE rooms SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ?`).run(roomId);
  touchProject(r.project_id);
  await audit('room.delete', { projectId: r.project_id, roomId });
}

export async function duplicateRoom(roomId, newName) {
  const src = getRoomRow(roomId);
  if (!src) throw Object.assign(new Error('room not found'), { status: 404 });
  const id = randomUUID();
  getDb().prepare('INSERT INTO rooms (id, project_id, name, category, series_id, state, sort) VALUES (?,?,?,?,?,?,?)')
    .run(id, src.project_id, newName || src.name + ' (copy)', src.category, src.series_id, src.state, src.sort + 1);
  touchProject(src.project_id);
  await audit('room.duplicate', { projectId: src.project_id, roomId: id, detail: { from: roomId } });
  const r = getRoomRow(id);
  return { ...roomSummary(r), state: jparse(r.state) };
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export async function createRevision(roomId, reason, state, actor = null) {
  const by = actor || (await defaultUserId());
  const id = randomUUID();
  // Single-process synchronous writes — max(number)+1 cannot race here; the UNIQUE
  // constraint stays as the backstop if that ever changes.
  const row = getDb().prepare(
    `INSERT INTO revisions (id, room_id, number, reason, state, created_by)
     VALUES (?, ?, (SELECT coalesce(max(number), 0) + 1 FROM revisions WHERE room_id = ?), ?, ?, ?)
     RETURNING id, number, reason, created_at`)
    .get(id, roomId, roomId, reason, jstr(state), by);
  const r = getDb().prepare('SELECT project_id FROM rooms WHERE id = ?').get(roomId);
  await audit('revision.create', { projectId: r && r.project_id, roomId, actor: by, detail: { reason, number: row.number } });
  return { id: row.id, number: row.number, reason: row.reason, createdAt: row.created_at };
}

export async function listRevisions(roomId) {
  return getDb().prepare(
    `SELECT id, number, reason, created_at AS createdAt
     FROM revisions WHERE room_id = ? ORDER BY number DESC`).all(roomId);
}

export async function getRevision(revisionId) {
  const row = getDb().prepare(
    `SELECT id, room_id, number, reason, state, created_at
     FROM revisions WHERE id = ?`).get(revisionId);
  if (!row) return null;
  return { id: row.id, roomId: row.room_id, number: row.number, reason: row.reason,
           state: jparse(row.state), createdAt: row.created_at };
}

// ---------------------------------------------------------------------------
// Shares (Stage 9.4/9.6) — a link is pinned to ONE revision and carries an expiry.
// Creating a share creates a 'share' revision first (Stage 8.8), so the link always
// reproduces exactly what was shared, regardless of later edits.
// ---------------------------------------------------------------------------

export async function createShare(roomId, state, { includeEstimate = true, expiryDays = 14 } = {}) {
  const rev = await createRevision(roomId, 'share', state);
  const token = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 32);
  const expiresAt = new Date(Date.now() + expiryDays * 864e5).toISOString();
  getDb().prepare('INSERT INTO shares (id, token, room_id, revision_id, include_estimate, expires_at) VALUES (?,?,?,?,?,?)')
    .run(randomUUID(), token, roomId, rev.id, includeEstimate ? 1 : 0, expiresAt);
  await audit('share.create', { roomId, detail: { revision: rev.number, expiresAt } });
  return { token, revision: rev, expiresAt };
}

export async function getShare(token) {
  const row = getDb().prepare(
    `SELECT s.token, s.include_estimate, s.expires_at, s.created_at,
            r.id AS revision_id, r.number, r.state, r.room_id,
            rm.name AS room_name, rm.series_id
     FROM shares s JOIN revisions r ON r.id = s.revision_id JOIN rooms rm ON rm.id = s.room_id
     WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { expired: true, expiresAt: row.expires_at };
  const latest = getDb().prepare('SELECT coalesce(max(number),0) AS n FROM revisions WHERE room_id = ?').get(row.room_id);
  let state; try { state = JSON.parse(row.state); } catch { state = {}; }
  return {
    token: row.token, includeEstimate: !!row.include_estimate, expiresAt: row.expires_at,
    createdAt: row.created_at, revisionNumber: row.number, latestRevision: latest.n,
    newerExists: latest.n > row.number, roomName: row.room_name, seriesId: row.series_id, state,
  };
}

// Restore: the revision's snapshot becomes the live state, and the restore itself is a
// new revision — history only ever moves forward, nothing is rewritten.
export async function restoreRevision(revisionId, { roomId, currentState } = {}) {
  const rev = await getRevision(revisionId);
  if (!rev) throw Object.assign(new Error('revision not found'), { status: 404 });
  if(roomId && roomId!==rev.roomId) throw Object.assign(new Error('Revision belongs to a different room'), {status:400});
  const room=getRoomRow(rev.roomId);
  if(!room) throw Object.assign(new Error('room not found'),{status:404});
  // Preserve even the browser's not-yet-autosaved changes before replacing live state.
  // Only accept a supplied state when it is explicitly bound to this room.
  await createRevision(rev.roomId,'before-restore',roomId && currentState ? currentState : jparse(room.state));
  await saveRoomState(rev.roomId, rev.state, {preservePrevious:false});
  const created = await createRevision(rev.roomId, 'restore', rev.state);
  return { roomId: rev.roomId, restoredFrom: rev.number, revision: created, state: rev.state };
}
