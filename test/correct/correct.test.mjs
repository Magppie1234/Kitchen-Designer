import test from 'node:test';
import assert from 'node:assert/strict';
import { toEngineInput } from '../../server.mjs';
import { loadCatalog } from '../../core/loadCatalog.mjs';
import { check } from '../../core/checkInput.mjs';
import { correctKitchen, describeCorrections, fixableInput, withinLimits } from '../../core/correct.mjs';

const cat = loadCatalog().ok;
const room = (W, H) => [{ a: [0, 0], b: [W, 0] }, { a: [W, 0], b: [W, H] }, { a: [W, H], b: [0, H] }, { a: [0, H], b: [0, 0] }];
const fabric = (j) => JSON.stringify([j.walls, j.openings, j.columns, j.structures]);
const door = [{ type: 'door', wall: 'W3', off: 1500, width: 900 }];   // occupies 1050–1950 on W3
const placed = (r) => Object.values(r.placed).reduce((n, p) => n + p.length, 0);

async function corrected(anchors, extra = {}) {
  const { input } = toEngineInput(anchors, { walls: room(3600, 3000), ceiling: 2500, handles: { base: 'CJ' }, sinkWidth: 900, ...extra });
  const c = await correctKitchen(input, cat, { derived: !input.drawnZones, budgetMs: 20000 });
  return { input, c, corrections: describeCorrections(input, c.input) };
}

test('a sink 200mm into a door is slid clear on its own wall and the kitchen fits', async () => {
  const { input, c, corrections } = await corrected([
    { type: 'hob', wall: 'W1', off: 1500 }, { type: 'sink', wall: 'W3', off: 2200 }, { type: 'fridge', wall: 'W0', off: 3200 }], { openings: door });
  assert.ok(fixableInput(check(input)), 'starts as a correctable input error');
  assert.deepEqual(check(c.input), []);
  assert.deepEqual(c.waived ?? [], []);
  const sink = corrections.find((x) => x.item === 'sink');
  assert.match(sink.description, /^Sink on wall W3 moved (100|200|300) mm/);
  assert.ok(withinLimits(input, c.input));
  assert.equal(fabric(c.input), fabric(input), 'walls, doors, windows and structures never move');
});

test('beyond the 300mm limit the kitchen is still drawn and the broken rule is handed back', async () => {
  // sink centred on the door: clearing it needs ~600mm, more than the designer allows
  const { input, c } = await corrected([
    { type: 'hob', wall: 'W2', off: 1800 }, { type: 'sink', wall: 'W3', off: 1500 }, { type: 'fridge', wall: 'W1', off: 600 }], { openings: door });
  assert.ok(placed(c.result) > 0, 'cabinets are placed');
  assert.ok(c.waived.some((e) => /sink is in front of a door/.test(e)), JSON.stringify(c.waived));
  assert.ok(withinLimits(input, c.input), 'no appliance changes wall or moves more than 300mm');
  assert.equal(c.input.anchors.find((a) => a.item === 'sink').wall, '3');
  assert.equal(fabric(c.input), fabric(input));
});

test('limits: an appliance never changes wall and nothing moves more than 300mm', () => {
  const { input } = toEngineInput([{ type: 'hob', wall: 'W0', off: 1500 }, { type: 'sink', wall: 'W1', off: 1500 }, { type: 'fridge', wall: 'W0', off: 3200 }],
    { walls: room(3600, 3000), ceiling: 2500, handles: { base: 'CJ' }, sinkWidth: 900 });
  const moved = (f) => { const j = structuredClone(input); f(j); return withinLimits(input, j); };
  assert.ok(moved((j) => { j.anchors[0].at += 300; }));
  assert.ok(!moved((j) => { j.anchors[0].at += 400; }));
  assert.ok(!moved((j) => { j.anchors[0].wall = '2'; }));
  assert.ok(moved((j) => { j.zones.tall[0].from -= 300; }));
  assert.ok(!moved((j) => { j.zones.tall[0].from -= 400; }));
  assert.ok(!moved((j) => { j.zones.wall = j.zones.wall.filter((z) => z.wall !== '2'); }), 'bands are never removed');
});

test('missing designer inputs are not treated as correctable layouts', () => {
  assert.equal(fixableInput(['Choose a Handle Type in Design → Extras before generating.']), false);
  assert.equal(fixableInput(['walls: a room needs at least four valid walls']), false);
  assert.equal(fixableInput([]), false);
});
