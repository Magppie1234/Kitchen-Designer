// vendor/rules.js — MAI's RULES object, DERIVED FROM THIS PROJECT'S rules.json.
//
// The original project spread its rule book across data/rules.json plus ~8 lib modules
// (tiers/zones/corners/tiling/elevations/hobSides/veggieSink/planFromExtract). None of
// those are imported here. This project has ONE rule file — rules.json at the root — and
// the layout engine (engine.mjs) reads it directly via config.mjs.
//
// What survives is the handful of imported-but-non-rule modules (costEstimate, shareApi,
// series, elevations) plus the browser, which all expect MAI's RULES SHAPE. This file is
// that shape and nothing more: every value below is read out of rules.json where rules.json
// states it, and is a plain fallback where it does not (accessory/appliance geometry the
// new rule book deliberately leaves out of scope).
import { RULE_PARAMS } from '../config.mjs';

const H = RULE_PARAMS.heights['8ft'];

export const RULES = {
  // Carcass depths. rules.json states the low-depth value; the standard depths are the
  // catalogue's own (cabinets.csv: 560 full, 336 low) — not a layout rule.
  depths: { base: 560, wall: RULE_PARAMS.low_depth, tall: 560, loft: RULE_PARAMS.low_depth, counter: 600 },

  // Vertical stack, straight out of rules.json params.heights (8ft system).
  heights: {
    baseTop: RULE_PARAMS.counter_height,
    dado: RULE_PARAMS.backsplash,
    wallTop: H.design_height,
    loft: RULE_PARAMS.heights['7ft'].wall,
    tall: H.tall,
    defaultCeiling: 3100,
  },

  // Door/window keep-out. rules.json has no client-side clearance number; the engine owns
  // opening handling, so this is only what the browser draws as a hint.
  openings: { doorClearEachSide: 400, endpointTol: 80 },

  // Narrowest unit the browser will let a drawn zone band be. The engine's own fill()
  // decides real widths from the catalogue.
  tiling: { widthLadder: [900, 600, 450, 300], minUnit: 300 },

  zones: { reach: 1200 },

  // A/B fixture elevations — used only to pick the hob base code when repricing an edited
  // plan. Width choices in a generated plan come from the engine, not from here.
  elevations: {
    defaultVariant: 'A',
    table: {
      hob: {
        A: { width: 900, cooktop: 900, label: '900 hob + drawers' },
        B: { width: 1200, cooktop: 600, label: '600 hob + base + pullout' },
      },
      sink: {
        A: { width: 900, bottle: true, label: 'waste R · bottle L' },
        B: { width: 600, bottle: false, label: 'waste R only' },
      },
      fridge: {
        A: { width: 600, fridgeMode: 'fridgeTower', label: 'tall tower' },
        B: { width: 600, fridgeMode: 'fridgeTower', label: 'tall tower' },
      },
    },
  },
};
