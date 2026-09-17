// lib/saleablePricing.js — Magppie's REAL saleable-area pricing, from the
// "Caracass and Shutter Code" workbook (Price Matrix sheet). The price driver is the
// aggregated SHUTTER saleable area (each module's front face W×H in sqft, the sheet's
// "Shutter SqFt" column) × a combined ₹/sqft rate chosen by the finish: Stone Group
// (PG1 / PG2) × Shutter family (Classic / Modern). The combined rate already bundles
// carcass (₹6000/sqft) + shutter. Countertop/backsplash bill on their own surface area.
import { enumerateModules } from './costEstimate.js';
import { shutterRates, carcassRate, surfaceRates } from './pricingConfig.js';

const SQFT = 92903; // mm² per sqft

// Combined ₹/shutter-sqft (carcass + shutter) and surface rates now come from
// data/price-matrix.json via lib/pricingConfig.js — the sheet-verbatim rate matrix that
// used to be provenance-only while these numbers lived hardcoded here.
export const SHUTTER_RATES = shutterRates();
export const SURFACE_RATE = surfaceRates().Countertop.materialPerSqft;    // countertop ₹/sqft (material)
export const SURFACE_INSTALL = surfaceRates().Countertop.installPerSqft;  // ₹/sqft fabrication+install
const CARCASS_RATE = carcassRate();    // bundled inside the combined rate (shown for transparency)

export function priceSaleable(plan, opts = {}) {
  const pg = SHUTTER_RATES[opts.pg] ? opts.pg : 'PG1';
  const finish = SHUTTER_RATES[pg][opts.finish] ? opts.finish : 'Classic';
  const rate = SHUTTER_RATES[pg][finish];

  const { specs, counterMm2 } = enumerateModules(plan);
  let shutterSqft = 0;
  const lines = specs.map((m) => {
    const sf = (m.W * m.H) / SQFT;       // shutter saleable area = front face
    shutterSqft += sf;
    return { kind: m.kind, label: m.label, W: m.W, H: m.H, shutterSqft: +sf.toFixed(3), amount: Math.round(sf * rate) };
  });

  const cabinets = Math.round(shutterSqft * rate);
  const counterSqft = counterMm2 / SQFT;
  const counter = Math.round(counterSqft * (SURFACE_RATE + SURFACE_INSTALL));
  const total = cabinets + counter;

  return {
    model: 'saleable', currency: 'INR',
    pg, finish, rate, carcassRateBundled: CARCASS_RATE,
    shutterSqft: +shutterSqft.toFixed(1),
    counterSqft: +counterSqft.toFixed(1),
    modules: specs.length,
    breakdown: { cabinets, counter, total },
    lines,
    note: `Saleable-area price — ${shutterSqft.toFixed(1)} sqft shutter × ₹${rate}/sqft (${pg} ${finish}) + counter. Rates from the Caracass & Shutter Code Price Matrix.`,
  };
}
