// loadCatalog.mjs — the cabinet catalogue, read from data/workbook.json.
//
// data/workbook.json is a verbatim export of the authoritative workbook ("Temp By Dhruv (2).xlsm",
// the export script was deleted 2026-09-30, so workbook changes are now copied in by hand). Codes come from its “Corrections by Rashmi” column; every
// other field (family, type, dimensions, carcass net sqft, shutter-profile availability) is the
// workbook's own value, never recomputed here.
import { readFileSync } from 'node:fs';
import { parseCode } from './catalog.mjs';

const CODE = 'Cabinet Code (Corrections by Rashmi)';
// The workbook writes "—" as U+FFFD in a few text cells; that and empty cells mean "no value".
const val = (v) => (v == null || v === '�' || v === '' ? null : v);

export function readWorkbook(path = new URL('../data/workbook.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadCatalog(wb = readWorkbook()) {
  if (typeof wb === 'string' || wb instanceof URL) wb = readWorkbook(wb);
  const matrixOf = new Map();
  for (const m of wb.matrix) for (const c of m.codes) if (!matrixOf.has(c)) matrixOf.set(c, m);
  const ok = [], bad = [], mismatched = [];

  for (const r of wb.cabinets) {
    const code = String(r[CODE]).trim();
    let unit;
    try { unit = parseCode(code); } catch (e) { bad.push({ code, row: r._row, error: e.message }); continue; }

    // The workbook's dimension columns are authoritative, including corrections whose code
    // text still carries an older size.
    for (const [dim, col] of [['width', 'Width'], ['height', 'Height'], ['depth', 'Depth']]) {
      const sheet = Number(r[col]);
      if (Number.isFinite(sheet) && sheet > 0) {
        if (sheet !== unit[dim]) mismatched.push({ code, dim, code_says: unit[dim], sheet_says: sheet });
        unit[dim] = sheet;
      }
    }
    const m = matrixOf.get(code);
    ok.push(Object.assign(unit, {
      row: r._row,
      description: val(r.Description),
      zoneKey: val(r['Zone Key']),
      familyKey: val(r['Family Key']),
      familyName: val(r['Family Name']),
      variant: val(r['Variant Label']),
      skirting: val(r.SKRT) ?? 0,
      shutterSqft: val(r['Shutter Sqft']),
      carcassSqft: val(r['Carcass Net Sqft']),
      // Shutter profiles (the workbook's "Design …" columns) this cabinet is offered in. A blank
      // cell is "not defined", which is not a Yes, so the cabinet is not offered in that profile.
      profiles: Object.keys(wb.designs).filter((d) => r[`Design ${d}`] === 'Yes'),
      unitType: m?.unitType ?? null,
      subType: m?.subType ?? null,
      cabinetType: m?.cabinetType ?? null,
    }));
  }
  const inCabinets = new Set(wb.cabinets.map((r) => String(r[CODE]).trim()));
  const matrixOnly = [...matrixOf.keys()].filter((c) => !inCabinets.has(c));
  return { ok, bad, mismatched, matrixOnly, designs: wb.designs };
}

if (process.argv[1]?.endsWith('loadCatalog.mjs')) {
  const { ok, bad, mismatched, matrixOnly } = loadCatalog();
  console.log(`parsed ${ok.length} cabinets, ${bad.length} rejected, ${mismatched.length} code/column mismatches\n`);
  for (const b of bad) console.log(`  REJECT  row ${b.row} ${b.code}\n          ${b.error}`);
  for (const m of mismatched) console.log(`  MISMATCH ${m.code}\n           ${m.dim}: code says ${m.code_says}, sheet says ${m.sheet_says}`);
  for (const c of ok.filter((u) => !u.profiles.length)) console.log(`  NO PROFILE  row ${c.row} ${c.code} (Design columns blank/No)`);
  for (const c of ok.filter((u) => !u.unitType)) console.log(`  NOT IN MATRIX  row ${c.row} ${c.code}`);
  for (const c of matrixOnly) console.log(`  MATRIX ONLY  ${c} (listed in "Modules Matrix + Codes" but no Cabinets row)`);
}
