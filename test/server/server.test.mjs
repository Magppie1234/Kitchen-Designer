// server.test.mjs — the UI <-> engine adapter. Both halves of it have already been wrong
// once in ways that showed up as a blank screen rather than an error, so they are pinned here:
//
//   toEngineInput  the UI's along-wall `off` is a CENTRE, the engine's `at` is a LEFT EDGE.
//                  Passing one as the other shifts every fixture half its own width and the
//                  engine rejects layouts that are actually fine.
//   toPlan         every view indexes walls with +run.key.slice(1) and lays base segments out
//                  by accumulating width from the wall start. A run without a `key`, or a
//                  segment list with a hole in it, breaks the 2D plan and the 3D scene.
import test from 'node:test';
import assert from 'node:assert';
import { toEngineInput, toPlan } from '../../server.mjs';
import { loadCatalog } from '../../loadCatalog.mjs';
import { layout } from '../../engine.mjs';

const W = 4500, H = 3000;
const walls = [
  { a: [0, 0], b: [W, 0], length: W },
  { a: [W, 0], b: [W, H], length: H },
  { a: [W, H], b: [0, H], length: W },
  { a: [0, H], b: [0, 0], length: H },
];
const options = {
  walls, ceiling: 2500,
  openings: [{ type: 'door', wall: 'W3', off: 1500, width: 1000 }],
};
const anchors = [
  { type: 'sink', wall: 'W0', off: 3650 },
  { type: 'hob', wall: 'W2', off: 1200 },
  { type: 'fridge', wall: 'W1', off: 1500 },
];

test('toEngineInput: UI centres become engine left edges without hiding invalid positions', () => {
  const { input } = toEngineInput(anchors, options);

  const sink = input.anchors.find((a) => a.item === 'sink');
  // 900 wide centred at 3650 -> 3200..4100, inside the 4500 wall. Read as a left edge it
  // would be 3650..4550 — off the end, which is exactly how this failed before.
  assert.equal(sink.at, 3200);
  assert.equal(sink.at + sink.width, 4100);
  assert.equal(sink.wall, '0', 'the W prefix is the UI\'s, not the engine\'s');

  const hob = input.anchors.find((a) => a.item === 'hob');
  assert.equal(hob.at, 750);          // 900 wide centred at 1200

  const door = input.openings[0];
  assert.equal(door.at, 1000);        // 1000 wide centred at 1500
  assert.equal(door.width, 1000);

  // a fixture centred hard against a corner is pulled back inside rather than overhanging
  const { input: edge } = toEngineInput([{ type: 'sink', wall: 'W1', off: 2950 }], options);
  const s = edge.anchors[0];
  assert.equal(s.at + s.width, 3400, 'an invalid centre must reach validation unchanged');
  assert.ok(s.at >= 0);
});

test('toEngineInput: the designer\'s drawn cabinet bands are the zones, not an assumption', () => {
  // The zone tool draws per wall at the engine's own three tiers and sends {wall,tier,s,e}.
  // These were being dropped and replaced with bands derived from the wall lengths, so the
  // engine filled spans the designer never asked for and ignored the ones they did.
  const zones = [
    { wall: 'W0', tier: 'base', s: 0, e: 3000 },
    { wall: 'W0', tier: 'wall', s: 500, e: 2500 },
    { wall: 'W1', tier: 'tall', s: 0, e: 1800 },
  ];
  const { input, notes } = toEngineInput(anchors, { ...options, zones });

  assert.deepEqual(input.zones.base, [{ wall: '0', from: 0, to: 3000 }]);
  assert.deepEqual(input.zones.wall, [{ wall: '0', from: 500, to: 2500 }]);
  assert.deepEqual(input.zones.tall, [{ wall: '1', from: 0, to: 1800 }]);
  assert.ok(notes.some((n) => /using the 3 you drew/.test(n)), 'the log must say the drawn bands were used');

  // a band running off the end of its wall is clamped, not passed through as an invalid span
  const { input: over } = toEngineInput(anchors, { ...options, zones: [{ wall: 'W1', tier: 'base', s: -200, e: 9999 }] });
  assert.deepEqual(over.zones.base, [{ wall: '1', from: 0, to: H }]);

  // with nothing drawn the fallback still runs, and says so
  const { input: none, notes: n2 } = toEngineInput(anchors, options);
  assert.ok(none.zones.base.length, 'a room with no drawn bands still gets furnished');
  assert.ok(n2.some((n) => /none drawn/.test(n)), 'the log must admit the bands were assumed');
});

