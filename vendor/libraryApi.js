// lib/libraryApi.js — the cabinet library for the editing sidebar (Stage 6.4) and the
// re-price of a manually edited plan (Stage 6 + live pricing groundwork). Written once,
// mounted by both servers; plain Node req/res primitives throughout.
//
//   GET  /api/library?series=&pg=&finish=   -> { entries, zoneAccessories, count }
//        One entry per workbook cabinet code, each priced as the Quote tab prices it:
//        series rate × workbook Carcass Net Sqft.
//        `inSeries` says whether the chosen series' catalogue carries it — the
//        cross-series checkbox in the sidebar simply stops filtering on it.
//
//   POST /api/reprice { runs, tiers, island, pg, finish, seriesId } -> { price, bom, warnings }
//        Pure function over an (edited) plan: recompute the saleable price, the BOM
//        (preferring an explicit seg.code a replacement set over the generic mapping),
//        and off-catalogue warnings. No storage, no side effects.
import { loadCatalog } from '../core/loadCatalog.mjs';
import { categoryOf, modelManifest } from '../core/models.mjs';
import { priceSaleable } from './saleablePricing.js';
import { getSeries, seriesAllowsCode, offCatalogWarnings, seriesFinishGroup } from './series.js';
import { ZONE_ACCESSORIES } from './accessories.js';
import { readJsonBody } from './apiRuntime.js';


const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

// The library is the workbook catalogue itself, each entry joined to its GLB in Models/ (path
// is null when no model file carries that code). Rebuilt per request so model files dropped
// into Models/ show up without a restart, like /api/models.
function libraryEntries() {
  const catalog = loadCatalog().ok;
  const pathOf = new Map(modelManifest(catalog).models.filter((m) => m.code).map((m) => [m.code, m.path]));
  return catalog
    .map((c) => ({ code: c.code, category: categoryOf(c), w: c.width, h: c.height, d: c.depth, sample: c.code,
      carcassSqft: c.carcassSqft, profiles: c.profiles, unitType: c.unitType, subType: c.subType,
      familyName: c.familyName, description: c.description, path: pathOf.get(c.code) ?? null }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code) || a.w - b.w);
}

export async function handleLibrary(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET /api/library?series=&pg=&finish=' });
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const series = getSeries(q.get('series'));
    const pg = seriesFinishGroup(series, q.get('pg') || series?.defaultFinish?.pg || 'PG1');   // the finish group is fixed by the series
    const finish = ['Classic', 'Modern'].includes(q.get('finish')) ? q.get('finish') : 'Classic';
    // Same basis as the Quote tab: series rate × workbook Carcass Net Sqft.
    const rate = series?.startingRatePerSqft ?? null;
    const entries = libraryEntries().map((e) => ({
      ...e,
      price: rate == null || e.carcassSqft == null ? null : Math.round(e.carcassSqft * rate),
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
  for (const r of plan.runs || []) {
    const TALL_ANCHOR = (s) => s.kind === 'anchor' && ['fridge', 'oven', 'pantry', 'crockery'].includes(s.label);
    for (const s of r.segments || []) {
      if(s.kind==='tallBank'){ for(const u of s.units||[]) if(!u.loose) bump(u.code||s.code); continue; }
      if(s.label==='dishwasher') continue;
      if (!['cabinet', 'anchor', 'corner'].includes(s.kind) || TALL_ANCHOR(s)) continue;
      bump(s.code);
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
    plan.bom = bomOf(plan, body.island || null);
    const price = priceSaleable(plan, { seriesId: series?.id });
    const bom = plan.bom;
    const warnings = series ? offCatalogWarnings(bom, series) : [];
    return json(res, 200, { price, bom, warnings });
  } catch (e) {
    return json(res, (e && e.status) || 500, { error: String((e && e.message) || e) });
  }
}
