// lib/catalog.js — load the Magppie module catalog (parsed from the Drive
// "Kitchen Modules List with Detail.xlsx") and enrich each module with the
// semantics the planner needs: a height class, what the unit "carries"
// (sink/hob/fridge/…), and a list price. Pure data + light tagging — no geometry.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(HERE, '..', p), 'utf8'));

// Tag a module by what it functionally carries, matched on its text fields.
// These tags are what the planner anchors to (a "sink" tag => sink-zone unit).
const TAGS = [
  ['sink', /\bsink\b/i],
  ['hob', /\bhob\b|cook\s*top|stove/i],
  ['fridge', /refriger|fridge/i],
  ['oven', /\boven\b|microwave|\bmw\b|appliance/i],
  ['pantry', /tandem|pantry/i],
  ['waste', /waste|\bbin\b/i],
  ['bottlePullout', /\bbpo\b|bottle\s*pullout/i],
  ['pullout', /pullout|\bpo\b/i],
  ['lemans', /lemans|lehman/i],
  ['corner', /\bcorner\b|\bblind\b/i],
  ['dishrack', /dish\s*rack|dishrack/i],
  ['glassFront', /glass/i],
  ['drawer', /drawer/i],
  ['rolling', /rolling\s*shutter/i],
];

function enrich(m) {
  const hay = `${m.subType} ${m.cabinetName} ${m.cabinetType} ${m.description}`;
  const carries = TAGS.filter(([, re]) => re.test(hay)).map(([t]) => t);
  if (m.glass && m.glass !== '0' && m.glass !== 'NA' && !carries.includes('glassFront')) carries.push('glassFront');
  return {
    ...m,
    heightClass: (m.unitType || '').toLowerCase(), // base | tall | wall | loft | mid
    carries,
    widths: (m.widths || []).slice().sort((a, b) => a - b),
    minWidth: Math.min(...(m.widths.length ? m.widths : [600])),
    maxWidth: Math.max(...(m.widths.length ? m.widths : [600])),
  };
}

let _catalog = null, _prices = null;

export function loadCatalog() {
  if (_catalog) return _catalog;
  _prices = load('data/module-prices.json');
  const mods = load('data/catalog/modules.json').map(enrich);
  _catalog = {
    modules: mods,
    currency: _prices.currency || 'INR',
    priceNote: _prices.note,
    priceOf: (m) => (_prices.byCabinetName?.[m.cabinetName] ?? null),
  };
  return _catalog;
}

// Convenience selectors used by the planner.
export function pick(cat, { heightClass, carry, anyCarry, width, excludeCarry } = {}) {
  return cat.modules.filter((m) => {
    if (heightClass && m.heightClass !== heightClass) return false;
    if (carry && !m.carries.includes(carry)) return false;
    if (anyCarry && !anyCarry.some((c) => m.carries.includes(c))) return false;
    if (excludeCarry && excludeCarry.some((c) => m.carries.includes(c))) return false;
    if (width != null && !m.widths.includes(width)) return false;
    return true;
  });
}

// Best module of a class that fits within maxW, preferring the requested carry
// and the widest width that still fits. Returns { module, width } or null.
export function bestFit(cat, { heightClass, carry, excludeCarry, maxW, preferWidths }) {
  const cands = pick(cat, { heightClass, carry, excludeCarry });
  let best = null;
  for (const m of cands) {
    for (const w of m.widths) {
      if (w > maxW) continue;
      const score = (carry && m.carries.includes(carry) ? 100000 : 0)
        + (preferWidths && preferWidths.includes(w) ? 10000 : 0) + w;
      if (!best || score > best.score) best = { module: m, width: w, score };
    }
  }
  return best && { module: best.module, width: best.width };
}
