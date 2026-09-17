import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fill, gate, layout, requiredStorageProblems } from '../../engine.mjs';
import { check } from '../../checkInput.mjs';
import { loadCatalog } from '../../loadCatalog.mjs';
import { RULE_PARAMS } from '../../config.mjs';
import {fixtures} from '../../verification/fixtures.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';

const input = JSON.parse(readFileSync(new URL('../../data/default-kitchen.json', import.meta.url), 'utf8'));
const { ok: catalog, mismatched } = loadCatalog();

assert.deepEqual(input.anchors.map((a) => a.item).sort(), ['fridge', 'hob', 'sink']);
assert.deepEqual(check(input), []);
assert.deepEqual(fill(950, [600, 500, 450]).cabinets.sort((a, b) => a - b), [450, 500]);
assert.deepEqual(fill(940, [900], 40, 100), { cabinets: [900], slack: 40 });
// a free run end absorbs slack instead of failing: 950 = 900 cabinet + 50, closure 25..100
assert.deepEqual(fill(950, [900], 25, 100), { cabinets: [900], slack: 50 });
assert.ok(fill(950, [900]).error, 'an explicit zero filler allowance still requires exact packing');

const result = layout(input, catalog);
for (const tier of ['base', 'wall', 'tall']) for (const p of result.placed[tier]) {
  const wall = input.walls.find((w) => w.id === p.wall);
  assert.ok(p.at >= 0 && p.at + p.width <= wall.length, `${tier} ${p.role} escaped ${p.wall}`);
}
for (const role of ['hob', 'sink', 'refrigerator', 'bottle pullout', 'grain trolley'])
  assert.ok(Object.values(result.placed).flat().some((p) => p.role === role), `${role} is missing`);
// The invariant is that glass flanks are either placed or the omission is explained — not
// that they are always omitted, which was a snapshot of a limitation rather than a rule.
assert.ok(result.placed.wall.some((p) => /glass/.test(p.role))
  || result.warnings.some((w) => /glass chimney flanks omitted/.test(w)),
  'glass chimney flanks must be placed or their omission explained');

// Regression: a blocker beyond a zone once invented a gap outside it, and the tier filled
// space it was never given. Nothing but a blocker may sit outside its own zone.
if (!result.notes.some((n) => /boundary moved/.test(n))) {
  for (const tier of ['base', 'wall', 'tall']) for (const p of result.placed[tier]) {
    if (p.blocker) continue;
    const zs = (input.zones[tier] ?? []).filter((z) => z.wall === p.wall);
    assert.ok(zs.some((z) => p.at >= z.from && p.at + p.width <= z.to),
      `${tier} "${p.role}" at ${p.at}+${p.width} on ${p.wall} is outside every ${tier} zone`);
  }
}
assert.ok(result.placed.base.find((p) => p.role === 'corner filler').width >= RULE_PARAMS.corner_filler_min);
assert.ok(mismatched.length > 0);
for (const m of mismatched)
  assert.equal(catalog.find((c) => c.code === m.code)[m.dim], m.sheet_says, 'corrected catalog dimension must be authoritative');

const smallerHob = structuredClone(input);
smallerHob.anchors.find((a) => a.item === 'hob').at = 2100;
const tightHob=layout(smallerHob,catalog);
assert.ok([600,900].includes(tightHob.placed.base.find(p=>p.role==='hob').width));
assert.ok(tightHob.problems.length||requiredStorageProblems(tightHob.placed).length===0,
  'a passing fit must include required storage even when it no longer sits directly beside the hob');

const aroundCorner = structuredClone(input);
aroundCorner.anchors.find((a) => a.item === 'sink').at = 3375;
aroundCorner.anchors.find((a) => a.item === 'hob').at = 0;
assert.ok(check(aroundCorner).some((p) => /along the countertop/.test(p)), 'adjacent-corner clearance must be checked');

const badAnchor = structuredClone(input);
badAnchor.anchors.push({ item: 'dishwasher', wall: 'AA', at: 0, width: 600 });
assert.ok(check(badAnchor).some((p) => /only hob, sink and fridge/.test(p)));

