// catalog.test.mjs — run: node catalog.test.mjs
// Every code below is copied verbatim from the corrected column of the cabinet sheet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCode, validate } from '../../catalog.mjs';

// --- the grammar holds across every zone -----------------------------------
const GOOD = [
  'BC-DW-TTS-ST-XXX-2HB-XXX-450-720-560-15',
  'BC-SK-CJ-ST-XXX-LHS-XXX-600-720-560-15',
  'BC-SK-CJ-ST-XXX-2HS-XXX-1050-720-560-15',    // 1050 double bowl
  'BCL-SH-CJ-ST-1SX-RHS-XXX-450-720-336-15',
  'BB-SH-CJ-ST-1SX-RHS-XXX-1150-720-560-15',    // blind + shelf, 1150
  'BB-AC-CJ-ST-LMC-LHS-XXX-1050-720-560-15',    // LeMans corner, 1050 — a different product
  'BB-AC-TTS-ST-LMC-RHS-XXX-1050-720-560-15',   // ...also listed with the pre-rename handle
  'BBL-SH-TTS-ST-1SX-LHS-XXX-1150-720-336-15',
  'WC-SH-NHX-GL-3SG-LHS-XXX-450-1085-336-15',
  'WC-AC-NHX-ST-2SG-LHS-DSH-600-1085-336-15',
  'WB-SH-NHX-ST-3SG-RHS-XXX-900-1085-336-15',
  'TC-SH-TTS-ST-6SX-LHS-XXX-450-2400-560-15',
  'TC-SH-STD-GL-6SG-LHS-XXX-450-2400-560-15',   // glass tall, pre-rename handle
  'TC-AC-TTS-ST-1SX-RHS-TPT-600-2040-560-15',
  'TB-SH-TTS-ST-6SX-LHS-XXX-1150-2400-560-15',
  'TCL-SH-STD-GL-5SG-RHS-XXX-600-2040-336-15',
  'TLC-SH-STD-ST-6SX-XXX-XXX-1150-2400-560-15', // tall L-shape (not TCL, tall low-depth)
  'LO-SH-NHX-ST-1SX-LHS-XXX-450-600-336-15',
  'LB-SH-NHX-ST-1SX-RHS-XXX-900-600-336-15',
  'LOF-SH-NHX-ST-1SX-LHS-XXX-450-600-560-15',
  'LBF-SH-STD-ST-1SX-LHS-XXX-1050-600-560-15',  // loft blind, full depth
  'MD-RS-NHX-ST-3SG-1SX-XXX-600-1650-336-15',
];
assert.equal(validate(GOOD).bad.length, 0, 'every known-good code must parse');

// --- fields land where they should ------------------------------------------
const sink = parseCode('BC-SK-CJ-ST-XXX-LHS-XXX-600-720-560-15');
assert.deepEqual(
  { zone: sink.zone, family: sink.family, width: sink.width, height: sink.height,
    depth: sink.depth, handing: sink.handing, tall: sink.tall, blind: sink.blind },
  { zone: 'BC', family: 'SK', width: 600, height: 720, depth: 560,
    handing: 'LHS', tall: false, blind: false },
);

// handing sits in P3 on the appliance-tall rows, not P2 — must still be found
assert.equal(parseCode('TC-MO-TTS-ST-3SX-1HB-LHS-600-2400-560-15').handing, 'LHS');
// ...and in P2 everywhere else
assert.equal(parseCode('TC-SH-TTS-ST-6SX-RHS-XXX-450-2400-560-15').handing, 'RHS');
// blind + low-depth flags come from the zone, not from a column
assert.equal(parseCode('BBL-SH-CJ-ST-1SX-LHS-XXX-1150-720-336-15').blind, true);
assert.equal(parseCode('BBL-SH-CJ-ST-1SX-LHS-XXX-1150-720-336-15').lowDepth, true);

// --- STD is an alias: it resolves to the group's ordinary handle -------------
assert.equal(parseCode('TC-SH-STD-GL-6SG-LHS-XXX-450-2400-560-15').handle, 'TTS');   // tall
assert.equal(parseCode('BB-AC-TTS-ST-LMC-RHS-XXX-1050-720-560-15').handle, 'TTS');   // base
assert.equal(parseCode('LBF-SH-STD-ST-1SX-LHS-XXX-1050-600-560-15').handle, 'NHX');  // wall/loft