test('toEngineInput: designer choices the engine cannot read are named, not silently dropped', () => {
  const { notes } = toEngineInput(anchors, { ...options, kubos: true, keeps: [{ wall: 'W0' }], islandType: 'storage' });
  const ignored = notes.filter((n) => n.startsWith('not applied:'));
  assert.equal(ignored.length, 3, `expected 3 ignored choices, got: ${JSON.stringify(ignored)}`);
  assert.ok(ignored.some((n) => /KUBOS/.test(n)) && ignored.some((n) => /[Pp]inned/.test(n)));
});

test('toPlan: every run is keyed and its segments tile the wall exactly', () => {
  const { ok: cat } = loadCatalog();
  const { input, notes } = toEngineInput(anchors, options);
  const plan = toPlan(layout(input, cat), input, notes, { pg: 'PG1', finish: 'Classic' });

  assert.equal(plan.runs.length, walls.length);
  for (const r of plan.runs) {
    assert.match(r.key, /^W\d+$/, 'the views do walls[+run.key.slice(1)]');
    assert.ok(walls[+r.key.slice(1)], `${r.key} must index a real wall`);

    // no holes: the renderers accumulate width from the wall start, so a missing span
    // would silently slide every later cabinet down the wall
    const sum = r.segments.reduce((s, x) => s + x.width, 0);
    assert.equal(sum, walls[+r.key.slice(1)].length, `${r.key} segments must tile the wall`);
    for (const s of r.segments) assert.ok(s.width > 0 && s.kind, 'every segment needs a kind and a width');
    // the elevation positions by x0 and never accumulates, so x0/x1 must already equal the
    // accumulated widths on a FRESH plan — not only after the editor's reindex() has run
    let acc = 0;
    for (const s of r.segments) {
      assert.equal(s.x0, acc, `${r.key}: "${s.label ?? s.kind}" x0 ${s.x0} != accumulated ${acc}`);
      assert.equal(s.x1, acc + s.width, `${r.key}: "${s.label ?? s.kind}" x1 must be x0 + width`);
      acc += s.width;
    }

    // the wall tier is positioned by its own x0, never mirrored off the base row
    assert.ok(plan.tiers[r.key], `${r.key} needs a tier entry`);
    for (const u of plan.tiers[r.key].wall) assert.ok(u.x0 != null && u.width > 0, 'wall units carry x0');
    // the tall band already rides in the base row; counting it here too doubles it in the price
    assert.equal(plan.tiers[r.key].tall.length, 0);
  }

  const anchored = plan.runs.flatMap((r) => r.segments.filter((s) => s.kind === 'anchor').map((s) => s.label));
  assert.ok(anchored.includes('hob') && anchored.includes('sink'), 'anchors must survive into the plan');
  assert.ok(plan.runs.some((r) => r.segments.some((s) => s.kind === 'tallBank' && s.units?.length)),
    'the fridge must produce a typed tall band');
  assert.ok(plan.price.breakdown.total > 0, 'a plan with cabinets must price');
});

console.log('adapter: UI centres convert, runs are keyed, segments tile, tiers carry x0');

test('corner occupancy reservations never become cabinets, thumbnails or saleable shutters',()=>{
  const {input}=toEngineInput([],options);
  for(const role of ['perpendicular cabinet footprint','unresolved corner reservation']){
    const marker={wall:input.walls[0].id,at:0,width:380,role,blocker:true,code:null};
    const plan=toPlan({placed:{base:[marker],wall:[marker],tall:[]},notes:[],problems:[],unresolved:[],warnings:[]},input,[],{pg:'PG1',finish:'Classic'});
    const seg=plan.runs[0].segments[0];
    assert.equal(seg.kind,'gap');assert.equal(seg.width,380);
    assert.equal(seg.x0,0);assert.equal(seg.x1,380);
    assert.equal(plan.runs[0].segments.reduce((sum,s)=>sum+s.width,0),W,'reserved width still advances the run');
    assert.deepEqual(plan.tiers.W0.wall,[]);
    assert.deepEqual(plan.bom,{});
    assert.equal(plan.price.breakdown.total,0);
  }
});
