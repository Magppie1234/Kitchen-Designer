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
