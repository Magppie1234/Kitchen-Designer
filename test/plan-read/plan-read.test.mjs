import test from 'node:test';
import assert from 'node:assert/strict';
import { toDraft } from '../../plan-read.mjs';

// 4000 x 3000 room, top wall open for its last 1000, door on the left wall, cabinetry drawn.
const read = {
  outline: [
    { id: 'S1', kind: 'wall', dir: 'right', length_mm: 3000, source: 'printed' },
    { id: 'S2', kind: 'open', dir: 'right', length_mm: 1000, source: 'printed' },
    { id: 'S3', kind: 'wall', dir: 'down', length_mm: 3000, source: 'printed' },
    { id: 'S4', kind: 'wall', dir: 'left', length_mm: 4000, source: 'printed' },
    { id: 'S5', kind: 'wall', dir: 'up', length_mm: 3000, source: 'estimated' },
  ],
  openings: [{ type: 'door', segment: 'S5', offset_mm: 1000, width_mm: 900, source: 'printed' },
    { type: 'window', segment: 'S2', offset_mm: 0, width_mm: 800 }],   // on the open side: dropped
  fixtures: [
    { type: 'base_run', segment: 'S4', offset_mm: 0, length_mm: 4000 },
    { type: 'sink', segment: 'S4', offset_mm: 1000, length_mm: 900 },
    { type: 'hob', segment: 'S1', offset_mm: 1200, length_mm: 900 },
    { type: 'dishwasher', segment: 'S4', offset_mm: 1900, length_mm: 600 },
    { type: 'island', segment: null },
  ],
  confidence: 0.9,
};

test('plan reading becomes a clockwise room with centred openings, zones and fixtures', () => {
  const d = toDraft(read);
  assert.deepEqual(d.room.corners_mm, [[0, 0], [3000, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  assert.deepEqual(d.openWalls, [1]);
  assert.deepEqual(d.openings, [{ type: 'door', wallIndex: 4, width_mm: 900, distanceFromStart_mm: 1450 }]);
  assert.deepEqual(d.zones, [{ wall: 'W3', tier: 'base', s: 0, e: 4000 }]);
  assert.deepEqual(d.fixtures, [{ type: 'sink', wall: 'W3', off: 1450, width_mm: 900 }, { type: 'hob', wall: 'W0', off: 1650, width_mm: 900 }]);
  assert.equal(d.dishwasher, true);
  assert.equal(d.confidence, 'high');
  assert.ok(d.warnings.some((w) => /island/.test(w)) && d.warnings.some((w) => /1 measurement was estimated/.test(w)));
});

test('a counter-clockwise trace is reversed and positions along each wall mirrored', () => {
  const d = toDraft({ outline: [
    { id: 'A', dir: 'down', length_mm: 3000 }, { id: 'B', dir: 'right', length_mm: 4000 },
    { id: 'C', dir: 'up', length_mm: 3000 }, { id: 'D', dir: 'left', length_mm: 4000 }],
    openings: [{ type: 'window', segment: 'B', offset_mm: 500, width_mm: 1000 }] });
  assert.deepEqual(d.room.corners_mm, [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]);
  // B ran left-to-right along the bottom; after reversal it is wall 2 running right-to-left
  assert.deepEqual(d.openings, [{ type: 'window', wallIndex: 2, width_mm: 1000, distanceFromStart_mm: 3000 }]);
});

test('an outline that does not close is flagged; too few walls is an error', () => {
  const d = toDraft({ outline: [{ id: 'a', dir: 'right', length_mm: 3000 }, { id: 'b', dir: 'down', length_mm: 2000 }, { id: 'c', dir: 'left', length_mm: 2500 }] });
  assert.ok(d.warnings.some((w) => /don't close/.test(w)));
  assert.throws(() => toDraft({ outline: [{ id: 'a', dir: 'right', length_mm: 3000 }] }), /fewer than three walls/);
});

test('a pin read becomes image fractions per room; bad points, edges and boxes are dropped', async () => {
  const { toPinRead, PIN_READ } = await import('../../plan-read.mjs');
  const r = toPinRead({ rooms: [
    { dot: 1, corners: [[100, 200], [100, 800], [900, 800], [900, 200], 'x'], open_edges: [1, 9, 1],
      openings: [{ type: 'window', from: [100, 300], to: [100, 500] }, { type: 'door', from: [1, 2] }],
      columns: [{ box_2d: [400, 400, 450, 460] }, { box_2d: [1, 1] }] },
    { dot: 2, corners: [[0, 0], [1, 1]] },   // too few corners: dropped
  ], notes: 'dot 3 unmatched' });
  assert.equal(r.rooms.length, 1);
  assert.deepEqual(r.rooms[0].corners, [[0.2, 0.1], [0.8, 0.1], [0.8, 0.9], [0.2, 0.9]]);
  assert.equal(r.rooms[0].dot, 1);
  assert.deepEqual(r.rooms[0].openEdges, [1]);
  assert.deepEqual(r.rooms[0].openings, [{ type: 'window', a: [0.3, 0.1], b: [0.5, 0.1] }]);
  assert.deepEqual(r.rooms[0].columns, [{ x0: 0.4, y0: 0.4, x1: 0.46, y1: 0.45 }]);
  assert.equal(r.notes, 'dot 3 unmatched');
  // an answer without "rooms" is one room
  assert.equal(toPinRead({ corners: [[0, 0], [0, 500], [500, 500]] }).rooms.length, 1);
  assert.throws(() => toPinRead({ rooms: [{ corners: [[0, 0], [1, 1]] }] }), /could not trace/);
  // named room dots are named in the prompt, and several of them ask for one entry each
  const p = PIN_READ([{ n: 1, kind: 'room', name: 'Kitchen' }, { n: 2, kind: 'room', name: 'Store' }, { n: 3, kind: 'door' }]);
  assert.match(p, /dot 1: a point INSIDE a room — the room "Kitchen"/);
  assert.match(p, /one entry per "inside a room" dot \(1, 2\)/);
});
