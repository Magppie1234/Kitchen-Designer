// lib/designApi.js — the /api/designs HTTP handler, written once and mounted by BOTH
// servers (scripts/builder-server.mjs and api/designs.js), unlike the older routes that
// are hand-synced copies. It therefore sticks to plain Node req/res primitives — no
// res.status()/res.json() — so the same function runs under the dev server and Vercel.
//
// Surface (all under /api/designs):
//   GET  /api/designs                     -> { projects: [...] }            (rooms summarised)
//   GET  /api/designs?project=<id>        -> { project }                    (rooms with state)
//   GET  /api/designs?revisions=<roomId>  -> { revisions: [...] }           (no state — light)
//   GET  /api/designs?revision=<id>       -> { revision }                   (full snapshot)
//   POST /api/designs  { action, ... }    -> per-action result (see ACTIONS)
//
// If the local store cannot be opened (db/ unwritable, unsupported Node) every call answers
// 503 {error}; the client treats that as "working offline" and keeps the old in-memory
// behaviour instead of breaking.
import { readJsonBody } from './apiRuntime.js';
import { hasDb } from './db.js';
import * as store from './designStore.js';

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const ACTIONS = {
  createProject: (b) => store.createProject({ name: b.name, details: b.details, room: b.room }),
  updateProject: (b) => store.updateProject(b.projectId, { name: b.name, details: b.details }),
  deleteProject: (b) => store.deleteProject(b.projectId).then(() => ({ ok: true })),
  createRoom: (b) => store.createRoom(b.projectId, b.room || {}),
  updateRoom: (b) => store.updateRoom(b.roomId, b),
  saveState: (b) => store.saveRoomState(b.roomId, b.state || {}),
  deleteRoom: (b) => store.deleteRoom(b.roomId).then(() => ({ ok: true })),
  duplicateRoom: (b) => store.duplicateRoom(b.roomId, b.name || 'Copy'),
  saveRevision: (b) => store.createRevision(b.roomId, b.reason || 'save', b.state || {}),
  restoreRevision: (b) => store.restoreRevision(b.revisionId,{roomId:b.roomId,currentState:b.currentState}),
  // Stage 6.8 — the manual-edit audit trail: who, when, what changed, from what to what.
  logEdit: (b) => store.audit('design.edit', { roomId: b.roomId, detail: b.detail || {} }).then(() => ({ ok: true })),
  // Designer-dashboard workflow: assigned -> in-process -> submitted.
  setProjectStatus: (b) => store.setProjectStatus(b.projectId, b.status),
  submitProject: (b) => store.submitProject(b.projectId),
};

export async function handleDesigns(req, res) {
  try {
    if (!hasDb()) return json(res, 503, { error: 'Design store unavailable — could not open db/design.sqlite (Node 22.13+ required).' });

    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      if (q.get('project')) {
        const project = await store.getProject(q.get('project'));
        return project ? json(res, 200, { project }) : json(res, 404, { error: 'project not found' });
      }
      if (q.get('revisions')) return json(res, 200, { revisions: await store.listRevisions(q.get('revisions')) });
      if (q.get('revision')) {
        const revision = await store.getRevision(q.get('revision'));
        return revision ? json(res, 200, { revision }) : json(res, 404, { error: 'revision not found' });
      }
      // OBS-01 at dashboard level: generated-vs-refined summary for every room of a project.
      if (q.get('observability')) return json(res, 200, { rooms: await store.projectObservability(q.get('observability')) });
      // Project list + the workload summary the dashboard shows and SAL-04's
      // auto-assignment will read (single designer today; the seam is the users table).
      const projects = await store.listProjects();
      const bucket = (s) => projects.filter((p) => p.status === s);
      return json(res, 200, {
        projects,
        workload: {
          assigned: bucket('assigned').length,
          inProcess: bucket('in-process').length,
          submitted: bucket('submitted').length,
          totalRevisions: projects.reduce((a, p) => a + (p.revisionCount || 0), 0),
          designsMade: projects.reduce((a, p) => a + (p.designedRooms || 0), 0),
        },
      });
    }

    if (req.method === 'POST') {
      // 32 MB cap: room state can legitimately carry snapshot images, but nothing sane is bigger.
      const body = await readJsonBody(req, 32 * 1024 * 1024);
      const fn = ACTIONS[body.action];
      if (!fn) return json(res, 400, { error: `Unknown action '${body.action}'. One of: ${Object.keys(ACTIONS).join(', ')}` });
      return json(res, 200, await fn(body));
    }

    return json(res, 405, { error: 'GET or POST /api/designs.' });
  } catch (e) {
    return json(res, e && e.status ? e.status : 500, { error: String((e && e.message) || e) });
  }
}
