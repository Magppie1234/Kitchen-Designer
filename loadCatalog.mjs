// loadCatalog.mjs — read cabinets.csv into parsed catalog rows.
//
// The supplied catalog's “Corrections by Rashmi” column is the only authoritative code source.
import { readFileSync } from 'node:fs';
import { parseCode } from './catalog.mjs';

const COL = { corrected: 2, width: 15, height: 16, depth: 17 };

// Minimal CSV split — handles quoted fields, which the legend rows at the bottom use.
function splitCsv(text) {
  const rows = [[]]; let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows.at(-1).push(field); field = ''; }
    else if (c === '\n') { rows.at(-1).push(field); field = ''; rows.push([]); }
    else if (c !== '\r') field += c;
  }
  rows.at(-1).push(field);
  return rows;
}

export function loadCatalog(path = new URL('./cabinets.csv', import.meta.url)) {
  const rows = splitCsv(readFileSync(path, 'utf8')).slice(2);   // drop the two header lines
  const ok = [], bad = [], mismatched = [];

  for (const r of rows) {
    const code = (r[COL.corrected] || '').trim();
    if (!code || !code.includes('-')) continue;                  // blank rows and the legend
    let unit;
    try { unit = parseCode(code); } catch (e) { bad.push({ code, error: e.message }); continue; }

    // The catalog columns are authoritative for dimensions, including corrections whose
    // code text still carries an older size.
    for (const dim of ['width', 'height', 'depth']) {
      const sheet = Number(r[COL[dim]]);
      if (Number.isInteger(sheet)) {
        if (sheet !== unit[dim]) mismatched.push({ code, dim, code_says: unit[dim], sheet_says: sheet });
        unit[dim] = sheet;
      }
    }
    ok.push(unit);
  }
  return { ok, bad, mismatched };
}

if (process.argv[1]?.endsWith('loadCatalog.mjs')) {
  const { ok, bad, mismatched } = loadCatalog();
  console.log(`parsed ${ok.length} cabinets, ${bad.length} rejected, ${mismatched.length} code/column mismatches\n`);
  for (const b of bad) console.log(`  REJECT  ${b.code}\n          ${b.error}`);
  console.log();
  for (const m of mismatched) console.log(`  MISMATCH ${m.code}\n           ${m.dim}: code says ${m.code_says}, sheet says ${m.sheet_says}`);
}
