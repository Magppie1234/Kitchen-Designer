// vendor/designStore.js — persistence for projects, rooms, revisions and the audit trail, on
// Supabase Postgres (vendor/supabase.js; schema and row-level security in supabase/schema.sql).
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
// Every query runs as the signed-in user, so a designer only ever reaches their own rows and
// the admin reads everyone's but can write nothing — the database enforces it, not this file.
// Owner and author columns default to auth.uid() in the database.
import { randomUUID } from 'node:crypto';
import { rest } from './supabase.js';

const now = () => new Date().toISOString();
// ids from the request go into PostgREST URLs, so only well-formed uuids get through
const q = (id) => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) throw Object.assign(new Error(`invalid id '${id}'`), { status: 400 }); return id; };
const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });

export async function audit(action, { projectId = null, roomId = null, detail = {} } = {}) {
  await rest('audit_log', { method: 'POST', body: { project_id: projectId, room_id: roomId, action, detail } });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const roomSummary = (r) => ({
  id: r.id, name: r.name, category: r.category, seriesId: r.series_id,
  sort: r.sort, updatedAt: r.updated_at,
});

// The designer sees their own projects; the admin sees every designer's, with the owner.
export async function listProjects() {
  const projects = await rest('project_summaries?order=updated_at.desc');
  if (!projects.length) return [];
  const rooms = await rest(`rooms?project_id=in.(${projects.map((p) => p.id).join(',')})&deleted_at=is.null`
    + '&select=id,project_id,name,category,series_id,sort,value,updated_at&order=sort,created_at');
  const byProject = new Map();
  for (const r of rooms) {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
    byProject.get(r.project_id).push({ ...roomSummary(r), value: r.value });
  }
  return projects.map((p) => {
    const rs = byProject.get(p.id) || [];
    return {
      id: p.id, name: p.name, details: p.details || {},
      owner: { id: p.owner_id, name: p.owner_name, email: p.owner_email },
      status: p.status || 'assigned', submittedAt: p.submitted_at,
      revisionCount: p.revision_count, value: rs.reduce((a, r) => a + (r.value || 0), 0),
      designedRooms: rs.filter((r) => r.value != null).length,
      createdAt: p.created_at, updatedAt: p.updated_at,
      rooms: rs,
    };
  });
}

// Workflow status (assigned -> in-process -> submitted).
export async function setProjectStatus(projectId, status) {
  if (!['assigned', 'in-process', 'submitted'].includes(status)) throw Object.assign(new Error(`invalid status '${status}'`), { status: 400 });
  const patch = { status, updated_at: now() };
  if (status === 'submitted') patch.submitted_at = now();
  const rows = await rest(`projects?id=eq.${q(projectId)}&deleted_at=is.null`, { method: 'PATCH', body: patch });
  if (!rows.length) throw notFound('project');
  await audit('project.status', { projectId, detail: { status } });
  return { id: projectId, status };
}

// Submit: freeze every room's CURRENT stored state as a 'submitted' revision, then mark
// the project submitted.
export async function submitProject(projectId) {
  const rooms = await rest(`rooms?project_id=eq.${q(projectId)}&deleted_at=is.null&select=id,state`);
  if (!rooms.length) throw Object.assign(new Error('project has no rooms to submit'), { status: 400 });
  const revs = [];
  for (const r of rooms) revs.push(await createRevision(r.id, 'submitted', r.state));
  await setProjectStatus(projectId, 'submitted');
  return { id: projectId, status: 'submitted', revisions: revs.map((x) => x.number) };
}

// OBS-01, dashboard-level: per room, the engine's frozen output vs the design as refined.
export async function projectObservability(projectId) {
  const rooms = await rest(`rooms?project_id=eq.${q(projectId)}&deleted_at=is.null&select=id,name,state&order=sort,created_at`);
  return Promise.all(rooms.map(async (r) => {
    const cur = r.state || {}, curPlan = cur.plan || {};
    const [gen] = await rest(`revisions?room_id=eq.${q(r.id)}&reason=in.(generate,redesign)&select=number,state,created_at&order=number.desc&limit=1`);
    const revs = await rest(`revisions?room_id=eq.${q(r.id)}&select=id`);
    const genPlan = gen ? (gen.state?.plan || {}) : null;
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
      revisionCount: revs.length,
    };
  }));
}

