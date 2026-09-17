// lib/libraryApi.js — the cabinet library for the editing sidebar (Stage 6.4) and the
// re-price of a manually edited plan (Stage 6 + live pricing groundwork). Written once,
// mounted by both servers; plain Node req/res primitives throughout.
//
//   GET  /api/library?series=&pg=&finish=   -> { entries, zoneAccessories, count }
//        One entry per distinct module (baseCode + size), deduped across the _LH/_RH
//        handing and _CJ/_EH handle variants, each with an indicative price = front
//        face sqft × the chosen finish rate (the same saleable model the plan uses).
//        `inSeries` says whether the chosen series' catalogue carries it — the
//        cross-series checkbox in the sidebar simply stops filtering on it.
//
//   POST /api/reprice { runs, tiers, island, pg, finish, seriesId } -> { price, bom, warnings }
//        Pure function over an (edited) plan: recompute the saleable price, the BOM
//        (preferring an explicit seg.code a replacement set over the generic mapping),
//        and off-catalogue warnings. No storage, no side effects.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceSaleable } from './saleablePricing.js';
import { shutterRates } from './pricingConfig.js';
import { getSeries, seriesAllowsCode, offCatalogWarnings, seriesFinishGroup } from './series.js';
import { ZONE_ACCESSORIES } from './accessories.js';
import { elevSpec } from './elevations.js';
import { readJsonBody } from './apiRuntime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQFT = 92903; // mm² per sqft — same constant the saleable pricing uses

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

let entriesCache = null;
// Distinct modules from the generated GLB manifest: dedupe handing/handle variants so the
// sidebar lists products, not files. Cached per process (manifest changes need a restart).
function libraryEntries() {
  if (entriesCache) return entriesCache;
  const manifest = JSON.parse(readFileSync(join(ROOT, 'data', 'module-models.json'), 'utf8'));
  const byKey = new Map();
  for (const m of manifest.models || []) {
    if (!m.code || !m.w || !m.h) continue;   // accessories/no-code files are not library modules
    const key = `${m.baseCode}|${m.w}x${m.h}x${m.d}|${m.category}`;
    const cur = byKey.get(key);
    if (cur) { cur.variants += 1; continue; }
    byKey.set(key, {
      code: m.baseCode, category: m.category, w: m.w, h: m.h, d: m.d,
      variants: 1, sample: m.code,
    });
  }
  entriesCache = [...byKey.values()].sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code) || a.w - b.w);
  return entriesCache;
}

export async function handleLibrary(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET /api/library?series=&pg=&finish=' });
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const series = getSeries(q.get('series'));
    const rates = shutterRates();
    let pg = rates[q.get('pg')] ? q.get('pg') : (series?.defaultFinish?.pg || 'PG1');
    pg = seriesFinishGroup(series, pg);   // the finish group is fixed by the series
    const finish = rates[pg][q.get('finish')] ? q.get('finish') : 'Classic';
    const rate = rates[pg][finish];
    const entries = libraryEntries().map((e) => ({
      ...e,
      shutterSqft: +((e.w * e.h) / SQFT).toFixed(2),
      price: Math.round(((e.w * e.h) / SQFT) * rate),
      inSeries: series ? seriesAllowsCode(series, e.code) : true,
    }));
    return json(res, 200, { entries, count: entries.length, pg, finish, rate, zoneAccessories: ZONE_ACCESSORIES });
  } catch (e) {
    return json(res, (e && e.status) || 500, { error: String((e && e.message) || e) });
  }
}

// BOM over a possibly-edited plan. Mirrors the /api/build mapping for untouched segments;
// a replacement's explicit seg.code always wins.
export function bomOf(plan, island) {
  const bom = {};
  const bump = (c) => { if (!c) return; const k = String(c).split(' (')[0]; bom[k] = (bom[k] || 0) + 1; };
  const hobBase = (v) => (elevSpec('hob', v).cooktop === 600 ? 'BC1EL1EH' : 'BC2EL1EH');
  for (const r of plan.runs || []) {
    const TALL_ANCHOR = (s) => s.kind === 'anchor' && ['fridge', 'oven', 'pantry', 'crockery'].includes(s.label);
    for (const s of r.segments || []) {
      if(s.kind==='tallBank'){ for(const u of s.units||[]) if(!u.loose) bump(u.code||s.code); continue; }
      if(s.label==='dishwasher') continue;
      if (!['cabinet', 'anchor', 'corner'].includes(s.kind) || TALL_ANCHOR(s)) continue;
      bump(s.code ? s.code : s.label === 'hob' ? hobBase(s.variant) : s.label === 'sink' ? 'BSC1HS' : s.kind === 'corner' ? 'S140_BBC1S1HS' : 'BC2EH');
    }
    const t = plan.tiers?.[r.key];
    if (t) { for (const w of t.wall || []) bump(w.code); for (const l of t.loft || []) bump(l.code); for (const x of t.tall || []) bump(x.code); }
  }
  if (island) for (const s of [...(island.working || []), ...(island.seating || [])]) bump(s.code);
  return bom;
}

export async function handleReprice(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST {runs, tiers, island, pg, finish, seriesId} to /api/reprice.' });
  try {
    const body = await readJsonBody(req, 8 * 1024 * 1024);
    const plan = { runs: body.runs || [], tiers: body.tiers || {}, island: body.island || null };
    const series = getSeries(body.seriesId);
    const price = priceSaleable(plan, { pg: seriesFinishGroup(series, body.pg), finish: body.finish });
    const bom = bomOf(plan, body.island || null);
    const warnings = series ? offCatalogWarnings(bom, series) : [];
    return json(res, 200, { price, bom, warnings });
  } catch (e) {
    return json(res, (e && e.status) || 500, { error: String((e && e.message) || e) });
  }
}
