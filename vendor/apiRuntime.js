// lib/apiRuntime.js — the request-shaping helpers the serverless functions in api/ share.
//
// These are lifted verbatim from scripts/builder-server.mjs (the local dev server) so that a
// deployed function and `npm run builder` compute the same answer from the same request. The
// dev server keeps its own copies — it is the reference implementation and stays untouched; if
// a rule changes there, mirror it here (the same hand-sync note api/kitchen-detect.js carries).
//
// Nothing here is Vercel-specific except readRawBody/readJsonBody/applyCors, which adapt the
// Node req/res the platform hands us to the shapes the pure lib/ modules expect.
import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Room construction (builder-server.mjs §loadRoom/rectRoom/Lroom/roomFrom)
// ---------------------------------------------------------------------------

const seg = (a, b) => ({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]), thickness: 115 });
// Build wall segments from an ordered polygon ring.
const ring = (pts) => pts.map((p, i) => seg(p, pts[(i + 1) % pts.length]));

// A 4-wall rectangular room; draw mode passes withDoor=false (user adds openings).
function rectRoom(w, h, label, withDoor) {
  return {
    detected: { label },
    room: { bbox: { w, h }, strategy: 'synthetic', walls: ring([[0, 0], [w, 0], [w, h], [0, h]]) },
    openings: withDoor ? [{ type: 'door', wallIndex: 2, center: [0, h], width: 900 }] : [],
    fixtures: [], warnings: [],
  };
}

// An L-shaped room: full w×h rectangle with a notch (nw×nh) cut from the [w,h] corner.
function Lroom(w, h, nw, nh) {
  const pts = [[0, 0], [w, 0], [w, h - nh], [w - nw, h - nh], [w - nw, h], [0, h]];
  return {
    detected: { label: `DRAWN L-ROOM (${w}×${h}, notch ${nw}×${nh})` },
    room: { bbox: { w, h }, strategy: 'synthetic', walls: ring(pts) },
    openings: [], fixtures: [], warnings: [],
  };
}

// Detected room. Draw mode passes a spec {w,h,shape,nw,nh}. Else prefer the cached
// real DWG extract; else a synthetic rectangle default (with a sample door).
//
// The /tmp cache is the one behaviour that reads differently once deployed: on Vercel /tmp is
// writable but per-instance and empty on a cold start, so this simply falls through to the
// synthetic default — the same thing the dev server does on a machine that never ran an extract.
export function loadRoom(spec) {
  const { w, h, shape, nw, nh } = spec || {};
  if (w > 0 && h > 0) {
    if (shape === 'L') return Lroom(w, h, nw || Math.round(w / 3), nh || Math.round(h / 3));
    return rectRoom(w, h, `DRAWN ROOM (${w}×${h})`, false);
  }
  const cache = '/tmp/dwg-extracted.json';
  if (existsSync(cache)) {
    const ex = JSON.parse(readFileSync(cache, 'utf8'));
    if (ex.room?.walls?.length) return ex;
  }
  return rectRoom(5400, 4700, 'SAMPLE KITCHEN (synthetic 5400×4700)', true);
}

// Build the working room from the request: prefer the user's ACTUAL drawn/dragged walls
// (so the result matches the editor exactly), else fall back to a synthetic rect/L by dims.
export function roomFrom(opts = {}) {
  const walls = opts.walls;
  if (Array.isArray(walls) && walls.length >= 3) {
    const norm = walls.map((w) => ({ a: w.a, b: w.b, length: w.length || Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), thickness: w.thickness || 230 }));
    const xs = norm.flatMap((w) => [w.a[0], w.b[0]]), ys = norm.flatMap((w) => [w.a[1], w.b[1]]);
    const bbox = { w: Math.round(Math.max(...xs) - Math.min(...xs)), h: Math.round(Math.max(...ys) - Math.min(...ys)) };
    return { detected: { label: 'DRAWN ROOM' }, room: { bbox, strategy: 'drawn', walls: norm }, openings: [], fixtures: [], warnings: [] };
  }
  return loadRoom(opts.dims);
}

// Convert UI openings {type, wall:'Wi', off, width} -> extractKitchen shape
// {type, wallIndex, center:[x,y], width} using the room's wall geometry.
export function resolveOpenings(room, userOpenings) {
  return (userOpenings || []).map((o) => {
    const i = typeof o.wall === 'number' ? o.wall : +String(o.wall).slice(1);
    const w = room.walls[i];
    if (!w) return null;
    const u = [(w.b[0] - w.a[0]) / w.length, (w.b[1] - w.a[1]) / w.length];
    const off = Math.max(0, Math.min(w.length, o.off ?? w.length / 2));
    return { type: o.type, wallIndex: i, center: [w.a[0] + u[0] * off, w.a[1] + u[1] * off], width: o.width || (o.type === 'door' ? 900 : 1200) };
  }).filter(Boolean);
}

// Convert a real DXF/DWG extractKitchen() result -> the same {room:{corners_mm},
// openings,structures,confidence,warnings} shape lib/visionExtract.js produces, so the
// client's existing applyVisionExtract() can render either source as an editable draft.
export function dwgExtractToDraft(ex) {
  const walls = ex.room.walls;
  const corners_mm = walls.map((w) => w.a);
  const distAlongWall = (w, p) => {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy) || 1;
    return ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / len;
  };
  const openings = (ex.openings || []).map((o) => {
    const w = walls[o.wallIndex]; if (!w) return null;
    return { wallIndex: o.wallIndex, type: o.type, distanceFromStart_mm: Math.round(distAlongWall(w, o.center)), width_mm: o.width };
  }).filter(Boolean);
  return {
    room: { corners_mm },
    openings,
    structures: [],
    confidence: (ex.warnings || []).length ? 'medium' : 'high',
    warnings: ex.warnings || [],
  };
}

// ---------------------------------------------------------------------------
// Platform adapters
// ---------------------------------------------------------------------------

// Same CORS surface the dev server sets, so a page served from anywhere (including a file://
// document pointed at the deployment with ?api=) keeps working exactly as it does locally.
export function applyCors(req, res, extraHeaders = '') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', `content-type${extraHeaders ? ', ' + extraHeaders : ''}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

// Collect the request body as a Buffer. @vercel/node may have already consumed and parsed the
// stream into req.body (it does that whenever bodyParser is left on), so handle both cases —
// the raw-stream path is what binary DWG/PDF uploads need, where a utf8 round-trip would
// corrupt the bytes. Rejects with .status=413 past maxBytes, matching api/kitchen-detect.js.
export function readRawBody(req, maxBytes = Infinity) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (req.body && req.body.type === 'Buffer' && Array.isArray(req.body.data)) return Promise.resolve(Buffer.from(req.body.data));
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body, 'utf8'));
  if (req.body && typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body), 'utf8'));
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error(`request body over ${maxBytes} bytes`), { status: 413 }));
        req.destroy(); return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// JSON body, tolerant of an empty request (the dev server's `JSON.parse(await body(req) || '{}')`).
export async function readJsonBody(req, maxBytes = Infinity) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && req.body.type !== 'Buffer') return req.body;
  const raw = (await readRawBody(req, maxBytes)).toString('utf8');
  return JSON.parse(raw || '{}');
}

// Uniform error envelope — same {error} shape every existing route already returns.
export function fail(res, err) {
  const status = err && err.status ? err.status : 500;
  return res.status(status).json({ error: String((err && err.message) || err) });
}
