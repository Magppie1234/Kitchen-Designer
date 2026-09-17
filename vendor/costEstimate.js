// lib/costEstimate.js — material + labour cost ESTIMATE for a planned kitchen.
// Magppie has no per-module finished price (kitchens book lump-sum; Zoho is a raw-
// material master), so we size each cabinet from the live plan geometry and cost it
// from data/rate-master.json: carcass board area, stone facia + counter, hardware,
// plus a labour factor. This is an honest ballpark, ALWAYS flagged "estimate:true" and
// carrying its assumptions — never presented as a firm quote. When real per-module
// rates land, lib/costing.js (per-module list price) is the authoritative path.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RULES } from './rules.js';

// Tier depths (mm) — data/rules.json is the single source; no renderer or costing
// module keeps its own copy. base === tall (560), wall === loft (336).
const DEPTH = RULES.depths;

const HERE = dirname(fileURLToPath(import.meta.url));
let _rm = null;
function rateMaster() {
  if (!_rm) _rm = JSON.parse(readFileSync(join(HERE, '..', 'data', 'rate-master.json'), 'utf8'));
  return _rm;
}
const SQFT = 92903;            // mm² per sqft
const M = 1000;                // mm per m
const sqft = (mm2) => mm2 / SQFT;

// Carcass board area (sqft) for a box W×H×D (mm): 2 sides + top + bottom.
function carcassSqft(W, H, D) { return sqft(2 * (H * D) + 2 * (W * D)); }
// Front facia area (sqft): one shutter/drawer face W×H.
function frontSqft(W, H) { return sqft(W * H); }
// Edge band running length (m): rough perimeter of exposed edges ≈ 2(W+H) + shutter.
function edgeBandM(W, H) { return (2 * (W + H) + 2 * (W + H)) / M; }

// Cost one cabinet piece. kind: 'base'|'wall'|'loft'|'tall'; carries: array of tags.
function costPiece({ kind, W, H, D, carries = [], drawers = 0, hinges = 0 }, R) {
  const r = R.rates;
  const parts = [];
  const add = (label, qty, rate) => { const amt = qty * rate; if (amt) parts.push({ label, qty: +qty.toFixed(2), rate, amount: Math.round(amt) }); };

  add('carcass board', carcassSqft(W, H, D), r.carcassBoard_sqft.value);
  add('back panel', sqft(W * H), r.backPanel_sqft.value);
  add('edge banding', edgeBandM(W, H), r.edgeBand_m.value);
  add('legs', kind === 'base' || kind === 'tall' ? 4 : 0, r.leg_each.value);

  // facia: stone shutters everywhere (the SilverStone differentiator)
  add('stone facia', frontSqft(W, H), r.shutterStone_sqft.value);

  // hardware
  if (drawers) add('drawer runners', drawers, r.drawerRunner_set.value);
  const hingeN = hinges || (drawers ? 0 : (kind === 'tall' ? 4 : 2));
  add('hinges', hingeN, r.hinge_each.value);
  add('handle', Math.max(1, Math.round(W / 600)), r.handle_each.value);

  // special mechanisms
  if (carries.includes('sink')) add('SS sink bowl', 1, r.sinkBowl_each.value);
  if (carries.includes('lemans')) add('Lemans mechanism', 1, r.lemansMechanism_each.value);
  if (carries.includes('pantry')) add('tandem pantry mech', 1, r.tallPantry_each.value);

  const material = parts.reduce((s, p) => s + p.amount, 0);
  return { kind, W, H, D, carries, material, parts };
}

