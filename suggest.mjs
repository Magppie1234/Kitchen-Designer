// suggest.mjs — the designer places the hob; this says whether that position can actually be
// built, and if not, which nearby positions can.
//
// Why this exists: the gaps around the hob are NOT independent. Moving the hob changes four
// gaps at once — base-left, base-right, wall-left, wall-right — because the chimney group is
// 1800mm wide while the hob group is 900mm, and both are centred on the same point. So the
// per-gap DP cannot fix a bad hob position; only moving the hob can.
import { readFileSync } from 'node:fs';
import { loadCatalog } from './loadCatalog.mjs';
import { layout } from './engine.mjs';
import { check } from './checkInput.mjs';

const STEP = 5;

const input = JSON.parse(readFileSync(process.argv[2] ?? 'data/default-kitchen.json', 'utf8'));
const { ok: cat } = loadCatalog();
const hob = input.anchors.find((a) => a.item === 'hob');
if (!hob) { console.log('no hob in this input'); process.exit(0); }

const zone = input.zones.base.find((z) => z.wall === hob.wall);
if (!zone) { console.log(`no base zone contains the hob on wall ${hob.wall}`); process.exit(1); }
const at = (v, fast = true) => {
  const trial = structuredClone(input);
  trial.anchors.find((a) => a.item === 'hob').at = v;
  return [...check(trial), ...layout(trial, cat, { fast }).problems];
};

const asked = at(hob.at, false);
console.log(`\nhob on wall ${hob.wall} at ${hob.at} (width solved automatically: 900, then 600)\n`);
if (!asked.length) {
  console.log('  this position works — nothing to change\n');
  process.exit(0);
}
for (const p of asked) console.log(`  x ${p}`);

const trials = [];
for (let v = zone.from; v + hob.width <= zone.to; v += STEP) trials.push({ v, problems: at(v) });
const related = (p) => p.startsWith(`${hob.wall}/`) || /\bhob\b|hob-sink/.test(p);
const invariant = [...new Set(asked.filter((p) => !related(p)))];
const ok = trials.filter((t) => t.problems.every((p) => !related(p))).map((t) => t.v);

// collapse runs of consecutive feasible positions into ranges
const ranges = [];
for (const v of ok) {
  const last = ranges.at(-1);
  if (last && v - last[1] === STEP) last[1] = v;
  else ranges.push([v, v]);
}

console.log(`\n  scanned ${zone.from}..${zone.to - hob.width} in ${STEP}mm steps`);
if (invariant.length) {
  console.log('  unrelated blockers (do not make the hob track red):');
  for (const p of invariant) console.log(`    ! ${p}`);
}
if (!ranges.length) console.log('  NO position on this wall works — something other than the hob has to move\n');
else {
  console.log('  positions that work:');
  for (const [a, b] of ranges) console.log(`    ${a === b ? a : `${a} - ${b}`}`);
  const nearest = ok.reduce((n, v) => (Math.abs(v - hob.at) < Math.abs(n - hob.at) ? v : n));
  console.log(`\n  nearest to what you asked for: ${nearest} (${Math.abs(nearest - hob.at)}mm away)\n`);
}
