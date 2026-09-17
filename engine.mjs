// engine.mjs — turn a kitchen input (room + anchors + zones) into a placed layout.
//
// Each candidate expands appliances and reserves their physical space, then packs
// catalogue combinations into the remaining spans. The outer search compares
// hob-side choices and both sides of the tall appliance bank across the complete
// layout. fitting.mjs also combines bounded anchor movements to reduce filler.
import { loadCatalog } from './loadCatalog.mjs';
import { RULE_PARAMS } from './config.mjs';
// The anchor-tolerance repair pass re-validates each candidate with the SAME guard the
// designer's own input passes through, so a nudge can never be laxer than a hand placement.
import { check, outline } from './checkInput.mjs';

const P = {
  panel: RULE_PARAMS.panel_width,
  countertopReturn: RULE_PARAMS.countertop_return,
  tallVisiblePanel: RULE_PARAMS.tall_visible_panel_width,
  fillerMin: RULE_PARAMS.filler_min,
  fillerMax: RULE_PARAMS.filler_max,
  manualFillerMax: RULE_PARAMS.manual_filler_max,
  cornerFiller: RULE_PARAMS.corner_filler_min,
  shutterClearance: RULE_PARAMS.blind_shutter_clearance,
  deadSpaceMax: RULE_PARAMS.blind_corner_dead_space_max,
  chimneyOver: RULE_PARAMS.chimney_wider_than_hob_by,
  chimneyHalf: RULE_PARAMS.chimney_wider_than_hob_by / 2,
  lemans: 1050, blind: 1150, wallBlind: 900,
  heights: RULE_PARAMS.heights,
  flankToWall: { 900: 850, 600: 550, 450: 450 },
};

const find = (cat, q) => cat.find((c) => Object.entries(q).every(([k, v]) => c[k] === v));

// --- the no-overlap invariant ----------------------------------------------------
// Two units in the same tier on the same wall may TOUCH (a.at + a.width === b.at) but must
// never intersect by even a millimetre. This is a construction impossibility, not a
// preference, so it is enforced at the single point everything is placed through rather
// than re-checked by each caller.
const spansHit = (p, q) => Math.min(p.at + p.width, q.at + q.width) > Math.max(p.at, q.at);

// A tall unit is FULL HEIGHT: it owns the base and wall tiers across its own span from the
// moment it is placed, not from the later moment its `(tall above)` blocker is materialised.
// Anything asking "is this span free?" has to know that, or a corner unit is placed under a
// tall bank that has not been projected down yet — which is exactly how blind corners came
// to overlap the fridge tower.
function occupied(placed, tier, wall, at, width) {
  const probe = { at, width };
  if ((placed[tier] ?? []).some((p) => p.wall === wall && spansHit(p, probe))) return true;
  if (tier === 'base' || tier === 'wall')
    return (placed.tall ?? []).some((p) => !p.blocker && p.wall === wall && spansHit(p, probe));
  return false;
}

// The one insert. Returns null on success, or the unit already sitting there — the caller
// then places somewhere legal or raises a hard problem. It never drops the new unit silently
// and it never lets both stand.
function placeInto(placed, tier, unit) {
  const otherTiers = unit.blocker ? [] : tier === 'tall' ? ['base','wall'] : ['tall'];
  const clash = (placed[tier] ?? []).find((p) => p.wall === unit.wall && spansHit(p, unit))
    ?? otherTiers.flatMap(t => placed[t] ?? []).find(p => !p.blocker && p.wall === unit.wall && spansHit(p,unit));
  if (clash) return clash;
  placed[tier].push(unit);
  return null;
}

// The backstop: whatever produced them, no two units in a tier may intersect in the finished
// result. A producer that bypasses placeInto() is caught here rather than shipping a layout
// that cannot be built.
export function overlapProblems(placed) {
  const out = [];
  for (const tier of ['base', 'wall', 'tall']) {
    const byWall = {};
    for (const p of placed[tier] ?? []) (byWall[p.wall] ??= []).push(p);
    for (const [wall, items] of Object.entries(byWall)) {
      const sorted = [...items].sort((a, b) => a.at - b.at || a.width - b.width);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const over = prev.at + prev.width - cur.at;
        if (over > 0) out.push(`${wall}/${tier}: "${prev.role}" ${prev.at}..${prev.at + prev.width} and "${cur.role}" ${cur.at}..${cur.at + cur.width} overlap by ${over}mm`);
      }
    }
  }
  // Base and wall units can align vertically. A real tall unit fills both of those heights,
  // therefore it cannot share its wall span with either tier. Ignore generated blocker markers:
  // they represent the tall unit's reserved footprint, rather than a second cabinet.
  for (const tall of placed.tall ?? []) {
    if (tall.blocker) continue;
    for (const tier of ['base', 'wall']) for (const unit of placed[tier] ?? []) {
      if (!unit.blocker && unit.wall === tall.wall && spansHit(tall, unit))
        out.push(`${tall.wall}/tall: "${tall.role}" ${tall.at}..${tall.at + tall.width} overlaps ${tier} "${unit.role}" ${unit.at}..${unit.at + unit.width}`);
    }
  }
  return out;
}

// Validate physical volumes, including perpendicular/opposing runs. This also
// binds catalogue dimensions to every emitted piece for all downstream views.
export function geometryProblems(input, placed, cat) {
  const shape = outline(input.walls);
  if (!shape) return ['geometry: invalid room outline'];
  const ws = shape.walls.map(w => ({ ...w, a: [w.x0,w.y0], b: [w.x1,w.y1] }));
  const byCode = new Map(cat.map(c => [c.code,c])), boxes = [], problems = [];
  const H = P.heights[input.height];
  for (const tier of ['base','wall','tall']) for (const p of placed[tier] ?? []) {
    if (p.blocker) continue;
    const unit = byCode.get(p.code), w = ws.find(w => w.id===p.wall);
    if (!w) continue;
    p.depth = unit?.depth ?? p.depth ?? (tier==='wall'?RULE_PARAMS.low_depth:560);
    p.height = unit?.height ?? (tier==='wall'?H.wall:tier==='tall'?H.tall:720);
    p.z = tier==='wall'?RULE_PARAMS.counter_height+RULE_PARAMS.backsplash:tier==='base'?100:0;
    p.offset = 0;
    for (const c of input.columns ?? []) if (c.wall===p.wall && spansHit(p,c)) {
      if (tier!=='wall' && p.depth<=RULE_PARAMS.low_depth)
        p.offset = Math.max(p.offset, c.depth ?? 560-RULE_PARAMS.low_depth);
      else problems.push(`${p.wall}/${tier}: "${p.role}" intersects a structural column`);
    }
    const box = {...KitchenGeometry.footprint(w,ws,p.at,p.width,p.depth,p.offset), p, tier,
      z0:p.z, z1:p.z+p.height};
    if (!KitchenGeometry.containsRect(box,ws)) problems.push(`${p.wall}/${tier}: "${p.role}" footprint is outside the room`);
    if (input.ceiling != null && box.z1>input.ceiling) problems.push(`${p.wall}/${tier}: "${p.role}" exceeds the ceiling`);
    for (const o of input.openings ?? []) if (o.wall===p.wall && spansHit(p,o)
      && (o.type==='door'||tier!=='base'||p.role==='hob'||(o.sill??900)<RULE_PARAMS.counter_height))
      problems.push(`${p.wall}/${tier}: "${p.role}" obstructs a ${o.type}`);
    for (const st of input.structures ?? []) if (KitchenGeometry.intersects(box,st)
      && Math.min(box.z1,st.z1)>Math.max(box.z0,st.z0))
      problems.push(`${p.wall}/${tier}: "${p.role}" intersects ${st.type}`);
    boxes.push(box);
  }
  for (let i=0;i<boxes.length;i++) for(let k=i+1;k<boxes.length;k++) {
    const a=boxes[i],b=boxes[k];
    if (KitchenGeometry.intersects(a,b) && Math.min(a.z1,b.z1)>Math.max(a.z0,b.z0))
      problems.push(`physical overlap: ${a.p.wall}/${a.tier} "${a.p.role}" and ${b.p.wall}/${b.tier} "${b.p.role}"`);
  }
  return [...new Set(problems)];
}

// A unit's SHAPE: its internal configuration with no dimension in it — '2LB+1HB', 'BPO',
// '1BL+1HF'. This is what a designer picks when they pick a cabinet by what it looks like
// rather than by how big it is, so it is the vocabulary hob choices are expressed in.
export const specOf = (c) => c.spec.join('+');
const findSpec = (cat, q, spec) => cat.find((c) =>
  Object.entries(q).every(([k, v]) => c[k] === v) && (!spec || specOf(c) === spec));

// Plain-English role for a shape the designer named, so the plan and the rule log read the
// same as an engine-placed unit rather than leaking a catalogue code at the designer.
const SHAPE_ROLES = {
  'GD:1BL+1HF': 'grain trolley', 'AC:BPO': 'bottle pullout', 'AC:WBP+1HF': 'waste bin',
  'AC:TR': 'tray unit', 'AP:OVN+1FP': 'oven unit', 'SH:1SX': 'shutter', 'SH:1SX+2HS': 'shutter',
};
const roleForShape = (family, spec) => SHAPE_ROLES[`${family}:${spec}`] ?? (family === 'DW' ? 'drawers' : 'shutter');

// --- subset-sum: fill a gap of L exactly, or leave one legal filler ---------------
// Slack is what the closure pieces at the ends of this gap may absorb, as one summed range.
// Callers supply allowed trim. Cabinet runs also allow a made-to-fit remainder
// smaller than the narrowest eligible cabinet; exact replacement passes use [0,0].
const packingCache=new Map();
export function fill(L, widths, slackMin = 0, slackMax = 0, preferStorage = false) {
  const key=JSON.stringify([L,widths,slackMin,slackMax,preferStorage]);
  let result=packingCache.get(key);
  if(!result){
    result=fillUncached(L,widths,slackMin,slackMax,preferStorage);
    if(packingCache.size>=2048)packingCache.delete(packingCache.keys().next().value);
    packingCache.set(key,result);
  }
  return result.cabinets?{...result,cabinets:[...result.cabinets]}:{...result};
}
function fillUncached(L, widths, slackMin, slackMax, preferStorage) {
  if (L < 0) return { error: `negative span ${L}mm` };
  if (!Number.isSafeInteger(L)) return { error: 'span must be integer millimetres' };
  widths = widths.filter(w => Number.isSafeInteger(w) && w > 0);
  const dp = Array(L + 1).fill(null);
  dp[0] = [];
  const costs = new Float64Array(L + 1).fill(Infinity);
  costs[0] = 0;
  for (let x = 1; x <= L; x++)
    for (const w of widths)
      if (x >= w && dp[x - w] && costs[x-w]+1+(preferStorage&&w<450?10:0) < costs[x]) {
        dp[x] = [...dp[x - w], w];
        costs[x] = costs[x-w]+1+(preferStorage&&w<450?10:0);
      }
  let best = null;
  for (let used = L; used >= 0; used--) {
    const left = L - used;
    if (!dp[used]) continue;
    if (left >= slackMin && left <= slackMax) return { cabinets: dp[used], slack: left };
    if (!best) best = { used, left };           // largest achievable, so the nearest miss
  }
  // Say what it would take, not just that it failed — the designer has to move something.
  const rule = slackMax === 0
    ? 'but this operation requires an exact cabinet-width fit'
    : `but the closure pieces here can only absorb ${slackMin}-${slackMax}mm`;
  return { error: best && best.used > 0
    ? `nearest fit uses ${best.used}mm of cabinets and leaves ${best.left}mm — ${rule}`
    : `nothing fits — the narrowest module in this tier is ${Math.min(...widths)}mm` };
}

