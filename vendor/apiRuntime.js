// vendor/apiRuntime.js — request helpers for server.mjs and the vendor API handlers:
// a default room (loadRoom), door/window placement on walls (resolveOpenings), and reading
// the browser's JSON request body with a size limit (readJsonBody).
import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Room construction
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

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

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

