// catalog.mjs — Magppie cabinet code grammar: parse and validate.
//
// Source of truth is the corrected code column. The legacy column is ignored.
//
// Codes are self-describing — dimensions live in the string — so the catalogue needs no
// lookup table at all.
//
// Grammar, 11 dash-separated fields:
//   ZONE-FAMILY-HARDWARE-MATERIAL-P1-P2-P3-WIDTH-HEIGHT-DEPTH-THICKNESS
//
// P1..P3 hold internal spec / handing / accessory but NOT in a fixed order: the
// TC-MO / CF / MW / OV rows put LHS|RHS in P3 where every other family uses P2.
// So handing is found by scanning the three slots rather than by position.

const ZONES = {
  BC:  { name: 'Base',                   group: 'base', tall: false, blind: false, lowDepth: false },
  BCL: { name: 'Base — Low Depth',       group: 'base', tall: false, blind: false, lowDepth: true  },
  BB:  { name: 'Base Blind',             group: 'base', tall: false, blind: true,  lowDepth: false },
  BBL: { name: 'Base Blind — Low Depth', group: 'base', tall: false, blind: true,  lowDepth: true  },
  WC:  { name: 'Wall',                   group: 'wall', tall: false, blind: false, lowDepth: false },
  WB:  { name: 'Wall Blind',             group: 'wall', tall: false, blind: true,  lowDepth: false },
  TC:  { name: 'Tall',                   group: 'tall', tall: true,  blind: false, lowDepth: false },
  TB:  { name: 'Tall Blind',             group: 'tall', tall: true,  blind: true,  lowDepth: false },
  TCL: { name: 'Tall — Low Depth',       group: 'tall', tall: true,  blind: false, lowDepth: true  },
  LO:  { name: 'Loft',                   group: 'wall', tall: false, blind: false, lowDepth: false },
  LB:  { name: 'Loft Blind',             group: 'wall', tall: false, blind: true,  lowDepth: false },
  LOF: { name: 'Loft — Full Depth',      group: 'wall', tall: false, blind: false, lowDepth: false },
  MD:  { name: 'Mid',                    group: 'wall', tall: false, blind: false, lowDepth: false },
  LBF: { name: 'Loft Blind — Full Depth', group: 'wall', tall: false, blind: true,  lowDepth: false },
  // L-shape corner units — physically wrap the corner rather than blanking off part of it,
  // so they are NOT blind. Careful: TLC (tall L-shape) is not TCL (tall low-depth).
  TLC: { name: 'Tall — L Shape',         group: 'tall', tall: true,  blind: false, lowDepth: false },
  BLC: { name: 'Base — L Shape',         group: 'base', tall: false, blind: false, lowDepth: false },
  WLC: { name: 'Wall — L Shape',         group: 'wall', tall: false, blind: false, lowDepth: false },
  MDW: { name: 'Mid — Wall',             group: 'wall', tall: false, blind: false, lowDepth: false },
  MDT: { name: 'Mid — Tall',             group: 'tall', tall: true,  blind: false, lowDepth: false },
};

// Field 3 is the HANDLE TYPE. Base units exist in both CJ and TTS — the designer or the
// client picks one per project, so it is an input to layout, not something the engine
// solves. Every other zone offers exactly one handle, so the choice never applies there.
//
// STD is the un-renamed legacy value. It survives on glass talls (never covered by the
// rename) and on rows ADDED AFTER it — LeMans corners, the 1050 sink, LBF lofts. Those
// should almost certainly read TTS; see rules.json open questions.
const HANDLES = {
  CJ:  'J-profile',
  TTS: 'Titus',
  NHX: 'No handle',
  STD: 'Pre-rename value — an alias, not a distinct handle (see DEFAULT_HANDLE)',
};

// The stated rule, straight from the design team:
//   base  — CJ or TTS, the client's choice
//   wall  — no handle at all (wall, loft and mid all mount this way)
//   tall  — always TTS, never CJ
const HANDLE_RULE = { base: ['CJ', 'TTS'], wall: ['NHX'], tall: ['TTS'] };

// STD is what everything read before the rename, and ~25 rows still carry it. It means the
// group's ordinary handle — TTS for base and tall, NHX for wall and loft — which is exactly
// the substitution the rename performed. Treat STD and TTS as the same thing; the sheet is
// correct as it stands and needs no bulk edit.
const DEFAULT_HANDLE = { base: 'TTS', wall: 'NHX', tall: 'TTS' };

const MATERIALS = { ST: 'Stone shutter', GL: 'Glass shutter' };
const HANDING = new Set(['LHS', 'RHS']);
const THICKNESSES = new Set([15]);   // widen here if a second board thickness is introduced
const LOW_DEPTH = 336;               // every low-depth zone is exactly this, no exceptions

export function parseCode(code) {
  const raw = String(code);
  if (/\s/.test(raw)) throw new Error('contains whitespace');

  const f = raw.split('-');
  if (f.length !== 11) throw new Error(`expected 11 fields, got ${f.length}`);

  const [zone, family, rawHandle, material, p1, p2, p3, w, h, d, t] = f;
  if (!ZONES[zone])         throw new Error(`unknown zone "${zone}"`);
  if (!HANDLES[rawHandle])  throw new Error(`unknown handle "${rawHandle}"`);
  if (!MATERIALS[material]) throw new Error(`unknown material "${material}"`);

  const { group } = ZONES[zone];
  const handle = rawHandle === 'STD' ? DEFAULT_HANDLE[group] : rawHandle;
  if (!HANDLE_RULE[group].includes(handle))
    throw new Error(`${zone} is a ${group} unit — handle must be ${HANDLE_RULE[group].join(' or ')}, got "${rawHandle}"`);

  const dims = { width: w, height: h, depth: d, thickness: t };
  for (const [k, v] of Object.entries(dims)) {
    if (!/^\d+$/.test(v) || +v <= 0) throw new Error(`${k} "${v}" is not a positive integer`);
    dims[k] = +v;
  }
  if (!THICKNESSES.has(dims.thickness)) throw new Error(`thickness ${dims.thickness} is not standard`);
  if (ZONES[zone].lowDepth && dims.depth !== LOW_DEPTH)
    throw new Error(`${zone} is low-depth — depth must be ${LOW_DEPTH}, got ${dims.depth}`);

  return {
    code: raw,
    zone, family, handle, material,
    ...ZONES[zone],
    ...dims,
    handing: [p1, p2, p3].find((x) => HANDING.has(x)) ?? null,
    spec: [p1, p2, p3].filter((x) => x !== 'XXX' && !HANDING.has(x)),
  };
}

// Collects problems instead of throwing, so one bad row doesn't hide the rest.
export function validate(codes) {
  const ok = [], bad = [];
  for (const c of codes) {
    try { ok.push(parseCode(c)); }
    catch (e) { bad.push({ code: c, error: e.message }); }
  }
  return { ok, bad };
}