// --- anchors cascade into determined groups --------------------------------------
function expand(input, cat) {
  const H = P.heights[input.height];
  const out = { base: [], wall: [], tall: [] };
  const notes = [], problems = [], warnings = [];
  const omit = new Set(input._omitPreferred ?? []);
  const put = (tier, wall, at, width, role, code, extra={}) => {
    const clash=placeInto(out,tier,{wall,at,width,role,code,...extra});
    if(clash)problems.push(`${wall}/${tier}: "${role}" collides with "${clash.role}"`);
  };
  const zoneFor = (tier, wall, at, width) => (input.zones[tier] ?? [])
    .some((z) => z.wall === wall && at >= z.from && at + width <= z.to);
  const openingFree = (tier, wall, at, width) => !(input.openings ?? []).some((o) => {
    if (o.wall !== wall || Math.min(at + width, o.at + o.width) <= Math.max(at, o.at)) return false;
    return o.type === 'door' || (o.type === 'window' && tier !== 'base');
  });
  const fits = (tier, wall, at, width) => zoneFor(tier, wall, at, width) && openingFree(tier, wall, at, width);
  const anchorFree = (wall, at, width, except) => !input.anchors.some((a) => a !== except && a.wall === wall
    && Math.min(at + width, a.at + a.width) > Math.max(at, a.at));

  for (const a of input.anchors) {
    if (a.item === 'hob') {
      // The designer may name the SHAPE of the hob base and of either flanking cabinet
      // (rules.json: hob-shape-is-designer-choice). A shape is a catalogue configuration —
      // 'GD:1BL+1HF', 'AC:BPO', '2LB+1HB' — and carries no width: the engine still solves
      // that, taking the largest the run will take. A named shape is HARD. If no width of it
      // fits, that is reported against the choice; a different shape is never substituted.
      const chosen = a.flanks ?? {};
      const widthsOf = (family, spec) => [...new Set(cat
        .filter((c) => c.group === 'base' && !c.blind && c.family === family
          && specOf(c) === spec && c.handle === input.handle)
        .map((c) => c.width))].sort((x, y) => y - x);
      // The widest width of a named shape that clears the zone, the openings and the
      // neighbouring anchors on the side it was named for.
      const chosenFlank = (side, hobW) => {
        if (!chosen[side]) return null;
        const [family, spec] = String(chosen[side]).split(':');
        const at = (w) => (side === 'left' ? a.at - w : a.at + hobW);
        const widths = widthsOf(family, spec);
        const width = widths.find((w) => fits('base', a.wall, at(w), w) && anchorFree(a.wall, at(w), w, a)
          && (!P.flankToWall[w] || (fits('wall',a.wall,a.at-P.chimneyHalf-P.flankToWall[w],P.flankToWall[w])
            && fits('wall',a.wall,a.at+hobW+P.chimneyHalf,P.flankToWall[w]))));
        return { side, family, spec, width: width ?? null, at: width ? at(width) : null, offered: widths };
      };
      const chosenFit = (hobW) => ['left', 'right'].map((s) => chosenFlank(s, hobW)).filter(Boolean);

      // Direct storage neighbours remain one valid option. Ordinary flanking
      // cabinets are another; required storage can be fitted farther out.
      const sidePlan = (hobW) => {
        const free = ['left', 'right'].filter((s) => !chosen[s]);
        if (!free.length) return { grainW: 0, bpoW: 0, side: null, skip: true };
        if (input._solveHobSides?.flankW) {
          const w=input._solveHobSides.flankW;
          return free.every(s=>fits('base',a.wall,s==='left'?a.at-w:a.at+hobW,w)
            && anchorFree(a.wall,s==='left'?a.at-w:a.at+hobW,w,a)) ? {flankW:w} : null;
        }
        for (const grainW of (input._solveHobSides ? [input._solveHobSides.grainW] : [600, 450])) for (const bpoW of (input._solveHobSides ? [input._solveHobSides.bpoW] : [300, 150])) {
          for (const side of (input._solveHobSides ? [input._solveHobSides.side] : ['grain-left', 'bpo-left'])) {
            const want = { left: side === 'grain-left' ? grainW : bpoW, right: side === 'grain-left' ? bpoW : grainW };
            if (free.every((s) => {
              const at = s === 'left' ? a.at - want[s] : a.at + hobW;
              return fits('base', a.wall, at, want[s]) && anchorFree(a.wall, at, want[s], a);
            })) return { grainW, bpoW, side, only: free.length === 1 ? free[0] : null };
          }
        }
        return null;
      };

      const hobSpecs = a.design ? [a.design] : [...new Set(cat.filter((c) => c.family === 'HO').map(specOf))];
      const hobChoices = input._solveHobWidth ? [input._solveHobWidth] : [...RULE_PARAMS.hob_widths].sort((x, y) => y - x);
      const hobWidth = hobChoices.find((w) =>
        hobSpecs.some((s) => findSpec(cat, { zone: 'BC', family: 'HO', width: w, handle: input.handle }, s))
        && fits('base', a.wall, a.at, w)
        && fits('wall', a.wall, a.at - P.chimneyHalf, w + P.chimneyOver)
        && chosenFit(w).every((f) => f.width)
        && sidePlan(w)) ?? a.width;
      const hob = hobSpecs.map((s) => findSpec(cat, { zone: 'BC', family: 'HO', width: hobWidth, handle: input.handle }, s)).find(Boolean);
      if (a.design && !hob)
        problems.push(`${a.wall}/base: no hob base of the chosen shape "${a.design}" fits here — the catalogue offers it in ${(widthsOf('HO', a.design).join(', ') || 'no width')}`);
      put('base', a.wall, a.at, hobWidth, 'hob', hob?.code);
      if (a.design && hob) notes.push(`hob shape "${a.design}" chosen by the designer — solved at ${hobWidth}mm`);

      // the designer's flanks first: each one is placed exactly as named, or fails loudly
      for (const f of chosenFit(hobWidth)) {
        if (!f.width) {
          problems.push(`${a.wall}/base: the ${f.side}-hand flank shape "${f.family}:${f.spec}" does not fit beside the hob`
            + ` — the catalogue offers it in ${f.offered.join(', ') || 'no width'}`);
          continue;
        }
        const handing = f.at < a.at ? 'LHS' : 'RHS';
        const unit = findSpec(cat, { zone: 'BC', family: f.family, width: f.width, handle: input.handle, handing }, f.spec)
          ?? findSpec(cat, { zone: 'BC', family: f.family, width: f.width, handle: input.handle }, f.spec);
        put('base', a.wall, f.at, f.width, roleForShape(f.family, f.spec), unit?.code, {designerChoice:true});
        notes.push(`${f.side} of the hob: "${f.family}:${f.spec}" chosen by the designer — solved at ${f.width}mm`);
      }

      const hobSides = sidePlan(hobWidth);
      if (hobSides?.skip) {
        // Both choices are preserved. Storage is fitted after the remaining runs.
      } else if (hobSides?.flankW) {
        for (const side of ['left','right']) if (!chosen[side]) {
          const w=hobSides.flankW, at=side==='left'?a.at-w:a.at+hobWidth;
          const unit=cat.find(c=>c.zone==='BC'&&c.family==='DW'&&c.width===w&&c.handle===input.handle)
            ?? cat.find(c=>c.zone==='BC'&&c.family==='SH'&&c.width===w&&c.handle===input.handle);
          put('base',a.wall,at,w,unit?.family==='DW'?'drawers':'shutter',unit?.code);
        }
      } else if (hobSides) {
        const { grainW, bpoW, side, only } = hobSides;
        const want = { left: side === 'grain-left' ? 'grain' : 'bpo', right: side === 'grain-left' ? 'bpo' : 'grain' };
        const place = { grain: grainW, bpo: bpoW };
        for (const s of ['left', 'right']) {
          if (chosen[s]) continue;
          const what = want[s];
          const w = place[what];
          const at = s === 'left' ? a.at - w : a.at + hobWidth;
          const handing = at < a.at ? 'LHS' : 'RHS';
          const unit = what === 'grain'
            ? find(cat, { zone: 'BC', family: 'GD', width: w, handle: input.handle })
            : find(cat, { zone: 'BC', family: 'AC', width: w, handle: input.handle, handing });
          put('base', a.wall, at, w, what === 'grain' ? 'grain trolley' : 'bottle pullout', unit?.code);
        }
      } else problems.push(`${a.wall}/base: the selected cabinets do not fit beside the hob`);

      const chim = hobWidth + P.chimneyOver;
      put('wall', a.wall, a.at - P.chimneyHalf, chim, 'chimney', null);

      const flankWidths=out.base.filter(p=>p.wall===a.wall&&(p.at+p.width===a.at||p.at===a.at+hobWidth))
        .map(p=>p.width).filter(w=>P.flankToWall[w]);
      const ww = P.flankToWall[Math.max(...flankWidths)];
      const glassSpans = [['LHS', a.at - P.chimneyHalf - ww], ['RHS', a.at - P.chimneyHalf + chim]];
      if (ww && glassSpans.every(([, at]) => fits('wall', a.wall, at, ww))) {
        for (const [side, at] of glassSpans) {
          const glass = !omit.has('glass') && find(cat, { zone: 'WC', material: 'GL', width: ww, height: H.wall, handing: side });
          const solid = find(cat, {zone:'WC',material:'ST',width:ww,height:H.wall,handing:side})
            ?? find(cat, {zone:'WC',material:'ST',width:ww,height:H.wall});
          const unit=glass||solid;
          put('wall', a.wall, at, ww, glass?'glass (chimney flank)':'solid (chimney flank)', unit?.code);
          if(!glass&&!omit.has('glass'))warnings.push(`preferred glass chimney flanks omitted where unavailable: ${side} uses a matching-width solid cabinet`);
        }
        notes.push(`wall-width-follows-hob-flank: base flank ${Math.max(...flankWidths)}mm -> symmetric wall flanks ${ww}mm each side`);
        if(omit.has('glass'))warnings.push('preferred glass chimney flanks omitted; equal-width solid flanks preserve the hard symmetry rule');
      } else problems.push(`${a.wall}/wall: wall-width-follows-hob-flank requires a symmetric ${ww||'catalogue-mapped'}mm cabinet on each side of the chimney; the pair does not fit`);
    }

    if (a.item === 'sink') {
      const sink = find(cat, { zone: 'BC', family: 'SK', width: a.width, handle: input.handle });
      put('base', a.wall, a.at, a.width, 'sink', sink?.code);
      // Dishwasher is optional but must be an immediate neighbour when it is present.
      const dw = input.dishwasher === false || omit.has('dishwasher') ? undefined
        : [a.at + a.width, a.at - 600].find((at) => fits('base', a.wall, at, 600) && anchorFree(a.wall, at, 600, a));
      if (dw !== undefined) put('base', a.wall, dw, 600, 'dishwasher', null);
      else warnings.push(omit.has('dishwasher')
        ? 'preferred dishwasher omitted to preserve hard layout feasibility'
        : `preferred dishwasher omitted: no 600mm space beside sink on wall ${a.wall}`);
    }

    if (a.item === 'fridge') {
      const ref = find(cat, { zone: 'TC', family: 'REF', height: H.tall });
      const rw = ref?.width ?? 600;
      put('tall', a.wall, a.at, rw, 'refrigerator', ref?.code);
      const mo = find(cat, { zone: 'TC', family: 'MO', height: H.tall });
      const pantry = find(cat, { zone: 'TC', family: 'AC', height: H.tall });
      const preferred = omit.has('talls') ? [] : [
        [{ u: pantry, role: 'tandem pantry' }, { u: mo, role: 'microwave + oven' }],
        [{ u: mo, role: 'microwave + oven' }, { u: pantry, role: 'tandem pantry' }],
      ];
      let added = [];
      for (const seq of preferred) {
        const right = a.at + rw;
        if (input._solveTallSide!=='left' && seq.every((x, i) => x.u && fits('tall', a.wall, right + seq.slice(0, i).reduce((s, v) => s + v.u.width, 0), x.u.width))) {
          let x = right; for (const p of seq) { put('tall', a.wall, x, p.u.width, p.role, p.u.code); x += p.u.width; }
          added = seq; break;
        }
        const total = seq.reduce((s, x) => s + (x.u?.width ?? 0), 0), left = a.at - total;
        if (input._solveTallSide!=='right' && seq.every((x, i) => x.u && fits('tall', a.wall, left + seq.slice(0, i).reduce((s, v) => s + v.u.width, 0), x.u.width))) {
          // Mirror the bank so the pantry remains immediately beside the fridge.
          let x = left; for (const p of [...seq].reverse()) { put('tall', a.wall, x, p.u.width, p.role, p.u.code); x += p.u.width; }
          added = seq; break;
        }
      }
      if (!added.length) warnings.push(omit.has('talls')
        ? 'preferred tandem pantry and oven unit omitted to preserve hard layout feasibility'
        : `preferred tandem pantry and oven unit omitted: contiguous block does not fit beside refrigerator on ${a.wall}`);
      notes.push(`refrigerator anchors a ${rw + added.reduce((s, x) => s + x.u.width, 0)}mm tall block on wall ${a.wall}`);
    }
  }
  return { placed: out, notes, problems, warnings };
}