// Enumerate every physical module in a plan as a geometry spec (no costing), shared
// by the material estimate and the saleable (shutter-sqft) pricing. Returns
// { specs:[{kind,W,H,D,label,carries,drawers}], counterMm2 }. Shutter saleable area
// of a module = its front face W×H (matches Magppie's "Shutter SqFt" column).
export function enumerateModules(plan) {
  const specs = [];
  let counterMm2 = 0;
  const push = (m) => specs.push({ D: DEPTH.base, carries: [], drawers: 0, ...m });
  for (const run of plan.runs || []) {
    for (const seg of run.segments) {
      if(seg.hiddenCorner){counterMm2+=seg.width*(seg.depth??DEPTH.counter);continue;}
      if (seg.kind === 'tallBank') {
        // typed tall units, no counter above. A loose fridge slot is freestanding (not saleable).
        for (const u of (seg.units || [])) {
          if (u.type === 'fridge' && u.loose) continue;
          push({ kind: 'tall', W: u.width, H: u.height??seg.height??2100, D: u.depth??seg.depth??DEPTH.tall, label: u.type, carries: [u.type] });
        }
        continue;
      }
      if (seg.kind==='filler' && seg.tier!=='tall') counterMm2+=seg.width*(seg.depth??DEPTH.counter);
      if (!['cabinet', 'anchor', 'corner'].includes(seg.kind)) continue;
      if(seg.label==='dishwasher'){counterMm2+=seg.width*(seg.depth??DEPTH.counter);continue;}
      if (seg.kind === 'anchor' && seg.label === 'fridge') { push({ kind: 'tall', W: seg.width, H: seg.height??2100, D:seg.depth??DEPTH.tall, label: 'fridge tower', carries: ['fridge'] }); continue; }
      if (seg.kind === 'corner') push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: 'corner (Lemans)', carries: ['lemans'] });
      else if (seg.kind === 'anchor' && seg.label === 'hob') push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: 'hob base', carries: ['hob'], drawers: 3 });
      else if (seg.kind === 'anchor' && seg.label === 'sink') push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: 'sink base', carries: ['sink'] });
      else push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: 'base cabinet' });
      counterMm2 += seg.width * (seg.depth??DEPTH.counter);
    }
    const t = plan.tiers?.[run.key];
    if (t) {
      for (const w of t.wall) if (['wallSolid', 'wallGlass', 'wallBlind'].includes(w.kind)) push({ kind: 'wall', W: w.width, H: w.height??w.h??1085, D: w.depth??DEPTH.wall, label: 'wall cabinet' });
      for (const l of t.loft) push({ kind: 'loft', W: l.width, H: l.height??l.h??600, D: l.depth??DEPTH.loft, label: 'loft cabinet' });
      for (const x of t.tall) push({ kind: 'tall', W: x.width, H: x.height??x.h??2100, D:x.depth??DEPTH.tall, label: x.note || 'tall unit', carries: x.note && /pantry/i.test(x.note) ? ['pantry'] : [] });
    }
  }
  if (plan.island && plan.island.working) {
    for (const s of plan.island.working) if (['cabinet', 'anchor'].includes(s.kind)) {
      push({ kind: 'base', W: s.width, H: 720, label: 'island ' + (s.label || 'base'), carries: s.label === 'sink' ? ['sink'] : s.label === 'hob' ? ['hob'] : [] });
      counterMm2 += s.width * DEPTH.counter;
    }
    for (const s of (plan.island.seating || [])) if (s.kind === 'lowDepth') push({ kind: 'wall', W: s.width, H: 720, D: DEPTH.wall, label: 'island seat unit' });
  }
  return { specs, counterMm2 };
}

// Estimate the whole kitchen from a planFromExtract() plan (runs + tiers + island).
export function estimateKitchen(plan, opts = {}) {
  const R = rateMaster();
  const anyAssumed = Object.values(R.rates).some((x) => x.source === 'assumed');
  const { specs, counterMm2 } = enumerateModules(plan);
  const pieces = specs.map((m) => costPiece(m, R));
  const counterAmt = Math.round(sqft(counterMm2) * R.rates.counterStone_sqft.value);
  const material = pieces.reduce((s, p) => s + p.material, 0) + counterAmt;
  const labour = Math.round(material * (R.labour?.factorOnMaterial || 0));
  const beforeMargin = material + labour;
  const total = Math.round(beforeMargin * (1 + (R.margin?.factor || 0)));

  return {
    currency: R.currency,
    estimate: true,
    assumptionsFlagged: anyAssumed,
    pieces: pieces.length,
    counter: { sqft: +sqft(counterMm2).toFixed(1), amount: counterAmt },
    breakdown: { material, labour, total },
    perCategory: rollup(pieces, counterAmt),
    note: `ESTIMATE — material + ${Math.round((R.labour?.factorOnMaterial || 0) * 100)}% labour, sized from the plan. ${anyAssumed ? 'Uses assumed raw-material rates (see data/rate-master.json); replace with Magppie/Zoho rates for a firm quote.' : 'Rates from Zoho.'}`,
    lines: opts.lines ? pieces : undefined,
  };
}

function rollup(pieces, counterAmt) {
  const cat = { base: 0, wall: 0, loft: 0, tall: 0, counter: counterAmt };
  for (const p of pieces) cat[p.kind] = (cat[p.kind] || 0) + p.material;
  return Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, Math.round(v)]));
}