const overlappingTallZone = structuredClone(input);
overlappingTallZone.zones.tall = [{ wall: input.zones.base[0].wall, from: input.zones.base[0].from + 100, to: input.zones.base[0].from + 700 }];
assert.ok(check(overlappingTallZone).some((p) => /tall zones overlap base zones/.test(p)), 'tall zones cannot overlap base zones');
overlappingTallZone.zones.base = [];
overlappingTallZone.zones.wall = [{ wall: overlappingTallZone.zones.tall[0].wall, from: 0, to: 800 }];
assert.ok(check(overlappingTallZone).some((p) => /tall zones overlap wall zones/.test(p)), 'tall zones cannot overlap wall zones');

const edgeHob = structuredClone(input);
edgeHob.anchors.find((a) => a.item === 'hob').at = 0;
const edgeResult = layout(edgeHob, catalog);
// A hob at 0 puts its chimney 50mm past the wall start. Two outcomes are legal and nothing
// else is: the engine rejects it by name, or the anchor-tolerance pass slides the hob inward,
// SAYS so, and the chimney now sits inside the wall. What is never legal is a chimney left
// hanging past the wall with no problem raised.
const edgeChimney = edgeResult.placed.wall.find((p) => p.role === 'chimney');
const edgeRejected = edgeResult.problems.some((p) => /chimney.*outside wall|chimney.*outside its wall zone/.test(p));
const edgeRescued = edgeResult.notes.some((n) => /hob moved \+\d+mm along its wall/.test(n)) && edgeChimney && edgeChimney.at >= 0;
assert.ok(edgeRejected || edgeRescued, 'a derived chimney outside the wall must be rejected, or moved inside with the move reported');

console.log('engine: placement, anchor and boundary checks pass');

// --- hob-shape-is-designer-choice: a named shape is hard, and sizes itself ----
// The designer names WHAT each cabinet is; the engine still decides how wide. So the checks
// are: the named shape is what gets placed, no width was dictated, an unfittable choice fails
// loudly instead of being swapped out, and displacing a mandatory unit is said out loud.
const withHob = (mut) => {
  const j = JSON.parse(readFileSync(new URL('../../data/default-kitchen.json', import.meta.url), 'utf8'));
  mut(j.anchors.find((a) => a.item === 'hob'));
  return { input: j, out: layout(j, catalog) };
};
const roleOn = (r, wall, role) => r.placed.base.find((p) => p.wall === wall && p.role === role);

// nothing chosen — the mandatory pair still flanks the hob, exactly as before
const plain = withHob(() => {});
assert.ok(roleOn(plain.out, 'BB', 'grain trolley') && roleOn(plain.out, 'BB', 'bottle pullout'),
  'with no choice the engine still places the mandatory flanks');

// hob shape chosen -> that shape is the code placed, and a width was still solved for it
const shaped = withHob((h) => { h.design = '2LB+1HB'; });
const shapedHob = roleOn(shaped.out, 'BB', 'hob');
assert.match(shapedHob.code, /-2LB-1HB-/, 'the chosen hob shape must be the unit placed');
assert.ok(RULE_PARAMS.hob_widths.includes(shapedHob.width), 'the engine still chooses the width');
assert.ok(shaped.out.notes.some((n) => /hob shape "2LB\+1HB"/.test(n)), 'the choice must be logged');

// flanks chosen -> those families sit immediately beside the hob, on the side named
const flanked = withHob((h) => { h.flanks = { left: 'AP:OVN+1FP', right: 'AC:WBP+1HF' }; });
const fHob = roleOn(flanked.out, 'BB', 'hob');
const oven = roleOn(flanked.out, 'BB', 'oven unit'), bin = roleOn(flanked.out, 'BB', 'waste bin');
assert.ok(oven && bin, 'both chosen flank shapes must be placed');
assert.match(oven.code, /^BC-AP-/); assert.match(bin.code, /^BC-AC-/);
assert.equal(oven.at + oven.width, fHob.at, 'the left flank must touch the hob');
assert.equal(bin.at, fHob.at + fHob.width, 'the right flank must touch the hob');
assert.ok(flanked.out.placed.base.some(p=>p.role==='grain trolley')||flanked.out.problems.some(p=>/grain trolley/.test(p)),
  'grain trolley must be relocated or reported missing, never waived by flank choices');
assert.ok(!flanked.out.warnings.some(w=>/displaced/.test(w)));

// one side only -> the other is still the engine's, and the loss is reported
const half = withHob((h) => { h.flanks = { right: 'AC:TR' }; });
assert.ok(roleOn(half.out, 'BB', 'tray unit'), 'the named side is honoured');
assert.ok(roleOn(half.out, 'BB', 'grain trolley'), 'the unnamed side stays with the engine');
assert.ok(!half.out.warnings.some(w=>/lost its place beside the hob/.test(w)));

