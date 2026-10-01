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

// Installation ₹/sqft per item (Cabinets, Countertop, Backsplash).
export function installRates() {
  const out = {};
  for (const r of rows()) if (typeof r.installPerSqft === 'number') out[r.item] = r.installPerSqft;
  return out;
}

// Accessory prices: { name: [{ sn, width, price }] } — names from data/accessory-prices.json,
// prices read from the Kitchen Accessories sheet (data/accessories-master). Unlisted names = ₹0.
export function accessoryPrices() {
  const sheet = JSON.parse(readFileSync(join(ROOT, 'data', 'accessories-master', 'accessories-master.json'), 'utf8'))['Kitchen Accessories'];
  const head = sheet.findIndex((r) => String(r[0]).trim().startsWith('S. NO'));
  const col = (p) => sheet[head].findIndex((h) => String(h).trim().toUpperCase().startsWith(p));
  const [SIZE, PRICE] = [col('SIZE'), col('PRICE')];
  const bySn = new Map(sheet.slice(head + 1).filter((r) => Number(r[0]) > 0).map((r) => [Number(r[0]), r]));
  const { map } = JSON.parse(readFileSync(join(ROOT, 'data', 'accessory-prices.json'), 'utf8'));
  const out = {};
  for (const [name, sns] of Object.entries(map)) {
    out[name] = sns.filter((sn) => bySn.has(sn)).map((sn) => {
      const r = bySn.get(sn);
      return { sn, width: parseInt(String(r[SIZE]).replace(/^\D*/, ''), 10) || null, price: Math.round(Number(r[PRICE])) || 0 };
    });
  }
  return out;
}
