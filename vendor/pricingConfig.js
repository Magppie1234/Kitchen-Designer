// lib/pricingConfig.js — the single read point for money rates, from data/rates.json.
// Cabinet material is the series rate × carcass net sqft (data/series.json), not here.
// Rates change by editing the JSON, never this file.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let cache = null;
function rows() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'data', 'rates.json'), 'utf8')).rows;
  return cache;
}

// Surface (countertop / backsplash) rates: material ₹/sqft + installation ₹/sqft, keyed by item.
export function surfaceRates() {
  const out = {};
  for (const r of rows()) {
    if (typeof r.materialPerSqft !== 'number') continue;
    out[r.item] = { materialPerSqft: r.materialPerSqft, installPerSqft: r.installPerSqft ?? 0 };
  }
  return out;
}

// Quotation & sharing config (data/quote-config.json) — site visits, transport, GST, share
// defaults. The file is optional: missing means {} until the designer supplies one.
let quoteCache = null;
export function quoteConfig() {
  if (!quoteCache) {
    const f = join(ROOT, 'data', 'quote-config.json');
    quoteCache = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  }
  return quoteCache;
}

// Per-city site-visit, loading/unloading and transportation charges (data/city-rates.json).
export function cityRates() {
  return JSON.parse(readFileSync(join(ROOT, 'data', 'city-rates.json'), 'utf8'));
}

// Installation ₹/sqft per item (Cabinets, Countertop, Backsplash).
export function installRates() {
  const out = {};
  for (const r of rows()) if (typeof r.installPerSqft === 'number') out[r.item] = r.installPerSqft;
  return out;
}

// Accessory prices: { name: [{ sn, width, price }] } — names from data/accessory-prices.json,
// prices read from the price master (data/accessory-price-master.json). Unlisted names = ₹0.
export function accessoryPrices() {
  const { rows } = JSON.parse(readFileSync(join(ROOT, 'data', 'accessory-price-master.json'), 'utf8'));
  const bySn = new Map(rows.map((r) => [r.sn, r]));
  const { map, defaultSize = {} } = JSON.parse(readFileSync(join(ROOT, 'data', 'accessory-prices.json'), 'utf8'));
  const out = {};
  for (const [name, sns] of Object.entries(map)) {
    // `def` marks the size quoted until the designer picks one (defaultSize); `name` labels the picker.
    out[name] = sns.filter((sn) => bySn.has(sn)).map((sn) => ({ sn, name: bySn.get(sn).name, width: bySn.get(sn).width, price: bySn.get(sn).price, ...(defaultSize[name] === sn && { def: true }) }));
  }
  return out;
}
