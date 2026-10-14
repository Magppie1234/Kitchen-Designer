import test from 'node:test';
import assert from 'node:assert/strict';
import { toEngineInput } from '../../server.mjs';
import { loadCatalog } from '../../core/loadCatalog.mjs';
import { check } from '../../core/checkInput.mjs';
import { layout } from '../../core/engine.mjs';

const cat = loadCatalog().ok;
const room = (W, H) => [{ a: [0, 0], b: [W, 0] }, { a: [W, 0], b: [W, H] }, { a: [W, H], b: [0, H] }, { a: [0, H], b: [0, 0] }];
const input = (anchors, openings) => toEngineInput(anchors, { walls: room(3600, 3000), ceiling: 2500, handles: { base: 'CJ' }, sinkWidth: 900, openings }).input;
const ok = [{ type: 'hob', wall: 'W1', off: 1500 }, { type: 'sink', wall: 'W0', off: 1500 }, { type: 'fridge', wall: 'W2', off: 1800 }];
const door = (extra = {}) => ({ type: 'door', wall: 'W3', off: 1500, width: 900, ...extra });   // 1050–1950 on W3

test('door-side-clearance: 50mm of bare wall each side of a door, in every tier', () => {
  const j = input(ok, [door()]);
  const r = layout(j, cat);
  for (const tier of ['base', 'wall', 'tall'])
    assert.ok(!r.placed[tier].some((p) => !p.blocker && p.wall === j.openings[0].wall && p.at < 2000 && p.at + p.width > 1000), `${tier} keeps 1000–2000 clear`);
  // an appliance ending 20mm short of a door is rejected
  const near = input([ok[0], ok[1], { type: 'fridge', wall: 'W3', off: 600 }], []);
  const f = near.anchors.find((x) => x.item === 'fridge');
  near.openings = [{ type: 'door', wall: f.wall, at: f.at + f.width + 20, width: 900 }];
  assert.ok(check(near).some((e) => /fridge is within 50mm of a door.*door-side-clearance/.test(e)), check(near).join());
});

test('fridge-clear-of-door-swing: 800mm on the hinge side only, none for a sliding door', () => {
  const j = input([ok[0], ok[1], { type: 'fridge', wall: 'W3', off: 2400 }], []);
  const f = j.anchors.find((x) => x.item === 'fridge');
  const swing = (o, at = f.at - 400 - 900) => check({ ...j, openings: [{ type: 'door', wall: f.wall, at, width: 900, ...o }] })
    .filter((e) => /fridge-clear-of-door-swing/.test(e));
  assert.equal(swing({ flip: 1 }).length, 1, 'hinge at the end, fridge 400mm past it: behind the door');
  assert.equal(swing({ flip: 1 }, f.at - 800 - 900).length, 0, '800mm clear is enough');
  assert.equal(swing({ flip: 0 }).length, 0, 'hinge at the start: fridge is on the latch side');
  assert.equal(swing({ flip: 1, variant: 'sliding' }).length, 0, 'sliding door has no swing');
  assert.equal(swing({ flip: 3 }).length, 0, 'door opening outward');
  // round the corner: door at the end of the previous wall, hinge at its end
  const order = j.walls.map((w) => w.id), prev = j.walls[(order.indexOf(f.wall) + order.length - 1) % order.length];
  const k = { ...j, openings: [{ type: 'door', wall: prev.id, at: prev.length - 900 - 100, width: 900, flip: 1 }] };
  k.anchors = j.anchors.map((x) => x.item === 'fridge' ? { ...x, at: 300 } : x);   // 100 + 300 = 400mm round the corner
  assert.ok(check(k).some((e) => /fridge-clear-of-door-swing/.test(e)), check(k).join());
});

test('window-near-corner: a normal window under 360mm from the corner keeps 200mm clear on the next wall', () => {
  const win = (end, variant) => ({ type: 'window', wall: 'W0', off: 3600 - end - 500, width: 1000, variant });
  const reserved = (o) => { const j = input(ok, [o]); return layout(j, cat).placed.wall.filter((p) => p.role === 'window clearance'); };
  const r = reserved(win(300, 'sliding'));
  assert.equal(r.length, 1); assert.equal(r[0].at, 0); assert.equal(r[0].width, 200);
  assert.equal(reserved(win(300, 'openable')).length, 1);
  assert.equal(reserved(win(300, 'fulllength')).length, 0, 'full-length window does not trigger');
  assert.equal(reserved(win(400, 'sliding')).length, 0, '400mm from the corner does not trigger');
});
