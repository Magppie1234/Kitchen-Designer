import test from 'node:test';
import assert from 'node:assert/strict';
import '../../ui/backsplash.js';

const B = globalThis.Backsplash;
const G = { baseTop: 850, wallBottom: 1415, wallTop: 2500, loft: 600, tall: 2400, ceil: 3100, tallAnchors: ['fridge'] };
const plan = (backsplash) => ({ backsplash: { W0: backsplash },
  runs: [{ key: 'W0', total: 2100, segments: [{ kind: 'cabinet', x0: 0, width: 1500 }, { kind: 'tallBank', x0: 1500, width: 600 }] }],
  tiers: { W0: { wall: [{ kind: 'wallSolid', x0: 0, width: 900 }, { kind: 'chimney', x0: 900, width: 600 }] } } });

test('nothing is billed until a backsplash is added', () => {
  assert.equal(B.summary(plan([]), G).sqft, 0);
  assert.equal(B.summary({ runs: [] }, G).sqft, 0);
  assert.equal(B.summary(null, G).sqft, 0);
});

test('bare wall only: the dado is offered, cabinets are not', () => {
  const { addable } = B.layout(plan([]), 'W0', G);
  assert.deepEqual(addable[0], { x0: 0, x1: 1500, z0: 850, z1: 1415 });            // countertop to wall-cabinet underside
  // behind the chimney is bare all the way up, panel included
  const P = { heights: { '8ft': { wall: 1085 } }, chimney_panel_height: { '8ft': 600 } };
  assert.ok(B.layout(plan([]), 'W0', { ...G, params: P }).addable.some((r) => r.x0 === 900 && r.x1 === 1500 && r.z0 === 1415 && r.z1 >= 2500));
  assert.ok(!addable.some((r) => r.x1 > 1500 && r.z0 < 2500), 'never behind the tall unit, which ends level with the wall cabinets');
  // a region whose spot is now behind a cabinet is dropped, not billed
  assert.equal(B.summary(plan([{ x0: 0, x1: 900, z0: 1500, z1: 2400 }]), G).sqft, 0);
});

test('10 mm tuck per touching edge, billed × 1.25, cut into 8×4 pieces', () => {
  const dado = { x0: 0, x1: 1500, z0: 850, z1: 1415 };
  const [r] = B.layout(plan([dado]), 'W0', G).regions;
  assert.equal(r.w, 1510, 'tall unit on the right; open wall end on the left');
  assert.equal(r.h, 585, 'countertop below and wall cabinet above');
  assert.equal(r.pieces.length, 1);
  assert.equal(r.slabs, 1);
  const s = B.summary(plan([dado]), G);
  assert.equal(s.mm2, 1510 * 585);
  assert.equal(s.sqft, +(1510 * 585 * 1.25 / 92903).toFixed(1));

  const v = B.layout(plan([{ ...dado, orient: 'v' }]), 'W0', G).regions[0];
  assert.deepEqual(v.pieces.map((p) => p.x1 - p.x0), [1220, 290], 'vertical: a joint every 1220');
  const cut = B.layout(plan([{ ...dado, cuts: [600] }]), 'W0', G).regions[0];
  assert.deepEqual(cut.pieces.map((p) => p.x1 - p.x0), [600, 910], 'a designer break adds a joint');
  // moving a break = a designer break before the automatic one, which then re-spaces from it
  const moved = B.layout(plan([{ ...dado, orient: 'v', cuts: [900] }]), 'W0', G).regions[0];
  assert.deepEqual(moved.pieces.map((p) => p.x1 - p.x0), [900, 610], 'the 1220 joint moved to the cabinet line at 900');
  // what is left beside a trimmed region can be added again
  assert.ok(B.layout(plan([{ ...dado, x1: 1000 }]), 'W0', G).addable.some((a) => a.x0 === 1000 && a.x1 === 1500 && a.z0 === 850));
});
