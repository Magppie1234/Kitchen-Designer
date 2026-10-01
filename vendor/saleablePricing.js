// lib/saleablePricing.js — the plan's saleable price. Cabinets are priced exactly as the Quote
// tab prices them: each placed cabinet (plan.bom) = the series rate (data/series.json
// startingRatePerSqft, confirmed as the series rate) × its workbook Carcass Net Sqft — the one
// shared function in ui/cabinet-catalog.js. Countertop bills on its own surface area.
// Countertop here is the stone (material) only; its installation is a Section B service line
// (rules.json quote-surface-and-install-rates), so it is never billed twice.
import { enumerateModules } from './costEstimate.js';
import { surfaceRates } from './pricingConfig.js';
import { getSeries } from './series.js';
import { loadCatalog } from '../core/loadCatalog.mjs';
import '../ui/cabinet-catalog.js';

const SQFT = 92903; // mm² per sqft
export const SURFACE_RATE = surfaceRates().Countertop.materialPerSqft;    // countertop ₹/sqft (material)
export const SURFACE_INSTALL = surfaceRates().Countertop.installPerSqft;  // ₹/sqft fabrication+install

let byCode = null;
const carcassByCode = () => (byCode ??= Object.fromEntries(loadCatalog().ok.map((c) => [c.code, { carcassSqft: c.carcassSqft }])));

export function priceSaleable(plan, opts = {}) {
  const series = getSeries(opts.seriesId);
  const rate = series?.startingRatePerSqft ?? null;
  const q = globalThis.CabinetCatalog.cabinetQuote(plan.bom, carcassByCode(), rate);

  const { specs, counterMm2 } = enumerateModules(plan);
  const shutterSqft = specs.reduce((a, m) => a + (m.W * m.H) / SQFT, 0);
  const counterSqft = counterMm2 / SQFT;
  const counter = Math.round(counterSqft * SURFACE_RATE);
  const carcassSqft = q.lines.reduce((a, l) => a + l.carcassSqft, 0);

  return {
    model: 'carcass', currency: 'INR', seriesId: series?.id ?? null, rate,
    carcassSqft: +carcassSqft.toFixed(1),
    shutterSqft: +shutterSqft.toFixed(1),
    counterSqft: +counterSqft.toFixed(1),
    modules: q.lines.length,
    unpriced: q.unpriced,
    breakdown: { cabinets: q.total, counter, total: q.total + counter },
    lines: q.lines,
    note: rate == null
      ? 'No series selected — cabinets are not priced.'
      : `Cabinets: ${carcassSqft.toFixed(1)} sqft carcass × ₹${rate}/sqft (${series.name}) + counter.`,
  };
}