// --- the stated handle rule, enforced per zone group ------------------------
for (const c of GOOD.map(parseCode)) {
  if (c.handle === 'CJ')  assert.equal(c.group, 'base', `CJ on a ${c.group} unit: ${c.code}`);
  if (c.handle === 'NHX') assert.equal(c.group, 'wall', `NHX on a ${c.group} unit: ${c.code}`);
  if (c.group === 'tall') assert.equal(c.handle, 'TTS', `tall unit is not TTS: ${c.code}`);
}
assert.throws(() => parseCode('TC-SH-CJ-ST-6SX-LHS-XXX-600-2400-560-15'), /must be TTS/);

// --- the real defects in the sheet are caught -------------------------------
const BAD = [
  'TC- CF-TTS-ST-3SX-2HB-LHS-600-2400-560-15',      // stray space
  'TC-MW--TTS-ST-1SX-2HB-LHS-600-2040-560-15',      // double dash
  'MDW-SH-NHX-GL-3SG-RHS-XXX-450-1290-336-16',      // thickness 16, everything else is 15
  'BLC-SH-CJ-ST-1SX-XXX-1050-720-560-15',           // only 10 fields
  'WLC-SH-NHX-ST-3SG-XXX-900-1085-336-15',          // only 10 fields
  'BC-DW-CJ-ST-1HB-XXX-900-520-560-15',             // only 10 fields
  'BS-STD-GL-STD-1SG-XXX-XXX-720-336-15-',          // truncated, width lost
  'BC-OP-XX-XX-XXX-XXX-XXX-1800-300-336-15',        // handle and material are literal "XX"
  'TCL-SH-TTS-ST-HK-LHS-XXX-600-2400-560-15',       // zoned low-depth but carries 560
];
const { ok, bad } = validate(BAD);
assert.equal(ok.length, 0, 'no malformed code may slip through');
assert.equal(bad.length, 9);

console.log('catalog: all checks pass\n');
for (const b of bad) console.log(`  rejected  ${b.code}\n            -> ${b.error}`);

// --- the vertical stack the drawings imply ----------------------------------
const COUNTER = 850, BACKSPLASH = 565, TOP_FILLER = 100;   // 850 = 720 + 100 legs + 30 top
for (const [name, wallCode, tallCode] of [
  ['8ft', 'WC-SH-NHX-ST-3SG-LHS-XXX-600-1085-336-15', 'TC-SH-TTS-ST-6SX-LHS-XXX-600-2400-560-15'],
  ['7ft', 'WC-SH-NHX-ST-1SG-LHS-XXX-600-725-336-15',  'TC-SH-TTS-ST-5SX-LHS-XXX-600-2040-560-15'],
]) {
  const wall = parseCode(wallCode), tall = parseCode(tallCode);
  const viaWall = COUNTER + BACKSPLASH + wall.height;
  assert.equal(viaWall, tall.height + TOP_FILLER, `${name} stack does not close`);
  console.log(`${name}: ${COUNTER} + ${BACKSPLASH} + ${wall.height} = ${viaWall} = ${tall.height} + ${TOP_FILLER}`);
}

// --- rules.json stays well-formed as projects are added ---------------------
const rules = JSON.parse(readFileSync(new URL('../../rules.json', import.meta.url), 'utf8'));
const STATUSES = new Set(Object.keys(rules.status_meaning));
for (const r of rules.rules) {
  assert.ok(r.id && r.statement, `rule is missing id or statement: ${JSON.stringify(r)}`);
  assert.ok(STATUSES.has(r.status), `rule ${r.id} has unknown status "${r.status}"`);
  if (!['contested', 'stated'].includes(r.status))
    assert.ok(r.seen_in.length, `rule ${r.id} claims ${r.status} with no project behind it`);
}
// a rule that names a SKU must name a real one
for (const r of rules.rules)
  for (const code of r.catalog ?? [])
    assert.doesNotThrow(() => parseCode(code), `rule ${r.id} cites an unparseable code: ${code}`);

for (const [alias, target] of Object.entries(rules.zones.aliases))
  assert.ok(rules.zones.canonical.includes(target), `alias "${alias}" maps to unknown zone "${target}"`);

const byStatus = (s) => rules.rules.filter((r) => r.status === s).length;
console.log(`\nrules: ${byStatus('confirmed')} confirmed, ${byStatus('provisional')} provisional, ` +
            `${byStatus('contested')} contested, ${byStatus('stated')} stated`);