// --- corners: where two base zones meet, one takes a corner unit ------------------
function corners(input, placed, cat, tiers = ['base', 'wall']) {
  const ws = outline(input.walls).walls.map(w => ({ ...w, a: [w.x0,w.y0], b: [w.x1,w.y1] }));
  const sign = KitchenGeometry.area(ws) < 0 ? -1 : 1;
  const used = [], spans = [], ends = new Set(), fillerEnds = new Set(), cuts = {}, problems = [], notes = [];
  let hasLemans = false;
  const baseLegs = new Map();
  // Each tier has its OWN corner footprint. A wall blind never inherits a base
  // corner's 560mm return, nor can two upper runs independently occupy the square.
  for (const tier of tiers) for (let i = 0; i < ws.length; i++) {
    const a = ws[i], b = ws[(i+1)%ws.length];
    if ((a.dx*b.dy-a.dy*b.dx)*sign <= 0) continue; // straight/reflex: no inside blind corner
    const za = (input.zones[tier]||[]).find(z=>z.wall===a.id && z.to===a.length);
    const zb = (input.zones[tier]||[]).find(z=>z.wall===b.id && z.from===0);
    const baseLeg = baseLegs.get(`${a.id}:${b.id}`);
    const depth = tier==='wall' ? RULE_PARAMS.low_depth : 560;
    // A short return entirely behind a tower is reserved by that tower, not
    // filled as an independent run. Fill the longer tall run first below.
    if(tier==='tall' && za && zb && Math.min(za.to-za.from,zb.to-zb.from)<depth+P.cornerFiller)continue;
    const clear = (wall,at,width) => !occupied(placed,tier,wall,at,width)
      && !(input.openings||[]).some(o=>o.wall===wall && spansHit({at,width},o)
        && (o.type==='door'||tier!=='base'||(o.sill??900)<RULE_PARAMS.counter_height))
      && !(input.columns||[]).some(c=>c.wall===wall && spansHit({at,width},c));
    // An upper run on the adjacent wall is optional. If only the owner's
    // upper zone reaches the corner, still provide the required matching blind.
    if (!za || !zb) {
      const own = baseLeg === 'a' ? za : zb;
      if (tier === 'wall' && baseLeg && own) {
        const at = baseLeg === 'a' ? own.to-P.wallBlind : own.from;
        const unit = cat.find(c=>c.zone==='WB' && c.width===P.wallBlind && c.height===P.heights[input.height].wall);
        if (unit && at>=own.from && at+P.wallBlind<=own.to && clear(own.wall,at,P.wallBlind)) {
          placeInto(placed,tier,{wall:own.wall,at,width:unit.width,role:'wall blind corner',code:unit.code,
            corner:{id:`${a.id}:${b.id}`,end:baseLeg==='a'?'to':'from',adjacentWall:baseLeg==='a'?b.id:a.id,adjacentEnd:baseLeg==='a'?'from':'to'}});
          ends.add(`${tier}:${own.wall}:${baseLeg==='a'?'to':'from'}`);
        }
      }
      continue;
    }
    // A band drawn round a corner can end entirely behind the adjoining
    // cabinet's depth. It is already occupied space, not a second usable run.
    // Reserve it BEFORE gap packing, just as we reserve perpendicular tall space.
    const canReserveShort=tier!=='tall' && !(tier==='wall'&&baseLeg);
    const shortLeg=canReserveShort && za.to-za.from<=depth && zb.to-zb.from>depth ? 'a'
      :canReserveShort && zb.to-zb.from<=depth && za.to-za.from>depth ? 'b':null;
    if(shortLeg){
      const short=shortLeg==='a'?za:zb,owner=shortLeg==='a'?zb:za;
      const projectionAt=shortLeg==='a'?short.to-depth:short.from;
      // Check the full physical projection, including space past the short
      // drawn band: a nearby door or fixed appliance must still prevent this.
      if(projectionAt>=0 && projectionAt+depth<=ws.find(w=>w.id===short.wall).length
        && clear(short.wall,projectionAt,depth)){
        placeInto(placed,tier,{wall:short.wall,at:short.from,width:short.to-short.from,
          role:'perpendicular cabinet footprint',blocker:true,code:null,cornerOwner:owner.wall});
        notes.push(`${short.wall}/${tier}: ${short.to-short.from}mm corner zone is inside the ${depth}mm cabinet depth on wall ${owner.wall}; reserved as that run's footprint, not a separate cabinet run`);
        continue;
      }
    }
    const cornerKey=`${tier}:${a.id}:${b.id}`;
    const widths = tier==='wall' ? [P.wallBlind] : tier==='tall' ? [P.blind] : hasLemans || (input.planningChoice?.lemansCorner && input.planningChoice.lemansCorner!==cornerKey) ? [P.blind] : [P.lemans,P.blind];
    let choice;
    const preferredLeg = input.planningChoice?.cornerLegs?.[`${tier}:${a.id}:${b.id}`];
    const legs = tier === 'wall' && baseLeg ? [baseLeg] : preferredLeg === 'b' ? ['b', 'a'] : ['a', 'b'];
    for (const width of widths) { for (const leg of legs) {
      const own=leg==='a'?za:zb, other=leg==='a'?zb:za;
      const wallFiller=tier==='tall'?RULE_PARAMS.wall_filler_width:0;
      const at=leg==='a'?own.to-width-wallFiller:own.from+wallFiller;
      const ret=leg==='a'?other.from:other.to-depth-P.cornerFiller;
      const trim = cuts[`${tier}:${own.wall}`]||{};
      if (at < (trim.from??own.from) || at+width > (trim.to??own.to)
        || other.to-other.from < depth+P.cornerFiller
        || !clear(own.wall,at,width) || !clear(other.wall,ret,depth+P.cornerFiller)) continue;
      const unit=cat.find(c=>c.zone===(tier==='wall'?'WB':tier==='tall'?'TB':'BB') && c.width===width
        && (tier==='wall'?c.height===P.heights[input.height].wall:tier==='tall'?c.height===P.heights[input.height].tall&&c.handle==='TTS':c.handle===input.handle && c.family===(width===P.lemans?'AC':'SH')));
      if(unit){choice={leg,own,other,at,unit};break;}
    } if(choice) break; }
    if(!choice){
      // The final synchronization check explains a missing upper corner. Never
      // move it to the adjacent wall just because that wall has more space.
      if (!(tier === 'wall' && baseLeg)) problems.push(`corner ${a.id}/${b.id}/${tier}: no corner unit and ${depth}mm return plus filler fit clear of anchors/openings`);
      // A failed corner must not be independently packed on both legs. Keep
      // existing anchored units for diagnostics, but reserve the remaining
      // corner square so one cause does not generate a cascade of filler clashes.
      for(const [z,from,to] of [[za,Math.max(za.from,za.to-depth),za.to],[zb,zb.from,Math.min(zb.to,zb.from+depth)]]){
        let gaps=[[from,to]];
        for(const p of placed[tier].filter(p=>p.wall===z.wall))
          gaps=gaps.flatMap(([a,b])=>p.at>=b||p.at+p.width<=a?[[a,b]]:[[a,Math.min(b,p.at)],[Math.max(a,p.at+p.width),b]].filter(([x,y])=>y>x));
        for(const [at,end] of gaps)placeInto(placed,tier,{wall:z.wall,at,width:end-at,role:'unresolved corner reservation',blocker:true,code:null});
      }
      continue;
    }
    const {leg,own,other,at,unit}=choice;
    const role=tier==='wall'?'wall blind corner':tier==='tall'?'tall blind corner':unit.width===P.lemans?'LeMans corner':'blind corner';
    placeInto(placed,tier,{wall:own.wall,at,width:unit.width,role,code:unit.code,
      corner:{id:`${a.id}:${b.id}`,end:leg==='a'?'to':'from',adjacentWall:other.wall,adjacentEnd:leg==='a'?'from':'to'}});
    if(tier==='tall')placeInto(placed,tier,{wall:own.wall,at:leg==='a'?own.to-RULE_PARAMS.wall_filler_width:own.from,
      width:RULE_PARAMS.wall_filler_width,role:'wall filler',trim:true,code:null});
    const voidAt=leg==='a'?other.from:other.to-depth;
    placeInto(placed,tier,{wall:other.wall,at:voidAt,width:depth,role:'corner void',blocker:true,code:null});
    const end=leg==='a'?'from':'to';
    (cuts[`${tier}:${other.wall}`]??={})[end]=leg==='a'?other.from+depth:other.to-depth;
    ends.add(`${tier}:${a.id}:to`); ends.add(`${tier}:${b.id}:from`);
    fillerEnds.add(`${tier}:${other.wall}:${end}`);
    if(tier==='base') {baseLegs.set(`${a.id}:${b.id}`,leg);used.push(own.wall);spans.push({wall:own.wall,at,width:unit.width});hasLemans ||= unit.width===P.lemans;}
  }
  return {used,spans,ends,fillerEnds,cuts,problems,notes};
}

// Check each physical corner separately: a U-shaped kitchen can have two blind
// cabinets on one wall, and matching one must not satisfy the other corner.
export function blindCornerProblems(input, placed) {
  const ws = outline(input.walls)?.walls.map(w => ({...w,a:[w.x0,w.y0],b:[w.x1,w.y1]}));
  if (!ws) return [];
  const sign = KitchenGeometry.area(ws) < 0 ? -1 : 1;
  const problems = [];
  for (let i = 0; i < ws.length; i++) {
    const a = ws[i], b = ws[(i + 1) % ws.length];
    if ((a.dx*b.dy-a.dy*b.dx)*sign <= 0) continue;
    const atCorner = p => !p.blocker && !p.trim &&
      (p.corner ? p.corner.id===`${a.id}:${b.id}` :
        (p.wall === a.id && p.at + p.width === a.length) || (p.wall === b.id && p.at === 0));
    const bases = (placed.base ?? []).filter(p => atCorner(p) && /^(blind corner|LeMans corner)$/.test(p.role));
    const uppers = (placed.wall ?? []).filter(p => atCorner(p) && p.role === 'wall blind corner');
    for (const base of bases) {
      const opposite = uppers.find(p => p.wall !== base.wall);
      if (opposite) problems.push(`corner ${a.id}/${b.id}: base blind cabinet is on wall ${base.wall}, but wall blind cabinet is on wall ${opposite.wall}. Place both on wall ${base.wall}.`);
      else if (!uppers.some(p => p.wall === base.wall)) problems.push(`corner ${a.id}/${b.id}: base blind cabinet is on wall ${base.wall}, but its matching wall blind cabinet is missing. Make room for a ${P.wallBlind}mm wall blind cabinet on wall ${base.wall}; it cannot move to the adjacent wall.`);
    }
  }
  return problems;
}