// a shape the catalogue cannot supply is a HARD failure naming the choice — never a swap
const bogus = withHob((h) => { h.design = '9ZZ'; });
assert.ok(bogus.out.problems.some((p) => /chosen shape "9ZZ"/.test(p)),
  'an impossible shape must be rejected by name');
assert.ok(!roleOn(bogus.out, 'BB', 'hob')?.code, 'and no other shape may be substituted for it');
assert.equal(gate(bogus.out).verdict, 'REJECTED');

// the input guard: shapes name a configuration, never a dimension, and only the hob takes them
assert.deepEqual(check(withHob((h) => { h.design = '2LB+1HB'; h.flanks = { right: 'GD:1BL+1HF' } }).input), []);
assert.ok(check(withHob((h) => { h.design = 600; }).input).some((p) => /hob design must be a shape/.test(p)));
assert.ok(check(withHob((h) => { h.flanks = { right: '600mm' }; }).input).some((p) => /FAMILY:SHAPE/.test(p)));
assert.ok(check(withHob((h) => { h.flanks = { middle: 'GD:1BL+1HF' }; }).input).some((p) => /left or right/.test(p)));
const onSink = JSON.parse(readFileSync(new URL('../../data/default-kitchen.json', import.meta.url), 'utf8'));
onSink.anchors.find((a) => a.item === 'sink').design = '2HS';
assert.ok(check(onSink).some((p) => /only the hob takes a design/.test(p)));

console.log('hob shape: designer choice is placed, sized by the engine, and hard when it cannot fit');

// --- no-overlap invariant, blind-corner snapping, anchor tolerance -------------
import { overlapProblems } from '../../engine.mjs';

// An independent scan, NOT the engine's own overlapProblems(), so the test cannot pass by
// the engine agreeing with itself.
const intersections = (placed) => {
  const out = [];
  for (const tier of ['base', 'wall', 'tall']) {
    const items = placed[tier] ?? [];
    for (let i = 0; i < items.length; i++) for (let k = i + 1; k < items.length; k++) {
      const p = items[i], q = items[k];
      if (p.wall === q.wall && Math.min(p.at + p.width, q.at + q.width) > Math.max(p.at, q.at))
        out.push(`${tier}/${p.wall}: ${p.role} x ${q.role}`);
    }
  }
  return out;
};
const rect = (W, H, anchors, tallOn = '1') => {
  const walls = [{ id: '0', length: W, dir: 'E' }, { id: '1', length: H, dir: 'S' },
    { id: '2', length: W, dir: 'W' }, { id: '3', length: H, dir: 'N' }];
  const cabinetRuns = walls.filter((w) => w.id !== tallOn);
  return { project: 't', height: '8ft', handle: 'CJ', walls, openings: [], columns: [], anchors,
    zones: { base: cabinetRuns.map((w) => ({ wall: w.id, from: 0, to: w.length })),
      wall: cabinetRuns.map((w) => ({ wall: w.id, from: 0, to: w.length })),
      tall: [{ wall: tallOn, from: 0, to: walls.find((w) => w.id === tallOn).length }] } };
};
const centred = (W, H) => [
  { item: 'sink', wall: '0', at: Math.round(W / 2 - 450), width: 900 },
  { item: 'hob', wall: '2', at: Math.round(W / 2 - 450), width: 900 },
  { item: 'fridge', wall: '1', at: Math.round(H / 2 - 300), width: 600 }];

// 1. nothing intersects, on any tier, in any sample project or any room of the sweep — this
//    was 88 of 88 rooms overlapping before corners() learned that a tall unit reaches down
for (const f of ['data/default-kitchen.json']) {
  const j = JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
  assert.deepEqual(intersections(layout(j, catalog).placed), [], `${f} must have no overlapping units`);
}
for (let W = 2400; W <= 5400; W += 600) for (let H = 2400; H <= 4500; H += 700)
  assert.deepEqual(intersections(layout(rect(W, H, centred(W, H)), catalog).placed), [], `${W}x${H} must have no overlapping units`);
// the backstop itself catches a hand-made overlap by name
assert.match(overlapProblems({ base: [{ wall: 'X', at: 0, width: 600, role: 'a' }, { wall: 'X', at: 500, width: 600, role: 'b' }], wall: [], tall: [] })[0],
  /X\/base: "a" 0\.\.600 and "b" 500\.\.1100 overlap by 100mm/);

