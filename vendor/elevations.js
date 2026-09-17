// lib/elevations.js — the per-fixture "Elevation A vs B" style choice the user makes
// in the builder, mapped to concrete modules. The rest of the engine is geometry-only;
// this is the ONE place the named elevation choice changes the base anchor width, the
// wall/tall tier treatment, and the accessory pack — per Magppie's historical drawings.
//
//   hob    A: 900 cooktop + drawer bank        → base anchor 900, chimney 900, glass flanks
//          B: 600 cooktop + 600 base + pullout  → base anchor 1200, chimney 600, wall cab over base
//   sink   A: 600 sink, waste R · bottle L      → base anchor 900, +Bottle Pullout accessory
//          B: 600 sink, waste R only            → base anchor 600
//   fridge A: tall fridge tower                 → 1 tall (600)
//          B: fridge + tandem pantry            → 2 tall (600+600), base footprint 1200

import { RULES } from './rules.js';

export const DEFAULT_VARIANT = RULES.elevations.defaultVariant;

// The A/B table itself lives in data/rules.json (elevations.table). Doc §9.4 notes kept
// here: the refrigerator is ALWAYS a single 600mm tall point; a pantry/oven tower is a
// SEPARATE appliance-driven unit (§10.5), not a fridge width.
export const ELEVATIONS = RULES.elevations.table;

// Resolve a fixture+variant to its spec; unknown variant falls back to Elevation A.
export function elevSpec(type, variant) {
  const t = ELEVATIONS[type];
  if (!t) return null;
  return t[variant] || t[DEFAULT_VARIANT];
}

// Anchor footprint width for a fixture under a chosen elevation (mm).
export function anchorWidth(type, variant) {
  const s = elevSpec(type, variant);
  return s ? s.width : 600;
}
