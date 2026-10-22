import test from 'node:test';
import assert from 'node:assert/strict';
import '../../ui/wall-trace.js';

const { WallTrace } = globalThis;

// Synthetic plan at 1 px = 10 mm: a 4000 x 3000 kitchen (interior x 100..500, y 100..400),
// 230 mm walls drawn in `style`, a 900 mm door gap in the bottom wall, a 1200 mm window drawn
// as three thin lines in the right wall, a 400 x 300 column on the top wall, plus a counter
// line and a text-like blob that must not count as wall.
function plan(style) {
  const w = 700, h = 560, g = new Uint8Array(w * h).fill(255);
  const ink = (x0, y0, x1, y1, v = 0) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = v; };
  const wall = (x0, y0, x1, y1) => {
    if (style === 'solid') return ink(x0, y0, x1, y1);
    // double line: just the two faces, 2 px each
    if (x1 - x0 > y1 - y0) { ink(x0, y0, x1, y0 + 2); ink(x0, y1 - 2, x1, y1); } else { ink(x0, y0, x0 + 2, y1); ink(x1 - 2, y0, x1, y1); }
  };
  wall(77, 77, 523, 100); wall(77, 400, 523, 423); wall(77, 77, 100, 423); wall(500, 77, 523, 423);
  if (style === 'double') { ink(77, 77, 100, 100); ink(500, 77, 523, 100); ink(77, 400, 100, 423); ink(500, 400, 523, 423); }   // corner joints
  ink(200, 398, 290, 425, 255);                                    // door gap, bottom wall
  ink(498, 180, 525, 300, 255);                                    // window gap, right wall ...
  for (const x of [503, 511, 519]) ink(x, 180, x + 1, 300);        // ... drawn as three thin lines
  ink(500, 180, 502, 300); ink(521, 180, 523, 300);                // frame lines at the wall faces
  ink(300, 100, 340, 130);                                         // column on the top wall
  ink(100, 160, 500, 161);                                         // counter edge (thin)
  ink(250, 250, 262, 258); ink(266, 250, 278, 258);                // "text"
  return { gray: g, w, h };
}

for (const style of ['solid', 'double']) test(`traces a ${style}-wall kitchen from one marked wall`, () => {
  const p = plan(style), a = [88, 110], b = [88, 390], mm = 3000;
  const t = WallTrace.learn({ ...p, a, b, pxPerMm: Math.hypot(b[0] - a[0], b[1] - a[1]) / mm });
  assert.ok(t, 'learns the wall style');
  assert.ok(t.T >= 20 && t.T <= 26, `wall thickness ${t.T}px`);
  const r = WallTrace.trace({ ...p, templates: [t], pxPerMm: 280 / mm, prefer: [300, 250] });
  assert.ok(!r.error, r.error);
  const room = r.rooms[0], s = WallTrace.scaleFrom(room.poly, t, mm);
  const d = WallTrace.toDraft(room, s.pxPerMm);
  assert.deepEqual(d.room.corners_mm, [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  assert.deepEqual(d.openWalls, []);
  const door = d.openings.find(o => o.type === 'door'), win = d.openings.find(o => o.type === 'window');
  assert.equal(d.openings.length, 2, JSON.stringify(d.openings));
  assert.equal(door.wallIndex, 2); assert.ok(Math.abs(door.width_mm - 900) <= 100 && Math.abs(door.distanceFromStart_mm - 2550) <= 60, JSON.stringify(door));
  assert.equal(win.wallIndex, 1); assert.ok(Math.abs(win.width_mm - 1200) <= 100 && Math.abs(win.distanceFromStart_mm - 1400) <= 60, JSON.stringify(win));
  assert.equal(d.structures.length, 1);
  const c = d.structures[0];
  assert.ok(Math.abs(c.width_mm - 400) <= 20 && Math.abs(c.depth_mm - 300) <= 20 && Math.abs(c.x_mm - 2200) <= 20, JSON.stringify(c));
});

// CAD-export colours: walls outlined in red and hatched in black; a window where blue glass lines
// replace the hatch between the red faces; a doorway; and black cabinet lines a wall's thickness
// apart inside the room, which must not count as wall (wrong colour).
test('traces a red-outlined hatched wall and tells its window by the missing hatch', () => {
  const w = 700, h = 560, rgb = new Uint8Array(w * h * 3).fill(255);
  const put = (x, y, c) => { const i = 3 * (y * w + x); rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; };
  const box = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, c); };
  const RED = [220, 30, 30], BLACK = [0, 0, 0], BLUE = [40, 60, 230], WHITE = [255, 255, 255];
  const wall = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 6 === 0) put(x, y, BLACK);   // hatch
    if (x1 - x0 > y1 - y0) { box(x0, y0, x1, y0 + 2, RED); box(x0, y1 - 2, x1, y1, RED); } else { box(x0, y0, x0 + 2, y1, RED); box(x1 - 2, y0, x1, y1, RED); }
  };
  wall(77, 77, 523, 100); wall(77, 400, 523, 423); wall(77, 77, 100, 423); wall(500, 77, 523, 423);
  box(200, 398, 290, 425, WHITE);                                    // doorway in the bottom wall
  box(502, 180, 521, 300, WHITE);                                    // window in the right wall: hatch gone ...
  for (const x of [507, 514]) box(x, 180, x + 1, 300, BLUE);         // ... blue glass lines instead
  box(110, 330, 490, 332, BLACK); box(110, 352, 490, 354, BLACK);    // cabinet front and back, black
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1] + 0.114 * rgb[3 * i + 2]);
  const a = [88, 110], b = [88, 390], mm = 3000, t = WallTrace.learn({ gray, rgb, w, h, a, b, pxPerMm: 280 / mm });
  assert.ok(t && t.hatch, 'learns a hatched wall');
  const r = WallTrace.trace({ w, h, templates: [t], pxPerMm: 280 / mm, prefer: [300, 250] });
  assert.ok(!r.error, r.error);
  const d = WallTrace.toDraft(r.rooms[0], WallTrace.scaleFrom(r.rooms[0].poly, t, mm).pxPerMm);
  assert.deepEqual(d.room.corners_mm, [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  const win = d.openings.find(o => o.type === 'window'), door = d.openings.find(o => o.type === 'door');
  assert.equal(d.openings.length, 2, JSON.stringify(d.openings));
  assert.ok(win.wallIndex === 1 && Math.abs(win.width_mm - 1200) <= 100, JSON.stringify(win));
  assert.ok(door.wallIndex === 2 && Math.abs(door.width_mm - 900) <= 100, JSON.stringify(door));
});

test('a stroke over blank paper learns nothing', () => {
  const p = plan('solid');
  assert.equal(WallTrace.learn({ ...p, a: [300, 300], b: [450, 300], pxPerMm: 0.1 }), null);
});
