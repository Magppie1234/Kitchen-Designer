// lib/costing.js — per-module list-price costing of a planned kitchen.
// Each placed module is priced from the catalog price table (data/module-prices.json).
// Modules with no listed price are surfaced as "unpriced" rather than guessed, so a
// quote is never silently wrong. Emits a structured sheet + an exportable CSV.
import { loadCatalog } from './catalog.js';

export function costKitchen(plan, opts = {}) {
  const cat = loadCatalog();
  const byName = new Map(cat.modules.map((m) => [m.cabinetName, m]));
  const lines = [];
  let subtotal = 0, unpricedCount = 0;

  for (const b of plan.bom || []) {
    const mod = byName.get(b.name);
    const unitPrice = mod ? cat.priceOf(mod) : null;
    const priced = unitPrice != null;
    const amount = priced ? unitPrice * b.qty : 0;
    if (priced) subtotal += amount; else unpricedCount += b.qty;
    lines.push({ sn: b.sn, name: b.name, unitType: b.unitType, width: b.width, qty: b.qty, unitPrice, amount, priced });
  }

  const warnings = [];
  if (unpricedCount) warnings.push(`${unpricedCount} module(s) have no list price — total is partial. ${cat.priceNote || ''}`.trim());

  return {
    currency: cat.currency,
    lines: lines.sort((a, b) => a.sn - b.sn || a.width - b.width),
    subtotal,
    pricedModules: lines.filter((l) => l.priced).reduce((n, l) => n + l.qty, 0),
    unpricedModules: unpricedCount,
    total: subtotal, // = subtotal until real rates land; add tax/margin/labour later
    complete: unpricedCount === 0,
    warnings,
  };
}

export function costingToCsv(costing) {
  const f = (n) => (n == null ? '' : n);
  const rows = [['SN', 'Module', 'Type', 'Width(mm)', 'Qty', `Unit (${costing.currency})`, `Amount (${costing.currency})`, 'Priced']];
  for (const l of costing.lines) rows.push([l.sn, `"${l.name}"`, l.unitType, l.width, l.qty, f(l.unitPrice), f(l.amount), l.priced ? 'Y' : 'N']);
  rows.push([]);
  rows.push(['', '', '', '', '', 'Subtotal', costing.subtotal, '']);
  rows.push(['', '', '', '', '', 'Unpriced modules', costing.unpricedModules, '']);
  return rows.map((r) => r.join(',')).join('\n');
}
