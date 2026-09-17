// lib/pricingConfig.js — the single read point for money rates, parsed from
// data/price-matrix.json (the sheet-verbatim rate matrix that until now was only
// provenance while the numbers lived hardcoded in lib/saleablePricing.js and
// public/builder.html). Rates change by editing the JSON, never this file.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let cache = null;
function matrix() {
  if (!cache) cache = JSON.parse(readFileSync(join(ROOT, 'data', 'price-matrix.json'), 'utf8'));
  return cache;
}

// { PG1: { Classic: 11200, Modern: 9950 }, PG2: { ... } } — the combined shutter+carcass
// ₹/sqft ("Total" column). The shape lib/saleablePricing.js and the client RATE table use.
export function shutterRates() {
  const out = {};
  for (const r of matrix().shutterAndCarcassRates.rows) {
    if (r.stoneGroup === 'Carcass' || typeof r.total !== 'number') continue;
    (out[r.stoneGroup] = out[r.stoneGroup] || {})[r.shutterType] = r.total;
  }
  return out;
}

// The carcass display rate (₹/sqft; already bundled inside the totals above).
export function carcassRate() {
  const row = matrix().shutterAndCarcassRates.rows.find((r) => r.stoneGroup === 'Carcass');
  return row ? row.pricePerSqft : null;
}

// Surface (countertop / backsplash) rates: material ₹/sqft + installation ₹/sqft.
// The sheet prices both PG groups identically today; keyed by surface type.
export function surfaceRates() {
  const out = {};
  for (const r of matrix().surfaceRates.rows) {
    if (typeof r.pricePerSqft !== 'number') continue;
    out[r.surfaceType] = out[r.surfaceType] || {
      materialPerSqft: r.pricePerSqft,
      installPerSqft: typeof r.installationPricePerSqft === 'number' ? r.installationPricePerSqft : 0,
    };
  }
  return out;
}

// Quotation & sharing config (data/quote-config.json) — the constants the client's
// quoteMath() used to hardcode, plus share-link defaults.
let quoteCache = null;
export function quoteConfig() {
  if (!quoteCache) quoteCache = JSON.parse(readFileSync(join(ROOT, 'data', 'quote-config.json'), 'utf8'));
  return quoteCache;
}

// Installation add-ons that carry a real number ("As per actuals" rows are skipped).
export function installRates() {
  const out = {};
  for (const r of matrix().installationAddOns) {
    if (typeof r.pricePerSqft === 'number') out[r.item] = r.pricePerSqft;
  }
  return out;
}
