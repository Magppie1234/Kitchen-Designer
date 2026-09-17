// lib/cabinetCode.js — Magppie cabinet-code grammar, decoded from real elevations
// (see zone-grammar-calibration-from-plans.md). emitCode(spec) -> code string.
//
// This is the generative half of the module->cabinet-code mapping the eng review
// flagged as the critical path: the engine EMITS codes from a structured module
// spec, rather than looking them up. The BOM Builder's /designer already parses
// codes back (reverse path).
//
// Code shape (canonical field order, from the elevations):
//   [S<filler>_] FAMILY [<shelves>S|GS] [<n>BL][<n>EL][<n>EH] [feature…] [<doors><HS|GHS|PS|RS>] [_LH|_RH]
// Examples reproduced by the tests below:
//   BC2EH · BC2EL1EH · BC1BL1EH · BC1EHWB · BCBP1PS_LH · BSC1HS_RH · BSC2HS
//   WC3GS1HS_LH · WC3GS2HS · WC3GS2GHS · WLC1S1HS_LH · WMHC3S1EH1RS · WOC35
//   TC1SR1HS_RH · TC3S1EHSFMO1HS_LH · TC3S1EHSFMOWD1HS_LH · TC6S1HS_LH
//   S450_WBC3GS1HS_LH · S550_BBC1S1HS_LH

export const FAMILY = {
  base: 'BC', baseSink: 'BSC', baseBlind: 'BBC',
  wall: 'WC', wallLoft: 'WLC', wallMidHt: 'WMHC',
  wallBlind: 'WBC', wallOpen: 'WOC', wallDish: 'WDC',
  tall: 'TC',
};

export const FEATURE = {
  tandemPantry: 'STP', fridge: 'R', mwOven: 'SFMO', mwOvenWarming: 'SFMOWD',
  wastebin: 'WB', bottlePullout: 'BP',
};

// Shutter token by material/kind.
function shutterToken(kind) {
  return kind === 'glass' ? 'GHS' : kind === 'pullout' ? 'PS' : kind === 'rolling' ? 'RS' : 'HS';
}
// Door count by width: 1 door <=600, 2 doors >=900 (blind/override via spec.doors).
export function doorsForWidth(width) { return width >= 900 ? 2 : 1; }

// spec fields:
//   family (key of FAMILY)            required
//   shelves (int) + glassShelf (bool) optional -> "<n>S" or "<n>GS"
//   builtinLb / lb / hb (int)         optional drawer counts -> "<n>BL"/"<n>EL"/"<n>EH"
//   features (array of FEATURE keys)  optional
//   shutter ('solid'|'glass'|'pullout'|'rolling')  optional -> emits door token
//   width (mm)                        used for door count when shutter present
//   doors (int)                       override door count (blind units = 1)
//   fillerWidth (mm)                  blind-corner scribe -> "S<n>_" prefix
//   hand ('LH'|'RH')                  optional suffix
export function emitCode(spec) {
  const fam = FAMILY[spec.family];
  if (!fam) throw new Error(`unknown family: ${spec.family}`);
  let s = '';
  if (spec.fillerWidth) s += `S${spec.fillerWidth}_`;
  s += fam;
  if (spec.shelves != null) s += `${spec.shelves}${spec.glassShelf ? 'GS' : 'S'}`;
  if (spec.builtinLb) s += `${spec.builtinLb}BL`;
  if (spec.lb) s += `${spec.lb}EL`;
  if (spec.hb) s += `${spec.hb}EH`;
  for (const ft of spec.features || []) {
    const t = FEATURE[ft];
    if (!t) throw new Error(`unknown feature: ${ft}`);
    s += t;
  }
  if (spec.shutter) {
    const doors = spec.doors != null ? spec.doors : doorsForWidth(spec.width);
    s += `${doors}${shutterToken(spec.shutter)}`;
  }
  if (spec.hand) s += `_${spec.hand}`;
  return s;
}