export async function getProject(projectId) {
  const p = await rest(`projects?id=eq.${q(projectId)}&deleted_at=is.null&select=id,name,details,status,submitted_at,created_at,updated_at`, { single: true });
  if (!p) return null;
  const rooms = await rest(`rooms?project_id=eq.${q(projectId)}&deleted_at=is.null`
    + '&select=id,name,category,series_id,sort,state,updated_at&order=sort,created_at');
  return {
    id: p.id, name: p.name, details: p.details || {},
    status: p.status || 'assigned', submittedAt: p.submitted_at,
    createdAt: p.created_at, updatedAt: p.updated_at,
    rooms: rooms.map((r) => ({ ...roomSummary(r), state: r.state || {} })),
  };
}

export async function createProject({ name, details = {}, room = null }) {
  const [p] = await rest('projects', { method: 'POST', body: { name: name || 'Untitled Project', details } });
  if (room) await createRoom(p.id, room);
  await audit('project.create', { projectId: p.id, detail: { name } });
  return getProject(p.id);
}

export async function updateProject(projectId, { name, details }) {
  const patch = { updated_at: now() };
  if (name != null) patch.name = name;
  if (details !== undefined) patch.details = details;
  const rows = await rest(`projects?id=eq.${q(projectId)}&deleted_at=is.null`, { method: 'PATCH', body: patch });
  if (!rows.length) throw notFound('project');
  await audit('project.update', { projectId, detail: { name, details } });
  return getProject(projectId);
}