// The opening shutter is separate from the catalogue body. Measure its near
// edge from the physical corner, past the neighbouring cabinet's front face.
function blindFront(input, placed, cat, p, tier) {
  const c=p.corner, own=input.walls.find(w=>w.id===p.wall), other=input.walls.find(w=>w.id===c.adjacentWall);
  const row=(placed[tier]??[]).filter(q=>q.wall===other.id&&!q.trim&&!q.hiddenCorner&&q.role!=='corner void'&&!q.crossTall)
    .sort((a,b)=>c.adjacentEnd==='from'?a.at-b.at:b.at+b.width-a.at-a.width);
  let next=row.find(q=>q.code||/\(tall above\)$/.test(q.role));
  if(next?.blocker)next=placed.tall.find(q=>q.wall===next.wall&&q.at===next.at&&!q.blocker);
  const unit=cat.find(u=>u.code===next?.code);
  let offset=next?.offset??0;
  if(next)for(const col of input.columns??[])if(col.wall===next.wall&&spansHit(next,col)&&tier!=='wall'&&(unit?.depth??next.depth)<=RULE_PARAMS.low_depth)
    offset=Math.max(offset,col.depth??560-RULE_PARAMS.low_depth);
  const projection=(unit?.depth??next?.depth??(tier==='wall'?RULE_PARAMS.low_depth:560))+offset;
  const distance=projection+P.shutterClearance;
  const x0=c.end==='from'?distance:p.at;
  const x1=c.end==='from'?p.at+p.width:own.length-distance;
  return {x0,x1,width:x1-x0,cornerDistance:distance,adjacentFront:projection,clearance:P.shutterClearance};
}

export function arrangeBlindFronts(input, placed, cat, notes=[]) {
  for(const tier of ['base','wall'])for(const p of [...placed[tier]]) {
    if(!p.corner||p.blocker)continue;
    const c=p.corner, w=input.walls.find(w=>w.id===p.wall);
    // Absorb only an existing visible residual beside this cabinet. Catalogue
    // cabinets, anchors and required return-wall corner fillers never move.
    const gap=placed[tier].find(q=>q.wall===p.wall&&q.role==='gap filler'&&
      (c.end==='from'?q.at===p.at+p.width:q.at+q.width===p.at));
    const oldDead=c.end==='from'?p.at:w.length-p.at-p.width;
    let move=Math.min(gap?.width??0,Math.max(0,P.deadSpaceMax-oldDead));
    if(gap && gap.width>move && gap.width-move<RULE_PARAMS.gap_filler_min)
      move=Math.max(0,gap.width-RULE_PARAMS.gap_filler_min);
    if(move>0) {
      const oldAt=p.at;
      p.at+=c.end==='from'?move:-move;
      if(c.end==='from')gap.at+=move;
      gap.width-=move;
      if(!gap.width)placed[tier].splice(placed[tier].indexOf(gap),1);
      const hidden=placed[tier].find(q=>q.hiddenCorner&&q.cornerId===c.id);
      if(hidden){hidden.at=c.end==='from'?0:p.at+p.width;hidden.width+=move;}
      else placed[tier].push({wall:p.wall,at:c.end==='from'?oldAt:p.at+p.width,width:move,
        role:'concealed corner space',blocker:true,hiddenCorner:true,cornerId:c.id,code:null});
      // Tall packing is already complete. Its earlier reservation may share
      // this projection with a window; do not grow overlapping blockers here.
    }
    c.deadSpace=c.end==='from'?p.at:w.length-p.at-p.width;
    p.shutter=blindFront(input,placed,cat,p,tier);
    notes.push(`${p.wall}/${tier}: blind shutter starts ${p.shutter.cornerDistance}mm from the corner, ${P.shutterClearance}mm beyond the adjacent cabinet front; ${c.deadSpace}mm concealed corner space needs no filler`);
  }
  // Replace packing notes after moving a residual into concealed corner space.
  for(let i=notes.length-1;i>=0;i--)if(/mm filler closes the remaining space/.test(notes[i]))notes.splice(i,1);
  for(const tier of ['base','wall','tall'])for(const p of placed[tier])if(p.role==='gap filler')
    notes.push(`${p.wall}/${tier}: ${p.width}mm filler closes the remaining space at ${p.at}; no catalogue cabinet fits this space`);
}

export function blindShutterProblems(input, placed, cat) {
  const problems=[];
  for(const tier of ['base','wall'])for(const p of placed[tier]??[])if(p.corner&&!p.blocker) {
    const w=input.walls.find(w=>w.id===p.wall),dead=p.corner.end==='from'?p.at:w.length-p.at-p.width;
    const expected=blindFront(input,placed,cat,p,tier),s=p.shutter;
    if(dead<0||dead>P.deadSpaceMax)problems.push(`${p.wall}/${tier}: concealed corner space is ${dead}mm; allowed range is 0-${P.deadSpaceMax}mm`);
    if(!s||s.x0!==expected.x0||s.x1!==expected.x1||s.width!==expected.width||s.x0<p.at||s.x1>p.at+p.width||s.width<=0)
      problems.push(`${p.wall}/${tier}: blind shutter must start ${expected.cornerDistance}mm from the corner, ${P.shutterClearance}mm beyond the adjacent cabinet front`);
  }
  return problems;
}

// A drawn zone boundary is not necessarily the end of a physical cabinet run.
// Join touching bands before packing so they cannot acquire an interior dropdown.
function continuousZones(zones) {
  return Object.fromEntries(Object.entries(zones).map(([tier,zs])=>{
    const out=[];
    for(const z of [...zs].sort((a,b)=>String(a.wall).localeCompare(String(b.wall))||a.from-b.from)){
      const last=out.at(-1);
      if(last?.wall===z.wall && last.to===z.from) last.to=z.to;
      else out.push({...z});
    }
    return [tier,out];
  }));
}

export function baseTallInterfaces(input) {
  const zones=continuousZones(input.zones),out=[];
  for(const t of zones.tall??[]) for(const end of ['from','to']) {
    const edge=t[end];
    const continues=(zones.base??[]).some(b=>b.wall===t.wall && (end==='from'
      ? b.from<edge&&b.to>=edge : b.from<=edge&&b.to>edge));
    if(continues) out.push({wall:t.wall,edge,end,
      at:end==='from'?edge:edge-P.tallVisiblePanel,width:P.tallVisiblePanel});
  }
  return out;
}

// A side is concealed only where an actual perpendicular room wall covers it.
// At a reflex corner or an open wall end it is visible from inside the kitchen.
export function tallSideAgainstWall(input, wall, at, depth=560) {
  const ws=outline(input.walls).walls.map(w=>({...w,a:[w.x0,w.y0],b:[w.x1,w.y1]}));
  const own=ws.find(w=>w.id===wall),n=KitchenGeometry.normal(own,ws);
  const x=own.x0+own.dx*at+n[0]*depth/2,y=own.y0+own.dy*at+n[1]*depth/2;
  return ws.some(w=>w.id!==wall && !(input.openWalls??[]).includes(w.id)
    && Math.abs((x-w.x0)*w.dy-(y-w.y0)*w.dx)<0.001
    && (x-w.x0)*w.dx+(y-w.y0)*w.dy>=0 && (x-w.x0)*w.dx+(y-w.y0)*w.dy<=w.length);
}

// A tower owns physical space around a corner as well as on its named wall.
// Reserve its projection before packing the neighbouring runs. In particular,
// a short zone behind the side of a refrigerator is already occupied.
export function reserveTallReturns(input, placed, cat) {
  const ws=outline(input.walls).walls.map(w=>({...w,a:[w.x0,w.y0],b:[w.x1,w.y1]}));
  const byCode=new Map(cat.map(c=>[c.code,c])), spans=new Map(), problems=[];
  for(const p of placed.tall.filter(p=>!p.blocker)){
    const source=ws.find(w=>w.id===p.wall),depth=byCode.get(p.code)?.depth??p.depth??560;
    const box=KitchenGeometry.footprint(source,ws,p.at,p.width,depth,0);
    for(const target of ws.filter(w=>w.id!==p.wall))for(const tier of ['base','wall','tall']){
      const band=KitchenGeometry.footprint(target,ws,0,target.length,tier==='wall'?RULE_PARAMS.low_depth:560,0);
      if(!KitchenGeometry.intersects(box,band))continue;
      const points=[[box.x0,box.y0],[box.x1,box.y0],[box.x0,box.y1],[box.x1,box.y1]];
      const along=points.map(([x,y])=>(x-target.x0)*target.dx+(y-target.y0)*target.dy);
      for(const z of input.zones[tier].filter(z=>z.wall===target.id)){
        const from=Math.max(z.from,Math.min(...along)),to=Math.min(z.to,Math.max(...along));
        if(to>from){const key=`${tier}:${target.id}`;if(!spans.has(key))spans.set(key,[]);spans.get(key).push([from,to]);}
      }
    }
  }
  for(const tier of ['base','wall','tall'])placed[tier]=placed[tier].filter(p=>!p.crossTall);
  for(const [key,intervals] of spans){
    const [tier,wall]=key.split(':'),merged=[];
    for(const [from,to] of intervals.sort((a,b)=>a[0]-b[0])){
      const last=merged.at(-1);if(last&&from<=last[1])last[1]=Math.max(last[1],to);else merged.push([from,to]);
    }
    for(const [from,to] of merged){
      let gaps=[[from,to]];
      for(const p of placed[tier].filter(p=>p.wall===wall)){
        if(!p.blocker&&spansHit(p,{at:from,width:to-from}))problems.push(`${wall}/${tier}: "${p.role}" occupies a perpendicular tall cabinet footprint`);
        gaps=gaps.flatMap(([a,b])=>p.at>=b||p.at+p.width<=a?[[a,b]]:[[a,Math.min(b,p.at)],[Math.max(a,p.at+p.width),b]].filter(([x,y])=>y>x));
      }
      for(const [a,b] of gaps)placeInto(placed,tier,{wall,at:a,width:b-a,role:'perpendicular tall footprint',blocker:true,crossTall:true,code:null});
    }
  }
  return problems;
}

export function wallBaseEndProblems(input,placed){
  const problems=[],zones=continuousZones(input.zones);
  for(const upper of zones.wall)for(const end of ['from','to']){
    const edge=upper[end],base=zones.base.find(b=>b.wall===upper.wall&&b[end]===edge);
    if(!base)continue;
    const touches=p=>p.wall===upper.wall&&(end==='from'?p.at===edge:p.at+p.width===edge);
    const b=placed.base.some(touches),w=placed.wall.some(touches);
    if(b!==w)problems.push(`${upper.wall}: base and wall run ${end} must align at ${edge}mm; ${b?'wall':'base'} run is unfinished`);
  }
  return problems;
}