// 2. blind-corner snapping: on the leg that did NOT take the corner unit the run reads
//    filler >= corner_filler_min, then an ordinary NON-blind cabinet — a tall tower counts,
//    a second blind unit, a panel, a trim piece or nothing at all does not
{
  const j = JSON.parse(readFileSync('verification/filler-3600-input.json','utf8'));
  const r = layout(j, catalog);
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  assert.ok(!r.problems.some((p) => /^corner on/.test(p)), `snapping must hold: ${r.problems.filter((p) => /corner/.test(p)).join(' | ')}`);
  const corners = r.placed.base.filter((p) => /corner$/.test(p.role) && !/filler/.test(p.role));
  assert.ok(corners.length >= 2, 'the room must actually have corner units to test against');
  // A wall can carry the corner unit at one end and be the "other leg" at the other, so the
  // check is per END, not per wall: wherever a run ends in a corner filler, look inward.
  let checked = 0;
  for (const w of j.walls) {
    const row = r.placed.base.filter((p) => p.wall === w.id && p.role !== 'corner void').sort((a, b) => a.at - b.at);
    for (const [filler, next] of [[row[0], row[1]], [row.at(-1), row.at(-2)]]) {
      if (!filler || !/corner filler/.test(filler.role)) continue;
      checked++;
      assert.ok(filler.width >= RULE_PARAMS.corner_filler_min, `corner filler ${filler.width} under minimum`);
      const unit = next.blocker && / \(tall above\)$/.test(next.role)
        ? r.placed.tall.find((t) => !t.blocker && t.wall === next.wall && t.at === next.at) : next;
      assert.ok(unit && unit.code && !unit.trim && !unit.blocker, `after the corner filler on ${w.id} must be a cabinet, got "${next.role}"`);
      assert.ok(!byCode.get(unit.code)?.blind, `after the corner filler on ${w.id} must not be a blind unit, got ${unit.code}`);
    }
  }
  assert.ok(checked >= 1, 'at least one corner-adjacent leg must have been checked');
}

// 3. anchor tolerance — to improve packing, along the same wall, reported,
//    capped, and never past a keep-out
{
  const tol = RULE_PARAMS.anchor_tolerance;
  assert.ok(tol > 0, 'params.anchor_tolerance must be set');
  // a) a run that misses closing by a little is rescued by the smallest reported slide
  const near = runEndFixture();
  near.lockAnchors=false; near.lockZones=false;
  near.anchors.find(a=>a.item==='hob').at+=25;
  const rescued = layout(near, catalog);
  const move = rescued.notes.find((n) => /^(hob|sink|fridge) moved ([+-]\d+)mm along its wall/.test(n));
  assert.ok(move, `expected a reported anchor slide within tolerance, notes: ${rescued.notes.join(' | ')}`);
  assert.equal(rescued.problems.length, 0, 'the slide must actually close the layout');
  assert.ok(Math.abs(+move.match(/([+-]\d+)mm/)[1]) <= tol, 'a move may never exceed the tolerance');
  // b) the same room with the fridge already where the engine slid it: closes untouched
  const to = +move.match(/-> (\d+)\)/)[1];
  const settled = structuredClone(near);
  settled.anchors.find(a=>a.item===move.split(' ')[0]).at=to;
  const asIs = layout(settled, catalog);
  assert.equal(asIs.problems.length, 0);
  for(const note of asIs.notes.filter(n=>/moved .* along its wall/.test(n)))
    assert.ok(Math.abs(+note.match(/moved ([+-]\d+)mm/)[1])<=tol,'further improvement stays within the original tolerance');
}
console.log('invariants: no overlaps, blind corners snap, reported anchor improvements stay within tolerance');

// --- R29 release gate: hard failure beats unknown, unknown still blocks -------
assert.equal(gate({ problems: ['x'], unresolved: ['y'] }).verdict, 'REJECTED');
assert.equal(gate({ unresolved: ['y'] }).verdict, 'UNRESOLVED');
assert.equal(gate({ unresolved: ['y'] }).releaseBlocked, true);
assert.equal(gate({ warnings: ['soft'] }).verdict, 'FEASIBLE');
assert.equal(gate({ warnings: ['soft'] }).releaseBlocked, false);
console.log('gate: REJECTED / UNRESOLVED / FEASIBLE outcomes correct');
