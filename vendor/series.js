// lib/series.js — the series master (data/series.json): Stage 2 of the design flow.
//
// A room commits to exactly one series before anything can be generated; the series decides
// which SKUs the generator/library/pricing may offer, carries the carcass (never a designer
// choice) and the available handle families. Series are pure configuration — adding a fourth
// is a data change; nothing here or anywhere else may enumerate series ids in code.
//
// Catalog forms supported (see data/series.json):
//   "full"                    — every code in the model manifest
//   { "skuCodes": [ ... ] }   — an explicit allow-list (codes matched on their base form,
//                               handing suffix _LH/_RH and the "(HxWxD)" tail stripped)
//
// Also owns GET /api/config — the app-config payload (series + money rates) the client
// loads at boot so nothing product- or price-shaped is hardcoded browser-side. Handler is
// written once here and mounted by both servers (same pattern as lib/designApi.js).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shutterRates, carcassRate, surfaceRates, installRates, quoteConfig } from './pricingConfig.js';
import { RULES } from './rules.js';

let remarksCache = null;
function remarksList() {
  if (!remarksCache) remarksCache = JSON.parse(readFileSync(join(ROOT, 'data', 'remarks.json'), 'utf8')).remarks;
  return remarksCache;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let cache = null;
export function allSeries() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'data', 'series.json'), 'utf8')).series;
  return cache;
}

export function getSeries(id) {
  return allSeries().find((s) => s.id === id) || null;
}

// Route-level guard: generation requires a committed series (Stage 2.1, server-enforced).
export function requireSeries(id) {
  if (!id) throw Object.assign(new Error('Pick a series before generating — send options.seriesId (Stage 2).'), { status: 400 });
  const s = getSeries(id);
  if (!s) throw Object.assign(new Error(`Unknown series '${id}'. Configured: ${allSeries().map((x) => x.id).join(', ')}.`), { status: 400 });
  return s;
}

// 'BSC1HS_LH_CJ (H720xW900xD560)' -> 'BSC1HS' — the base form catalogs are keyed by.
export function normalizeCode(code) {
  return String(code).split(' (')[0].trim().replace(/_(LH|RH)$/i, '').replace(/_(CJ|EH)$/i, '').replace(/_(LH|RH)$/i, '');
}

const skuSets = new Map();
function skuSet(series) {
  if (!skuSets.has(series.id)) {
    const codes = (series.catalog && series.catalog.skuCodes) || [];
    skuSets.set(series.id, new Set(codes.map(normalizeCode)));
  }
  return skuSets.get(series.id);
}

export function seriesAllowsCode(series, code) {
  if (!series || series.catalog === 'full') return true;
  return skuSet(series).has(normalizeCode(code));
}

// The finish group is FIXED BY THE SERIES (Gold = PG2 only; Elite/Signature = PG1).
// Given a requested pg, return the one the series actually prices in — the requested
// group when allowed, else the series' first (its home group). No finishGroups
// configured means unconstrained (pass-through).
export function seriesFinishGroup(series, pg) {
  const g = series && series.finishGroups;
  if (!g || !g.length) return pg;
  return g.includes(pg) ? pg : g[0];
}

// Check a generated BOM (code -> qty) against the series catalog. Returns plain-English
// warnings, one per off-catalog code — the generator must say so, never silently ignore.
export function offCatalogWarnings(bom, series) {
  return Object.keys(bom || {})
    .filter((code) => !seriesAllowsCode(series, code))
    .map((code) => `SKU ${code} is not in the ${series.name} series catalogue.`);
}

// GET /api/config -> { series, rates, surfaces, install, carcassRate, currency }.
// Plain Node req/res primitives so the same function runs under both servers.
export async function handleConfig(req, res) {
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method !== 'GET') return json(405, { error: 'GET /api/config.' });
  try {
    return json(200, {
      series: allSeries().map((s) => ({
        id: s.id, name: s.name, tier: s.tier, startingRatePerSqft: s.startingRatePerSqft,
        positioning: s.positioning, optionsBlurb: s.optionsBlurb,
        finishGroups: s.finishGroups || null, finishLabel: s.finishLabel || null,
        carcass: s.carcass, handleTypes: s.handleTypes,
        defaultFinish: s.defaultFinish, catalogPlaceholder: !!s.catalogPlaceholder,
      })),
      rates: shutterRates(),
      carcassRate: carcassRate(),
      surfaces: surfaceRates(),
      install: installRates(),
      rules: RULES,
      quote: quoteConfig(),
      remarks: remarksList(),
      currency: 'INR',
    });
  } catch (e) {
    return json(500, { error: String((e && e.message) || e) });
  }
}