export function runEndProblems(input, placed, cornerEnds = new Set()) {
  const problems=[];
  for(const tier of ['base','wall','tall'])for(const p of placed[tier]??[]){
    if(p.blocker)continue;
    if(p.role?.startsWith('panel')&&p.width!==P.panel)problems.push(`${p.wall}/${tier}: visible panels must be exactly ${P.panel}mm`);
    if(p.role==='gap filler'&&p.width<RULE_PARAMS.gap_filler_min)problems.push(`${p.wall}/${tier}: gap filler must be at least ${RULE_PARAMS.gap_filler_min}mm`);
    if(p.role==='wall filler'&&p.width!==RULE_PARAMS.wall_filler_width)problems.push(`${p.wall}/${tier}: wall filler must be exactly ${RULE_PARAMS.wall_filler_width}mm`);
    if(tier==='tall'&&p.role?.startsWith('panel')&&(tallSideAgainstWall(input,p.wall,p.at,p.depth??560)||tallSideAgainstWall(input,p.wall,p.at+p.width,p.depth??560)))
      problems.push(`${p.wall}/tall: a side concealed by a wall needs a ${RULE_PARAMS.wall_filler_width}mm filler, not a visible panel`);
  }
  // An anchor flush with a tall-zone edge leaves no packing gap in which to
  // create its end treatment. Still require the panel/filler: an optimizer
  // must not count deleting it as a storage improvement.
  for(const z of continuousZones(input.zones).tall??[])for(const end of ['from','to']){
    if(cornerEnds.has(`tall:${z.wall}:${end}`))continue;
    const edge=z[end],piece=placed.tall.find(p=>p.wall===z.wall&&(end==='from'?p.at===edge:p.at+p.width===edge));
    if(piece?.blocker)continue;
    const concealed=tallSideAgainstWall(input,z.wall,edge,piece?.depth??560);
    const role=concealed?'wall filler':'visible panel',width=concealed?RULE_PARAMS.wall_filler_width:P.panel;
    if(!piece||piece.width!==width||(concealed?piece.role!=='wall filler':!piece.role?.startsWith('panel')))
      problems.push(`${z.wall}/tall: run ${end} at ${edge} needs a ${width}mm ${role}`);
  }
  const junctions=baseTallInterfaces(input);
  for(const junction of junctions){
    const {wall,at,width,edge,end}=junction;
    const panel=placed.tall.find(p=>p.wall===wall&&p.at===at&&p.width===width&&p.tallVisiblePanel);
    if(!panel) problems.push(`${wall}: base/tall junction at ${edge} needs one ${width}mm tall visible panel`);
    const hostEdge=end==='from'?at+width:at;
    if(!placed.tall.some(p=>!p.blocker&&!p.trim&&p.code&&p.wall===wall
      && (end==='from'?p.at===hostEdge:p.at+p.width===hostEdge)))
      problems.push(`${wall}: tall visible panel at ${at} must touch its tall cabinet`);
    if(placed.base.some(p=>!p.blocker&&p.wall===wall&&/^countertop return/.test(p.role)
      && (end==='from'?p.at+p.width===edge:p.at===edge)))
      problems.push(`${wall}: countertop dropdown is not allowed at the base/tall junction at ${edge}`);
  }
  for(const z of continuousZones(input.zones).base??[])for(const end of ['from','to']){
    const edge=z[end],on=placed.base.filter(p=>p.wall===z.wall);
    if(junctions.some(j=>j.wall===z.wall&&j.edge===edge)||cornerEnds.has(`base:${z.wall}:${end}`))continue;
    const touches=p=>end==='from'?p.at<=edge&&p.at+p.width>edge:p.at<edge&&p.at+p.width>=edge;
    if(on.some(p=>(p.blocker||/corner/.test(p.role))&&touches(p)))continue;
    if(!on.some(p=>!p.blocker&&/^countertop return/.test(p.role)&&touches(p)))
      problems.push(`${z.wall}/base: exposed run ${end} at ${edge} requires a countertop dropdown`);
  }
  return problems;
}