export async function deleteProject(projectId) {
  await rest(`projects?id=eq.${q(projectId)}`, { method: 'PATCH', body: { deleted_at: now(), updated_at: now() } });
  await audit('project.delete', { projectId });
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const touchProject = (projectId) =>
  rest(`projects?id=eq.${q(projectId)}&select=id`, { method: 'PATCH', body: { updated_at: now() } });

const getRoomRow = (roomId) =>
  rest(`rooms?id=eq.${q(roomId)}&deleted_at=is.null&select=id,project_id,name,category,series_id,state,sort,updated_at`, { single: true });

export async function createRoom(projectId, { name, category = 'rk-show', seriesId = null, state = {}, sort = 0 }) {
  const [r] = await rest('rooms', { method: 'POST',
    body: { project_id: projectId, name: name || 'New Room', category, series_id: seriesId, state, sort } });
  await touchProject(projectId);
  await audit('room.create', { projectId, roomId: r.id, detail: { name, category } });
  return { ...roomSummary(r), state: r.state || {} };
}

export async function updateRoom(roomId, { name, category, seriesId, sort }) {
  const patch = { updated_at: now() };
  if (name != null) patch.name = name;
  if (category != null) patch.category = category;
  if (seriesId != null) patch.series_id = seriesId;
  if (sort != null) patch.sort = sort;
  const [r] = await rest(`rooms?id=eq.${q(roomId)}&deleted_at=is.null&select=id,project_id,name,category,series_id,sort,updated_at`, { method: 'PATCH', body: patch });
  if (!r) throw notFound('room');
  await touchProject(r.project_id);
  await audit('room.update', { projectId: r.project_id, roomId, detail: { name, category, seriesId } });
  return { ...roomSummary(r), projectId: r.project_id };
}

// Autosave: preserve the previous layout when its geometry or presentation changes.
// The room's value snapshot (₹ total) is refreshed here so project listings never have to
// read full state JSON.
export function layoutSignature(state) {
  return JSON.stringify([state?.walls,state?.openings,state?.structures,state?.anchors,state?.zones,
    state?.plan?.runs,state?.plan?.tiers,state?.plan?.island,state?.planStyle||'detailed',state?.planTier||'overlay']);
}

export async function saveRoomState(roomId, state, { preservePrevious = true } = {}) {
  const previous = await getRoomRow(roomId);
  if (!previous) throw notFound('room');
  const oldState = previous.state || {};
  if (preservePrevious && oldState.plan && layoutSignature(oldState) !== layoutSignature(state)) {
    await createRevision(roomId, 'before-layout-change', oldState);
  }
  const value = state?.plan?.price?.breakdown?.total;
  const patch = { state: state ?? {}, updated_at: now() };
  if (value != null) patch.value = Math.round(value);
  const [r] = await rest(`rooms?id=eq.${q(roomId)}&deleted_at=is.null&select=updated_at,project_id`, { method: 'PATCH', body: patch });
  if (!r) throw notFound('room');
  await touchProject(r.project_id);
  return { updatedAt: r.updated_at };
}

// Deleting a room counts as a revision: snapshot the final state first, then soft-delete.
export async function deleteRoom(roomId) {
  const r = await getRoomRow(roomId);
  if (!r) throw notFound('room');
  await createRevision(roomId, 'room-delete', r.state || {});
  await rest(`rooms?id=eq.${q(roomId)}`, { method: 'PATCH', body: { deleted_at: now(), updated_at: now() } });
  await touchProject(r.project_id);
  await audit('room.delete', { projectId: r.project_id, roomId });
}

export async function duplicateRoom(roomId, newName) {
  const src = await getRoomRow(roomId);
  if (!src) throw notFound('room');
  const [r] = await rest('rooms', { method: 'POST', body: {
    project_id: src.project_id, name: newName || src.name + ' (copy)', category: src.category,
    series_id: src.series_id, state: src.state, sort: src.sort + 1 } });
  await touchProject(src.project_id);
  await audit('room.duplicate', { projectId: src.project_id, roomId: r.id, detail: { from: roomId } });
  return { ...roomSummary(r), state: r.state || {} };
}

// ---------------------------------------------------------------------------
// Revisions — numbered per room by a database trigger, so concurrent saves cannot collide
// ---------------------------------------------------------------------------

export async function createRevision(roomId, reason, state) {
  const [row] = await rest('revisions?select=id,number,reason,created_at,rooms(project_id)', { method: 'POST',
    body: { room_id: roomId, reason, state: state ?? {} } });
  await audit('revision.create', { projectId: row.rooms?.project_id ?? null, roomId, detail: { reason, number: row.number } });
  return { id: row.id, number: row.number, reason: row.reason, createdAt: row.created_at };
}

export async function listRevisions(roomId) {
  return rest(`revisions?room_id=eq.${q(roomId)}&select=id,number,reason,createdAt:created_at&order=number.desc`);
}

export async function getRevision(revisionId) {
  const row = await rest(`revisions?id=eq.${q(revisionId)}&select=id,room_id,number,reason,state,created_at`, { single: true });
  if (!row) return null;
  return { id: row.id, roomId: row.room_id, number: row.number, reason: row.reason,
           state: row.state || {}, createdAt: row.created_at };
}

// ---------------------------------------------------------------------------
// Shares — a link is pinned to ONE revision and carries an expiry. Creating a share creates
// a 'share' revision first, so the link always reproduces exactly what was shared.
// ---------------------------------------------------------------------------

export async function createShare(roomId, state, { includeEstimate = true, expiryDays = 14 } = {}) {
  const rev = await createRevision(roomId, 'share', state);
  const token = (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 32);
  const expiresAt = new Date(Date.now() + expiryDays * 864e5).toISOString();
  await rest('shares', { method: 'POST',
    body: { token, room_id: roomId, revision_id: rev.id, include_estimate: !!includeEstimate, expires_at: expiresAt } });
  await audit('share.create', { roomId, detail: { revision: rev.number, expiresAt } });
  return { token, revision: rev, expiresAt };
}

// Public: the client opening a share link is not signed in, so this one lookup uses the
// server's secret key. The 32-character token is the only key to the row.
export async function getShare(token) {
  if (!/^[0-9a-f]{32}$/.test(String(token))) return null;
  const row = await rest(`shares?token=eq.${token}&select=token,include_estimate,expires_at,created_at,`
    + 'revisions(id,number,state,room_id),rooms(name,series_id)', { single: true, service: true });
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { expired: true, expiresAt: row.expires_at };
  const [latest] = await rest(`revisions?room_id=eq.${row.revisions.room_id}&select=number&order=number.desc&limit=1`, { service: true });
  const latestNumber = latest?.number ?? 0;
  return {
    token: row.token, includeEstimate: row.include_estimate, expiresAt: row.expires_at,
    createdAt: row.created_at, revisionNumber: row.revisions.number, latestRevision: latestNumber,
    newerExists: latestNumber > row.revisions.number, roomName: row.rooms.name, seriesId: row.rooms.series_id,
    state: row.revisions.state || {},
  };
}

// Restore: the revision's snapshot becomes the live state, and the restore itself is a
// new revision — history only ever moves forward, nothing is rewritten.
export async function restoreRevision(revisionId, { roomId, currentState } = {}) {
  const rev = await getRevision(revisionId);
  if (!rev) throw notFound('revision');
  if (roomId && roomId !== rev.roomId) throw Object.assign(new Error('Revision belongs to a different room'), { status: 400 });
  const room = await getRoomRow(rev.roomId);
  if (!room) throw notFound('room');
  // Preserve even the browser's not-yet-autosaved changes before replacing live state.
  // Only accept a supplied state when it is explicitly bound to this room.
  await createRevision(rev.roomId, 'before-restore', roomId && currentState ? currentState : room.state || {});
  await saveRoomState(rev.roomId, rev.state, { preservePrevious: false });
  const created = await createRevision(rev.roomId, 'restore', rev.state);
  return { roomId: rev.roomId, restoredFrom: rev.number, revision: created, state: rev.state };
}
