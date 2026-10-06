// lib/costEstimate.js — enumerates every physical module in a plan as a geometry spec
// (kind, W, H, D, carries) plus the countertop area. Used by the saleable pricing and the
// geometry tests. (The old Zoho raw-material cost estimate was removed 2026-09-30.)
import { RULES } from './rules.js';

// Tier depths (mm) — data/rules.json is the single source; no renderer or costing
// module keeps its own copy. base === tall (560), wall === loft (336).
const DEPTH = RULES.depths;

// Enumerate every physical module in a plan as a geometry spec (no costing), used
// by the saleable (shutter-sqft) pricing. Returns
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
          if (u.type === 'fridge' && (u.loose || u.applianceWidth != null)) continue;
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
      else if (seg.kind === 'anchor' && ['sink','veggie sink'].includes(seg.label)) push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: seg.veggie?'veggie sink base':'sink base', carries: ['sink'] });
      else push({ kind: 'base', W: seg.width, H: seg.height??seg.h??720, D:seg.depth??DEPTH.base, label: 'base cabinet' });
      counterMm2 += seg.width * (seg.depth??DEPTH.counter);
    }
    const t = plan.tiers?.[run.key];
    if (t) {
      for (const w of t.wall) if (['wallSolid', 'wallGlass', 'wallBlind'].includes(w.kind)) push({ kind: 'wall', W: w.width, H: w.height??w.h??1085, D: w.depth??DEPTH.wall, label: 'wall cabinet' });
      for (const l of t.loft) if (l.kind === 'loft') push({ kind: 'loft', W: l.width, H: l.height??l.h??600, D: l.depth??DEPTH.loft, label: 'loft cabinet' });
      for (const x of t.tall) push({ kind: 'tall', W: x.width, H: x.height??x.h??2100, D:x.depth??DEPTH.tall, label: x.note || 'tall unit', carries: x.note && /pantry/i.test(x.note) ? ['pantry'] : [] });
    }
  }
  if (plan.island && plan.island.working) {
    for (const s of plan.island.working) if (['cabinet', 'anchor'].includes(s.kind)) {
      push({ kind: 'base', W: s.width, H: s.height??720, D:s.depth??DEPTH.base, label: 'island ' + (s.label || 'base'), carries: ['sink','veggie sink'].includes(s.label) ? ['sink'] : s.label === 'hob' ? ['hob'] : [] });

    }
    counterMm2 += (plan.island.total||0)*(plan.island.depth||0);
    for (const s of (plan.island.seating || [])) if (s.kind === 'lowDepth') push({ kind: 'wall', W: s.width, H: 720, D: DEPTH.wall, label: 'island seat unit' });
  }
  return { specs, counterMm2 };
}