function solve(input, cat) {
  input={...input,zones:continuousZones(input.zones)};
  const H = P.heights[input.height];
  const { placed, notes, problems, warnings } = expand(input, cat);
  const packingSpans = [], appliedRuns = new Set();
  problems.push(...reserveTallReturns(input,placed,cat));
  const junctions=baseTallInterfaces(input);
  for(const {wall,at,width,edge} of junctions){
    const clash=placeInto(placed,'tall',{wall,at,width,role:'panel (tall visible)',
      code:null,trim:true,tallVisiblePanel:true});
    if(clash) problems.push(`${wall}: ${width}mm tall visible panel at ${edge} conflicts with "${clash.role}"`);
    else notes.push(`${wall}: base/tall junction at ${edge} uses one ${width}mm tall visible panel; no countertop dropdown`);
  }
  const tallCorners=corners(input,placed,cat,['tall']);
  const cornerEnds=tallCorners.ends,fillerEnds=tallCorners.fillerEnds,cornerCuts=tallCorners.cuts;
  problems.push(...tallCorners.problems,...reserveTallReturns(input,placed,cat));
  const wallLen = Object.fromEntries(input.walls.map((w) => [w.id, w.length]));

  // Preferences may never make an otherwise valid hard layout fail. Drop an optional item
  // if a subsequently-created corner occupies the same space.
  for (const tier of ['base', 'wall', 'tall']) {
    const optional = new Set(['dishwasher', 'glass (chimney flank)', 'tandem pantry', 'microwave + oven']);
    for (const p of [...placed[tier]]) {
      if (!optional.has(p.role)) continue;
      const hit = placed[tier].some((q) => q !== p && q.wall === p.wall
        && Math.min(p.at + p.width, q.at + q.width) > Math.max(p.at, q.at));
      if (hit) {
        placed[tier].splice(placed[tier].indexOf(p), 1);
        warnings.push(`preferred ${p.role} omitted: it conflicts with a required corner or anchor`);
      }
    }
  }

  // Wall and tall cabinets never sit in front of a window; base cabinets may. Pushing the
  // window in as a blocker makes the gap finder route around it with no special casing.
  for (const o of input.openings ?? []) {
    const tiers = o.type === 'door' || (o.sill ?? 900) < RULE_PARAMS.counter_height ? ['base', 'wall', 'tall'] : ['wall', 'tall'];
    for (const tier of tiers)
      placeInto(placed, tier, { wall: o.wall, at: o.at, width: o.width, role: `${o.type} (no cabinet)`, code: null, blocker: true });
  }

  // Fill draws on EVERY module width in the tier, not just shutters — a 300 gap takes a
  // 300 module, a 150 gap takes a 150. Which SKU lands there is pickFill's job.
  // Families that may fill a leftover gap. Purpose units are excluded: a sink, hob, oven or
  // grain trolley is placed by its own rule, never dropped into a gap because the width fits.
  const FILLABLE = { base: ['SH', 'DW', 'AC'], wall: ['SH', 'OP'], tall: ['SH'] };
  const ZONE_OF = { base: 'BC', wall: 'WC', tall: 'TC' };
  const LOW_ZONE_OF = { base: 'BCL', tall: 'TCL' };
  const canFill = (c, tier, lowDepth = false) => c.zone === (lowDepth ? LOW_ZONE_OF[tier] : ZONE_OF[tier])
    && FILLABLE[tier].includes(c.family)
    && (tier !== 'base' || c.handle === input.handle)
    && (tier === 'base' || c.height === (tier === 'wall' ? H.wall : H.tall));
  const uniq = (t, low = false) => [...new Set(cat.filter((c) => canFill(c, t, low)).map((c) => c.width))].sort((a, b) => b - a);
  const widthsFor = { base: uniq('base'), wall: uniq('wall'), tall: uniq('tall'), baseLow: uniq('base', true), tallLow: uniq('tall', true) };

  // Prefer a plain cabinet at that width; fall back to whatever the catalog has there.
  const pickFill = (tier, w, lowDepth = false) => {
    for (const code of input.planningChoice?.preferredCodes ?? []) {
      const unit = cat.find(c => c.code === code && c.width === w && canFill(c, tier, lowDepth));
      if (unit) return unit;
    }
    for (const fam of FILLABLE[tier]) {
      const u = cat.find((c) => canFill(c, tier, lowDepth) && c.family === fam && c.width === w
        && (tier !== 'base' || c.handle === input.handle)
        && (tier === 'base' || c.material === 'ST'));
      if (u) return u;
    }
    return cat.find((c) => canFill(c, tier, lowDepth) && c.width === w) ?? null;
  };
  const roleOf = (u) => {
    const sp = (u?.spec ?? []).join('');
    if (/BPO/.test(sp)) return 'bottle pullout';
    if (/WBP/.test(sp)) return 'waste bin';
    if (u?.family === 'DW') return 'drawers';
    if (u?.family === 'GD') return 'grain trolley';
    if (u?.family === 'OP') return 'open shelf';
    if (u?.zone === 'TC') return 'tall shelf';
    return 'shutter';
  };

  const fillTier = (tier) => {
    const zones=[...(input.zones[tier]??[])];
    if(tier==='tall')zones.sort((a,b)=>(b.to-b.from)-(a.to-a.from)||String(a.wall).localeCompare(String(b.wall))||a.from-b.from);
    for (const originalZone of zones) {
      if(tier==='tall')problems.push(...reserveTallReturns(input,placed,cat));
      const z = { ...originalZone };
      const cut = cornerCuts[`${tier}:${z.wall}`];
      if(z.from===0 && cut?.from!=null) z.from=cut.from;
      if(z.to===wallLen[z.wall] && cut?.to!=null) z.to=cut.to;
      // Only items that actually intersect THIS zone bound its gaps, and every gap is clamped
      // to the zone. Without the clamp a blocker beyond the zone (a window, the next tier's
      // units) invents a gap outside it and the tier fills space it was never given.
      const on = placed[tier]
        .filter((p) => p.wall === z.wall && p.at < z.to && p.at + p.width > z.from)
        .sort((a, b) => a.at - b.at);
      let cursor = z.from;
      const gaps = [];
      for (const p of on) {
        const start = Math.max(p.at, z.from), end = Math.min(p.at + p.width, z.to);
        if (start > cursor) gaps.push([cursor, start]);
        cursor = Math.max(cursor, end);
      }
      if (cursor < z.to) gaps.push([cursor, z.to]);

      // A run has TWO ends. Each is either a corner (the next run butts into it) or a free
      // end, and a free end carries a closure piece that can grow to absorb slack.
      const startFree = !(originalZone.from === 0 && cornerEnds.has(`${tier}:${z.wall}:from`));
      const endFree = !(originalZone.to === wallLen[z.wall] && cornerEnds.has(`${tier}:${z.wall}:to`));

      const columnCuts = (input.columns ?? []).filter((c) => c.wall === z.wall)
        .flatMap((c) => [Math.max(z.from, c.at), Math.min(z.to, c.at + c.width)])
        .filter((x) => x > z.from && x < z.to);
      const segments = gaps.flatMap(([from, to]) => {
        const cuts = [from, ...columnCuts.filter((x) => x > from && x < to).sort((a, b) => a - b), to];
        return cuts.slice(0, -1).map((x, i) => [x, cuts[i + 1]]);
      });
      for (const [from, to] of segments) {
        const lowDepth = tier !== 'wall' && (input.columns ?? []).some((c) => c.wall === z.wall && from >= c.at && to <= c.at + c.width);
        const widths = lowDepth ? widthsFor[`${tier}Low`] : widthsFor[tier];
        const trimWidth = tier === 'base' ? P.countertopReturn : P.panel;
        const endRole = tier === 'base' ? 'countertop return' : 'panel';
        // Panels have a fixed thickness. A concealed tall side gets a wall
        // filler instead; residual packing space is a separate gap filler.
        const sides = [];
        const endPiece = (end) => tier==='tall' && tallSideAgainstWall(input,z.wall,z[end],lowDepth?RULE_PARAMS.low_depth:560)
          ? {role:'wall filler',lo:RULE_PARAMS.wall_filler_width,hi:RULE_PARAMS.wall_filler_width}
          : {role:endRole,lo:trimWidth,hi:trimWidth};
        if (from === z.from) {
          if (fillerEnds.has(`${tier}:${z.wall}:from`)) sides.push({ role: 'corner filler', lo: P.cornerFiller, hi: P.fillerMax });
          else if (startFree && !((tier==='base'||tier==='wall') && junctions.some(j=>j.wall===z.wall&&j.edge===z.from)))
            sides.push(endPiece('from'));
        }
        if (to === z.to) {
          if (fillerEnds.has(`${tier}:${z.wall}:to`)) sides.push({ role: 'corner filler', lo: P.cornerFiller, hi: P.fillerMax, end: true });
          else if (endFree && !((tier==='base'||tier==='wall') && junctions.some(j=>j.wall===z.wall&&j.edge===z.to)))
            sides.push({...endPiece('to'),end:true});
        }
        // Use as much real cabinetry as fits, then close the remaining space
        // with a measured filler of at least the minimum allowed width.
        // Keep mandatory corner fillers and exposed end panels at their ends.
        if (widths.length) {
          const narrowest=Math.min(...widths);
          const cornerStart=sides.some(s=>s.role==='corner filler'&&!s.end);
          const cornerEnd=sides.some(s=>s.role==='corner filler'&&s.end);
          const afterSink=placed[tier].some(p=>p.role==='sink'&&p.wall===z.wall&&p.at+p.width===from);
          const panelStart=tier==='tall'&&placed.tall.some(p=>p.tallVisiblePanel&&p.wall===z.wall&&p.at+p.width===from);
          const panelEnd=tier==='tall'&&placed.tall.some(p=>p.tallVisiblePanel&&p.wall===z.wall&&p.at===to);
          sides.push({role:'gap filler',lo:0,hi:narrowest-1,end:cornerStart||panelStart||(!cornerEnd&&!panelEnd&&!afterSink)});
        }
        const lo = sides.reduce((n, x) => n + x.lo, 0);
        const hi = sides.reduce((n, x) => n + x.hi, 0);
        const spanId = `${tier}:${z.wall}:${from}:${to}`;
        const canSequence = c => canFill(c,tier,lowDepth) || (tier==='base' && !lowDepth
          && c.zone==='BC' && c.handle===input.handle && c.family==='GD' && c.spec.join('+')==='1BL+1HF');
        if(input.capturePackingSpans||input.planningChoice?.runs?.length) packingSpans.push({spanId,tier,wall:z.wall,from,to,length:to-from,
          minimumClosureMm:lo,maximumClosureMm:hi,lowDepth,order:'increasing wall offset',
          eligibleCodes:cat.filter(canSequence).map(c=>c.code)});
        const sequence=input.planningChoice?.runs?.find(run=>run.spanId===spanId);
        let sequenceUnits;
        let r;
        if(sequence){
          appliedRuns.add(spanId);
          sequenceUnits=sequence.cabinetCodes.map(code=>cat.find(c=>c.code===code&&canSequence(c)));
          const slack=to-from-sequenceUnits.reduce((n,c)=>n+(c?.width??0),0);
          r=sequenceUnits.some(c=>!c)?{error:'requested sequence contains an ineligible cabinet'}
            :slack<lo||slack>hi?{error:`requested sequence leaves ${slack}mm; allowed closure is ${lo}-${hi}mm`}
            :{cabinets:sequenceUnits.map(c=>c.width),slack};
        }else r = fill(to - from, widths, lo, hi, input.planningChoice?.preferStorage === true);
        // A gap filler is optional, but cannot be 1..29mm. Try both legal
        // ranges and retain the packing with the most real cabinetry.
        const fillerIndex=sides.findIndex(s=>s.role==='gap filler');
        let chosenSides=sides;
        if(fillerIndex>=0){
          const legal=[];
          for(const present of [false,true]){
            const variant=sides.map((s,i)=>i!==fillerIndex?s:{...s,lo:present?RULE_PARAMS.gap_filler_min:0,hi:present?s.hi:0});
            const min=variant.reduce((n,s)=>n+s.lo,0),max=variant.reduce((n,s)=>n+s.hi,0);
            const packed=sequence ? (!r.error&&r.slack>=min&&r.slack<=max?r:{error:'requested sequence leaves an undersized filler'})
              : fill(to-from,widths,min,max,input.planningChoice?.preferStorage===true);
            if(!packed.error)legal.push({packed,variant});
          }
          legal.sort((a,b)=>a.packed.slack-b.packed.slack);
          if(legal.length){r=legal[0].packed;chosenSides=legal[0].variant;}
          else r={error:r.error??`cannot close the run with fixed panels and fillers of at least ${RULE_PARAMS.gap_filler_min}mm`};
        }
        if (r.error) {
          const note = sides.length ? ` (closure pieces here take ${lo}-${hi}mm of it)` : '';
          problems.push(`${z.wall}/${tier}: ${to - from}mm gap at ${from}${note} — ${r.error}`);
          continue;
        }
        // Give every side its minimum, then let the first one swallow what is left over.
        const alloc = chosenSides.map((x) => x.lo);
        let extra = r.slack - alloc.reduce((n,w)=>n+w,0);
        for (let i = 0; i < sides.length && extra > 0; i++) {
          const give = Math.min(chosenSides[i].hi - alloc[i], extra);
          alloc[i] += give; extra -= give;
        }
        let x = from;
        const closure = (i) => {
          const w = alloc[i];
          if (!w) return;
          const t1 = placeInto(placed, tier, { wall: z.wall, at: x, width: w,
            role: sides[i].role, depth:lowDepth?RULE_PARAMS.low_depth:undefined, code: null, trim: true });
          if (t1) problems.push(`${z.wall}/${tier}: closure piece at ${x} collides with "${t1.role}"`);
          else if(sides[i].role==='gap filler') notes.push(`${z.wall}/${tier}: ${w}mm filler closes the remaining space at ${x}; no catalogue cabinet fits this space`);
          x += w;
        };
        sides.forEach((sd, i) => { if (!sd.end) closure(i); });
        for (const [index,w] of r.cabinets.entries()) {
          const u = sequenceUnits?.[index] ?? pickFill(tier, w, lowDepth);
          const t2 = placeInto(placed, tier, { wall: z.wall, at: x, width: w, depth: u?.depth, role: roleOf(u), code: u?.code });
          if (t2) problems.push(`${z.wall}/${tier}: fill unit at ${x} collides with "${t2.role}"`);
          x += w;
        }
        sides.map((sd,i)=>({sd,i})).filter(({sd})=>sd.end)
          .sort((a,b)=>(b.sd.role==='gap filler')-(a.sd.role==='gap filler'))
          .forEach(({i})=>closure(i));
      }
    }
  };

  // Tall goes first: a tall unit is full height, so once placed it occupies the base and wall
  // tiers too. Filling tall afterwards would let base cabinets land inside the tall block.
  fillTier('tall');
  problems.push(...reserveTallReturns(input,placed,cat));
  for (const t of [...placed.tall]) {
    if (t.blocker) continue;
    for (const tier of ['base', 'wall']) {
      const taken = placeInto(placed, tier, { wall: t.wall, at: t.at, width: t.width, role: `${t.role} (tall above)`, code: null, blocker: true });
      // The tall unit owns this span floor to ceiling, so anything already under it is
      // unbuildable. corners() and expand() both consult occupied(), which knows a tall unit
      // reaches down, so reaching here means a producer skipped that check.
      if (taken) problems.push(`${t.wall}/${tier}: "${t.role}" is full height and owns ${t.at}..${t.at + t.width}, but "${taken.role}" is already there`);
    }
  }
  // Base and upper corners must see the complete tall footprint, including
  // storage cabinets just packed and their perpendicular returns.
  const lowerCorners=corners(input,placed,cat);
  notes.push(...lowerCorners.notes);
  for(const end of lowerCorners.ends)cornerEnds.add(end);
  for(const end of lowerCorners.fillerEnds)fillerEnds.add(end);
  Object.assign(cornerCuts,lowerCorners.cuts);
  problems.push(...lowerCorners.problems);
  if(lowerCorners.used.length&&!placed.base.some(p=>p.role==='LeMans corner'))
    warnings.push('preferred LeMans corner omitted: no eligible 1050mm corner was clear');
  fillTier('base');
  placeRequiredStorage(input,placed,cat);
  fillTier('wall');
  arrangeBlindFronts(input,placed,cat,notes);
  problems.push(...runEndProblems(input,placed,cornerEnds));
  problems.push(...wallBaseEndProblems(input,placed));
  // Nothing may occupy the same millimetre twice. An overlap here is not a rounding slip —
  // it means the input is infeasible, e.g. an anchor placed too close to a corner for the
  // corner unit to fit. Say so rather than silently emitting a layout that cannot be built.
  problems.push(...overlapProblems(placed));
  problems.push(...geometryProblems(input, placed, cat));

  // --- blind corner snapping ------------------------------------------------------
  // A blind or LeMans corner sits on one leg. Reading out from that corner, the OTHER leg
  // must read: a filler of at least corner_filler_min flush to the corner, then, with no gap,
  // an ordinary cabinet. Never a second blind unit — the adjacent leg already carries the
  // blind one — and never a panel, trim or blocker standing in for the cabinet.
  //
  // The filler is produced by fillTier() only when a gap happens to start at the zone edge,
  // so a derived unit landing flush in the corner used to leave the leg with no filler at all
  // and nothing said about it. That is checked here instead of hoped for.
  const byCode = new Map(cat.map((c) => [c.code, c]));
  // A `(tall above)` entry is not a gap — it is the base-tier footprint of a full-height
  // cabinet standing right there. Resolve it to that tall unit so a tower beside the corner
  // filler counts as the cabinet it is, rather than being reported as an empty span.
  const realUnit = (p) => {
    if (!p) return null;
    if (p.blocker && / \(tall above\)$/.test(p.role))
      return placed.tall.find((t) => !t.blocker && t.wall === p.wall && t.at === p.at && t.width === p.width) ?? null;
    return !p.trim && !p.blocker && p.code ? p : null;
  };
  for (const key of fillerEnds) {
    const [tier, wall, end] = key.split(':');
    const z = (input.zones[tier] ?? []).find(x => x.wall===wall && (end==='from'?x.from===0:x.to===wallLen[wall]));
    if (!z) continue;
    const row = placed[tier].filter(p => p.wall===wall && p.at>=z.from && p.at+p.width<=z.to && p.role!=='corner void').sort((a, b) => a.at - b.at);
    // read inward from the corner: 'from' corners read left to right, 'to' corners read back
    const inward = end === 'from' ? row : [...row].reverse();
    const filler = inward[0], neighbour = inward[1];
    const at = end === 'from' ? z.from : z.to;
    if (!filler || !/filler/.test(filler.role)) {
      problems.push(`corner on ${wall} at ${at}: needs a corner filler of at least ${P.cornerFiller}mm against the blind corner, but the run starts with "${filler ? filler.role : 'nothing'}"`);
      continue;
    }
    if (filler.width < P.cornerFiller) {
      problems.push(`corner on ${wall} at ${at}: the corner filler is ${filler.width}mm, under the ${P.cornerFiller}mm minimum`);
      continue;
    }
    const unit = realUnit(neighbour);
    if (!unit) {
      problems.push(`corner on ${wall} at ${at}: the ${filler.width}mm corner filler must be followed by a cabinet, not "${neighbour ? neighbour.role : 'nothing'}"`);
      continue;
    }
    if (byCode.get(unit.code)?.blind)
      problems.push(`corner on ${wall} at ${at}: "${unit.role}" beside the corner filler is a blind unit (${unit.code}) — the adjacent leg already carries the blind corner, so this one takes an ordinary cabinet`);
  }

  // Validate the GENERATED result, not only the designer's three anchors. This is the
  // construction-safety gate: no derived flank, corner or preferred unit may escape a wall
  // or the zone intended for its tier, and every manufactured cabinet must resolve to a SKU.
  const catByCode = new Map(cat.map((c) => [c.code, c]));
  // Closure pieces carry `trim` and legitimately have no SKU; appliances are supplied by the
  // client. Everything else placed without a catalogue row is a bug.
  for (const tier of ['base', 'wall', 'tall']) for (const p of placed[tier]) {
    const len = wallLen[p.wall];
    if (len === undefined) { problems.push(`${p.role}: unknown wall ${p.wall}`); continue; }
    if (p.at < 0 || p.width <= 0 || p.at + p.width > len)
      problems.push(`${p.wall}/${tier}: "${p.role}" spans ${p.at}..${p.at + p.width}, outside wall 0..${len}`);
    if (!p.blocker) {
      const inZone = (input.zones[tier] ?? []).some((z) => z.wall === p.wall && p.at >= z.from && p.at + p.width <= z.to);
      if (!inZone) problems.push(`${p.wall}/${tier}: "${p.role}" is outside its ${tier} zone`);
      if (p.role === 'corner filler' && (p.width < P.cornerFiller || p.width > P.fillerMax))
        problems.push(`${p.wall}/${tier}: automatic corner filler must be ${P.cornerFiller}-${P.fillerMax}mm`);
      if (p.role === 'filler' && (p.width < P.fillerMin || p.width > P.manualFillerMax))
        problems.push(`${p.wall}/${tier}: filler ${p.width}mm is outside ${P.fillerMin}-${P.manualFillerMax}mm`);
      if (p.code) {
        const unit = catByCode.get(p.code);
        if (!unit) problems.push(`${p.wall}/${tier}: unknown catalog code ${p.code}`);
        else if (unit.width !== p.width) problems.push(`${p.wall}/${tier}: ${p.code} is ${unit.width}mm, placed as ${p.width}mm`);
        else {
          if (unit.group && unit.group !== tier) problems.push(`${p.wall}/${tier}: ${p.code} belongs to ${unit.group}, not ${tier}`);
          if (tier === 'base' && unit.handle !== input.handle)
            problems.push(`${p.wall}/${tier}: ${p.code} uses ${unit.handle}, project requires ${input.handle}`);
          if (tier === 'wall' && unit.height !== H.wall)
            problems.push(`${p.wall}/${tier}: ${p.code} height ${unit.height}mm does not match ${input.height}`);
          if (tier === 'tall' && unit.height !== H.tall)
            problems.push(`${p.wall}/${tier}: ${p.code} height ${unit.height}mm does not match ${input.height}`);
        }
      } else if (!p.trim && !['chimney', 'dishwasher'].includes(p.role))
        problems.push(`${p.wall}/${tier}: no catalog SKU for "${p.role}" at ${p.width}mm`);
    }
  }

  const sink = placed.base.find((p) => p.role === 'sink');
  const hob = placed.base.find((p) => p.role === 'hob');
  const dw = placed.base.find((p) => p.role === 'dishwasher');

  for (const role of ['hob', 'sink', 'refrigerator', 'chimney'])
    if (!Object.values(placed).some((items) => items.some((p) => p.role === role)))
      problems.push(`mandatory component missing: ${role}`);

  problems.push(...requiredStorageProblems(placed));

  if (dw && sink && (dw.wall !== sink.wall || (dw.at !== sink.at + sink.width && dw.at + dw.width !== sink.at)))
    problems.push('dishwasher is present but is not immediately beside the sink');

  if (hob && sink) {
    let gap = Infinity;
    if (hob.wall === sink.wall)
      gap = Math.max(hob.at, sink.at) - Math.min(hob.at + hob.width, sink.at + sink.width);
    else {
      const order = input.walls.map((w) => w.id);
      for (let i = 0; i < order.length; i++) {
        const a = order[i], b = order[(i + 1) % order.length];
        if (hob.wall === a && sink.wall === b) gap = wallLen[a] - (hob.at + hob.width) + sink.at;
        if (sink.wall === a && hob.wall === b) gap = wallLen[a] - (sink.at + sink.width) + hob.at;
      }
    }
    if (gap < RULE_PARAMS.hob_sink_min_gap)
      problems.push(`placed hob and sink are ${gap}mm apart along the countertop; minimum is ${RULE_PARAMS.hob_sink_min_gap}mm`);
  }

  if (input.lockAnchors) for (const a of input.anchors) {
    const tier = a.item === 'fridge' ? 'tall' : 'base';
    const p = placed[tier].find(p => p.role === (a.item === 'fridge' ? 'refrigerator' : a.item));
    if (!p || p.wall !== a.wall || p.at !== a.at || p.width !== a.width)
      problems.push(`locked anchor ${a.item}: generated position or width differs from input`);
  }

  if (!dw) warnings.push('preferred model omitted: dishwasher');
  if (!placed.tall.some((p) => p.role === 'tandem pantry')) warnings.push('preferred model omitted: tandem pantry');
  if (!placed.tall.some((p) => p.role === 'microwave + oven')) warnings.push('preferred model omitted: microwave + oven');

  // Dish-rack and vegetable-basket requirements were cancelled by the designer.
  const unresolved = [];

  problems.push(...wallFlankProblems(placed));
  problems.push(...blindCornerProblems(input, placed));
  problems.push(...blindShutterProblems(input, placed, cat));
  for(const run of input.planningChoice?.runs??[]){
    if(!appliedRuns.has(run.spanId)) problems.push(`AI sequence ${run.spanId}: span changed or is unavailable; request current packing spans`);
    else {
      const span=packingSpans.find(s=>s.spanId===run.spanId);
      if(span){
        const actual=placed[span.tier].filter(p=>p.code&&!p.blocker&&p.wall===span.wall&&p.at>=span.from&&p.at+p.width<=span.to)
          .sort((a,b)=>a.at-b.at).map(p=>p.code);
        if(JSON.stringify(actual)!==JSON.stringify(run.cabinetCodes))problems.push(`AI sequence ${run.spanId}: required storage or clearance rules changed the requested sequence`);
      }
    }
  }
  return { placed, notes, unresolved, packingSpans, problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
}

export function wallFlankProblems(placed){
  const problems=[];
  for(const hob of placed.base.filter(p=>p.role==='hob')){
    const flanks=placed.base.filter(p=>!p.blocker&&!p.trim&&p.code&&p.wall===hob.wall&&(p.at+p.width===hob.at||p.at===hob.at+hob.width));
    const widths=flanks.map(p=>p.width).filter(w=>P.flankToWall[w]);
    const expected=P.flankToWall[Math.max(...widths)];
    const hood=placed.wall.find(p=>p.wall===hob.wall&&p.role==='chimney');
    if(!hood)continue; // mandatory-component validation reports this separately
    const left=placed.wall.find(p=>p.wall===hob.wall&&p.code&&!p.blocker&&p.at+p.width===hood.at);
    const right=placed.wall.find(p=>p.wall===hob.wall&&p.code&&!p.blocker&&p.at===hood.at+hood.width);
    if(!expected||left?.width!==expected||right?.width!==expected)
      problems.push(`${hob.wall}/wall: wall-width-follows-hob-flank requires matching ${expected||'catalogue-mapped'}mm chimney-side cabinets; found ${left?.width??'missing'} / ${right?.width??'missing'}mm`);
  }
  return problems;
}

const touches = (a,b) => a.wall===b.wall && (a.at+a.width===b.at || b.at+b.width===a.at);
const ordinaryUnit = p => p.code && !p.blocker && !p.trim && !/corner/.test(p.role);
const bottleNearHob = (unit,placed) => {
  const hob=placed.base.find(p=>p.role==='hob');
  return !!hob && (touches(unit,hob) || placed.base.some(p=>p!==unit && ordinaryUnit(p)
    && touches(p,hob) && touches(unit,p)));
};

export function requiredStorageProblems(placed) {
  const problems=[];
  if (!placed.base.some(p=>ordinaryUnit(p)&&p.role==='grain trolley'))
    problems.push('The kitchen needs at least one grain trolley. It can be placed away from the hob.');
  const bottles=placed.base.filter(p=>ordinaryUnit(p)&&p.role==='bottle pullout');
  if (!bottles.length) problems.push('The kitchen needs at least one bottle pullout beside the hob or beside one of its flanking cabinets.');
  else if (!bottles.some(p=>bottleNearHob(p,placed)))
    problems.push('Place at least one bottle pullout beside the hob or beside one of its flanking cabinets.');
  return problems;
}

// Refit ordinary storage with catalogue products without changing the occupied
// span, end panels, designer choices, appliances or blind corners. This allows
// storage beyond the hob's flanks while keeping the original exact packing.
export function placeRequiredStorage(input,placed,cat) {
  const hob=placed.base.find(p=>p.role==='hob');
  if (!hob) return;
  const cabinets=cat.filter(c=>c.zone==='BC'&&c.handle===input.handle);
  const plain=cabinets.filter(c=>['SH','DW'].includes(c.family));
  const widths=[...new Set(plain.map(c=>c.width))].sort((a,b)=>b-a);
  const packs=new Map();
  for (const role of ['bottle pullout','grain trolley']) {
    if (placed.base.some(p=>ordinaryUnit(p)&&p.role===role&&(role!=='bottle pullout'||bottleNearHob(p,placed)))) continue;
    const units=cabinets.filter(c=>role==='grain trolley'?c.family==='GD':c.family==='AC'&&c.spec.includes('BPO'))
      .filter((c,i,all)=>all.findIndex(x=>x.width===c.width)===i).sort((a,b)=>b.width-a.width);
    const candidates=[];
    for (const wall of input.walls) {
      const row=placed.base.filter(p=>p.wall===wall.id).sort((a,b)=>a.at-b.at);
      for (let i=0;i<row.length;i++) {
        const group=[];
        for (let k=i;k<Math.min(row.length,i+3);k++) {
          const p=row[k];
          if (!ordinaryUnit(p)||p.designerChoice||!['drawers','shutter'].includes(p.role)
            ||(p.depth??560)!==560 || (group.length && !touches(group.at(-1),p))) break;
          group.push(p);
          const at=group[0].at,total=group.reduce((s,p)=>s+p.width,0);
          for (const unit of units) {
            const remaining=total-unit.width;
            if(!packs.has(remaining))packs.set(remaining,fill(remaining,widths,0,0,true));
            const packed=packs.get(remaining);
            if (packed.error) continue;
            for (const end of [false,true]) {
              const replacement={wall:wall.id,at:end?at+total-unit.width:at,width:unit.width,code:unit.code,role};
              const others=placed.base.filter(p=>!group.includes(p));
              if (role==='bottle pullout'&&!bottleNearHob(replacement,{base:others})) continue;
              // Keep the chimney sizing valid: an immediate hob-side cabinet
              // can change its function, but not its width during this pass.
              if (group.some(p=>touches(p,hob)) && (group.length!==1||unit.width!==total)) continue;
              const distance=wall.id===hob.wall?Math.min(Math.abs(replacement.at-hob.at-hob.width),Math.abs(hob.at-replacement.at-unit.width)):1e6;
              candidates.push({group:[...group],unit,packed,at,total,end,wall:wall.id,distance});
            }
          }
        }
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.group.length-b.group.length||b.unit.width-a.unit.width);
    const c=candidates[0];if(!c)continue;
    placed.base=placed.base.filter(p=>!c.group.includes(p));
    let at=c.at;
    const put=(u,role)=>{placed.base.push({wall:c.wall,at,width:u.width,code:u.code,role,depth:u.depth});at+=u.width;};
    if(!c.end)put(c.unit,role);
    for(const width of c.packed.cabinets){
      const u=plain.find(c=>c.width===width&&input.planningChoice?.preferredCodes?.includes(c.code))??plain.find(c=>c.width===width);
      put(u,u.family==='DW'?'drawers':'shutter');
    }
    if(c.end)put(c.unit,role);
  }
}

// Compare actual occupied cabinet volume and trim, after feasibility. Movement
// is a tie-breaker in callers so an equally good fit stays where it was drawn.
export function fitQuality(result) {
  const items=Object.values(result.placed).flat().filter(p=>!p.blocker);
  return [result.problems.length?1:0,physicalConflictCount(result),result.problems.length,
    result.unresolved?.length??0,
    items.filter(p=>p.trim).reduce((n,p)=>n+avoidableTrim(p),0),
    -items.filter(p=>p.code&&!['hob','sink','refrigerator','microwave + oven'].includes(p.role)).reduce((n,p)=>n+p.width*(p.height??0)*(p.depth??0),0),
    items.filter(p=>p.role==='gap filler').length];
}
export function avoidableTrim(p){
  const required=p.role==='corner filler'?RULE_PARAMS.corner_filler_min
    :p.role==='wall filler'?RULE_PARAMS.wall_filler_width
    :p.role?.startsWith('countertop return')?RULE_PARAMS.countertop_return
    :p.role==='panel (tall visible)'?RULE_PARAMS.tall_visible_panel_width
    :p.role?.startsWith('panel')?RULE_PARAMS.panel_width:0;
  return Math.max(0,p.width-(required??0));
}
// An unresolved corner is still a physical failure even though its reserved
// square now prevents downstream overlap spam. Do not reward an empty failed
// corner over an arrangement whose actual cabinet geometry is valid.
const physicalConflictCount = result => result.problems.filter(p=>/physical overlap:|overlap by|intersects|obstructs|outside the room|no corner unit and/.test(p)).length;
export const betterFit = (a,b) => {
  const qa=fitQuality(a),qb=fitQuality(b);
  for(let i=0;i<qa.length;i++)if(qa[i]!==qb[i])return qa[i]<qb[i];
  return false;
};

// Evaluate coupled choices globally. Hard feasibility wins first; among equally feasible
// layouts retain more preferences, then choose the larger hob. `fast` keeps interactive
// position scans responsive while the final render evaluates every preference combination.
// Where two tiers meet on a wall, the line the designer drew is soft: giving the tall run
// 50mm more and the base run 50mm less changes nothing anyone would notice. Find those shared
// edges so the repair pass can slide them.
function boundaries(input) {
  const tiers = ['base', 'wall', 'tall'];
  const out = [];
  for (let i = 0; i < tiers.length; i++) for (let k = i + 1; k < tiers.length; k++) {
    (input.zones[tiers[i]] ?? []).forEach((a, ai) => (input.zones[tiers[k]] ?? []).forEach((b, bi) => {
      if (a.wall !== b.wall) return;
      if (a.to === b.from) out.push({ wall: a.wall, at: a.to, lo: [tiers[i], ai], hi: [tiers[k], bi] });
      if (b.to === a.from) out.push({ wall: a.wall, at: b.to, lo: [tiers[k], bi], hi: [tiers[i], ai] });
    }));
  }
  return out;
}

function shiftBoundary(input, b, d) {
  const j = structuredClone(input);
  const lo = j.zones[b.lo[0]][b.lo[1]], hi = j.zones[b.hi[0]][b.hi[1]];
  lo.to += d; hi.from += d;
  if (lo.to - lo.from < 1 || hi.to - hi.from < 1) return null;
  // An anchor may not be pushed out of the zone that hosts it.
  for (const a of j.anchors) for (const z of [lo, hi])
    if (a.wall === z.wall && a.at < z.to && a.at + a.width > z.from
      && (a.at < z.from || a.at + a.width > z.to)) return null;
  return j;
}

function solveAll(input, cat, fast) {
  const hobWidths = input.lockAnchors ? [input.anchors.find(a => a.item === 'hob').width]
    : [...RULE_PARAMS.hob_widths].sort((a, b) => b - a);
  // Position scans must evaluate the complete appliance bank too. Omitting
  // it during scans can make a promising position worse when it is restored.
  const masks = fast ? [0, 7] : Array.from({ length: 8 }, (_, i) => i);
  const candidates = [];
  const directSides = input.searchHobSides ? [600,450].flatMap(grainW=>[300,150].flatMap(bpoW=>['grain-left','bpo-left'].map(side=>({grainW,bpoW,side})))) : [null];
  const namedFlanks=input.anchors.find(a=>a.item==='hob')?.flanks;
  const sideChoices = namedFlanks?.left && namedFlanks?.right ? [null]
    : [...directSides, ...[900,600,450].map(flankW=>({flankW}))];
  for (const hobWidth of hobWidths) for (const mask of masks) for (const sides of sideChoices)
    for(const tallSide of mask&4 ? [undefined] : ['right','left']) {
    const trial = structuredClone(input);
    if(sides) trial._solveHobSides = sides;
    trial._solveHobWidth = hobWidth;
    trial._solveTallSide = tallSide;
    const anchoredHob = trial.anchors.find(a=>a.item==='hob');
    if (anchoredHob?.center != null) { anchoredHob.at=Math.round(anchoredHob.center-hobWidth/2); anchoredHob.width=hobWidth; }
    trial._omitPreferred = [
      ...(mask & 1 ? ['dishwasher'] : []),
      ...(mask & 2 ? ['glass'] : []),
      ...(mask & 4 ? ['talls'] : []),
    ];
    const result = solve(trial, cat);
    const placedHob = result.placed.base.find((p) => p.role === 'hob');
    const tallModels=result.placed.tall.filter(p=>['tandem pantry','microwave + oven'].includes(p.role)).length;
    candidates.push({ ...result, hobWidth: placedHob?.width ?? 0, omitted: trial._omitPreferred.length, tallModels });
  }
  candidates.sort((a, b) => (a.problems.length?1:0)-(b.problems.length?1:0)
    || physicalConflictCount(a)-physicalConflictCount(b)
    || a.problems.length - b.problems.length
    || a.unresolved.length - b.unresolved.length
    || b.tallModels-a.tallModels
    || a.omitted - b.omitted
    || b.hobWidth - a.hobWidth
    || (betterFit(a,b)?-1:betterFit(b,a)?1:0)
    || a.warnings.length - b.warnings.length);
  const { hobWidth, omitted, tallModels, ...best } = candidates[0];
  return best;
}

const cheaper = (a, b) => physicalConflictCount(a)!==physicalConflictCount(b) ? physicalConflictCount(a)<physicalConflictCount(b)
  : a.problems.length !== b.problems.length ? a.problems.length < b.problems.length
  : a.warnings.length < b.warnings.length;

// Nudges for one anchor, smallest first, alternating sign so the same input always produces
// the same layout: -25, +25, -50, +50, ... Ties break toward the wall start.
function* anchorNudges(input, tol, step) {
  for (let m = step; m <= tol; m += step) for (const d of [-m, m]) {
    for (let i = 0; i < input.anchors.length; i++) {
      const at = input.anchors[i].at + d;
      if (at < 0) continue;
      const j = structuredClone(input);
      j.anchors[i].at = at;
      if(j.anchors[i].center != null) j.anchors[i].center += d;
      yield { j, who: j.anchors[i].item, from: input.anchors[i].at, to: at, d };
    }
  }
}

export function layout(input, cat, { fast = false } = {}) {
  const invalid = check(input);
  if(invalid.length) return { placed: {base:[],wall:[],tall:[]}, notes:[], warnings:[], unresolved:[], problems:invalid };
  const best = solveAll(input, cat, fast);
  // Locked planning candidates stay fixed. Direct callers may also improve a
  // valid layout using the designer's authorized 100mm appliance tolerance.
  if (!best.problems.length && input.lockAnchors) return best;

  // Two repair mechanisms, tried in order and NEVER combined: a result keeps either a shifted
  // zone boundary or a moved anchor, so drift from what the designer drew is capped by one
  // tolerance rather than the sum of both. Every trial re-derives from the ORIGINAL input, so
  // repairs never compound with each other either.
  let win = best;

  // 1. zone boundaries — the cheaper repair, because it moves a band edge, not a fixture.
  const tol = input.lockZones || !best.problems.length ? 0 : RULE_PARAMS.zone_boundary_tolerance ?? 0;
  for (const b of tol ? boundaries(input) : []) {
    for (let d = -tol; d <= tol; d += P.panel) {
      if (!d) continue;
      const shifted = shiftBoundary(input, b, d);
      if (!shifted || check(shifted).length) continue;
      const r = solveAll(shifted, cat, fast);
      if (!cheaper(r, win)) continue;
      win = { ...r, notes: [...r.notes,
        `wall ${b.wall}: ${b.lo[0]}/${b.hi[0]} boundary moved ${d > 0 ? '+' : ''}${d}mm (${b.at} -> ${b.at + d}) ? ${r.problems.length?'reduces remaining conflicts':'both tiers close'}`] };
    }
  }

  // 2. anchors. The designer's position is where the fixture wants to be, not a survey mark:
  // a run can miss closing by a few millimetres that a small slide along the SAME wall fixes.
  // check() re-validates every candidate, so a nudge can never push an anchor out of
  // its zone, into a door or window, or across the hob/sink/fridge separation rules — those
  // stay exactly as strict as they are for a designer's own placement.
  const atol = input.lockAnchors ? 0 : RULE_PARAMS.anchor_tolerance ?? 0;
  for (const mv of atol ? anchorNudges(input, atol, P.panel) : []) {
    if (check(mv.j).length) continue;
    const r = solveAll(mv.j, cat, fast);
    if (!betterFit(r, win)) continue;
    win = { ...r, notes: [...r.notes,
      `${mv.who} moved ${mv.d > 0 ? '+' : ''}${mv.d}mm along its wall (${mv.from} -> ${mv.to}) — ${r.problems.length?'reduces remaining conflicts':'improves cabinet fit and reduces wasted space'}; within the ${atol}mm anchor tolerance`] };
  }
  return win;
}

// R29 — the release gate. A hard failure rejects even when other facts are unknown; with no
// failure, an unresolved rule still blocks, because "we never checked" is not "it passed".
// Soft notes never block. Mirrors the spec's REJECTED / UNRESOLVED / FEASIBLE outcomes.
export function gate({ problems = [], unresolved = [], warnings = [] }) {
  if (problems.length)
    return { verdict: 'REJECTED', releaseBlocked: true, blocking: problems, notes: warnings };
  if (unresolved.length)
    return { verdict: 'UNRESOLVED', releaseBlocked: true, blocking: unresolved, notes: warnings };
  return { verdict: 'FEASIBLE', releaseBlocked: false, blocking: [], notes: warnings };
}

if (process.argv[1]?.endsWith('engine.mjs')) {
  const { readFileSync } = await import('node:fs');
  const input = JSON.parse(readFileSync(process.argv[2] ?? 'data/default-kitchen.json', 'utf8'));
  const { ok: cat } = loadCatalog();
  const { placed, notes, problems, warnings, unresolved } = layout(input, cat);

  console.log(`\n${input.project} — ${input.height}, ${input.handle} handles, ${cat.length} cabinets available\n`);
  for (const n of notes) console.log(`  . ${n}`);
  for (const tier of ['tall', 'base', 'wall']) {
    for (const w of input.walls) {
      const items = placed[tier].filter((p) => p.wall === w.id).sort((a, b) => a.at - b.at);
      if (!items.length) continue;
      console.log(`\n  ${tier.toUpperCase()}  wall ${w.id} (${w.length}mm)`);
      for (const i of items) {
        console.log(`    ${String(i.at).padStart(5)} +${String(i.width).padEnd(5)} ${i.role.padEnd(22)} ${i.code ?? ''}`);
      }
      console.log(`          = ${items.reduce((s, i) => s + i.width, 0)} placed`);
    }
  }
  if (problems.length) {
    console.log('\n  PROBLEMS');
    for (const p of problems) console.log(`    x ${p}`);
  }
  const g = gate({ problems, unresolved, warnings });
  console.log(`\n  ${g.verdict}${g.releaseBlocked ? '  (release blocked)' : ''}`);
  if (unresolved.length) {
    console.log('\n  UNRESOLVED');
    for (const u of unresolved) console.log(`    ? ${u}`);
  }
  if (warnings.length) {
    console.log('\n  PREFERENCES / WARNINGS');
    for (const w of warnings) console.log(`    ! ${w}`);
  }
  console.log();
}
