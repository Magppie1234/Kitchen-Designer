// correct.mjs — a kitchen is always drawn. When the designer's setup cannot be fitted as
// given, the appliances and cabinet bands are corrected — slightly: an appliance stays on its
// wall and moves at most 300 mm, a band edge moves at most 300 mm — and every correction is
// reported. The room itself — walls, doors, windows, beams and columns — is fixed and is
// never changed here (rules.json: kitchen-always-drawn-with-corrections).
//
// Search: candidate inputs are scored with the fast packing layout (~70 ms each), cheapest
// correction first, and a passing candidate is confirmed by the full planner.
import { layout } from './engine.mjs';
import { planKitchen } from './planner.mjs';
import { check } from './checkInput.mjs';

const TIER = { hob: 'base', sink: 'base', veggie: 'base', fridge: 'tall' };
const NAME = { hob: 'Hob', sink: 'Sink', veggie: 'Veggie sink', fridge: 'Refrigerator' };
const BAND = { base: 'Base cabinet band', wall: 'Wall cabinet band', tall: 'Tall cabinet band' };
const MAX_SHIFT = 300, SHIFTS = [-300, -200, -100, 100, 200, 300];
const clone = structuredClone;

// Input errors a correction can resolve. Anything else (walls, handle, island setup) is a
// missing designer choice, not a layout that failed, and is still reported as such.
const FIXABLE = /^(anchor (hob|sink|veggie|fridge): must be fully inside|anchors \w+ and \w+ overlap|(hob|sink|veggie|fridge) is in front of a (door|window)|hob and sink are -?\d+mm apart|(base|wall|tall) zones overlap|tall zones overlap)/;
export const fixableInput = (errors) => errors.length > 0 && errors.every((e) => FIXABLE.test(e));

// Fallback only, for a room whose zone tool was never used: every wall long enough to
// furnish carries base and wall runs, and the fridge anchors a tall band.
export function deriveZones(walls, anchors, openings = []) {
  const zones = { base: [], wall: [], tall: [] };
  const fridge = anchors.find((a) => a.item === 'fridge');
  const TALL_BAND = 1800;
  for (const w of walls) {
    if (w.length < 600) continue;
    if (fridge && fridge.wall === w.id) {
      // Grow the tall band out from the fridge, but never over another anchor, door or window
      // on the same wall — a floor-to-ceiling band can never stand in front of an opening.
      const others = [...anchors.filter((a) => a !== fridge && a.wall === w.id), ...openings.filter((o) => o.wall === w.id)]
        .sort((a, b) => a.at - b.at);
      const rightLimit = others.find((a) => a.at >= fridge.at + fridge.width)?.at ?? w.length;
      const leftLimit = [...others].reverse().find((a) => a.at + a.width <= fridge.at);
      const floor = leftLimit ? leftLimit.at + leftLimit.width : 0;
      let to = Math.min(rightLimit, fridge.at + TALL_BAND);
      let from = to - fridge.at >= TALL_BAND ? fridge.at : Math.max(floor, to - TALL_BAND);
      from = Math.min(from, fridge.at);
      to = Math.max(to, fridge.at + fridge.width);
      if (from > 0) for (const t of ['base', 'wall']) zones[t].push({ wall: w.id, from: 0, to: from });
      zones.tall.push({ wall: w.id, from, to });
      if (to < w.length) for (const t of ['base', 'wall']) zones[t].push({ wall: w.id, from: to, to: w.length });
    } else {
      for (const t of ['base', 'wall']) zones[t].push({ wall: w.id, from: 0, to: w.length });
    }
  }
  return zones;
}

const inside = (a, z) => z.wall === a.wall && a.at >= z.from && a.at + a.width <= z.to;
function merge(zs) {
  const out = [];
  for (const z of [...zs].sort((a, b) => String(a.wall).localeCompare(String(b.wall)) || a.from - b.from)) {
    const last = out.at(-1);
    if (last && last.wall === z.wall && z.from <= last.to) last.to = Math.max(last.to, z.to);
    else out.push({ ...z });
  }
  return out;
}

// After an appliance moves, give it a band. Bands the designer never drew are re-derived
// exactly as for a fresh room; drawn bands are kept, the appliance's own band is stretched to
// hold it, and base/wall bands are cut back out of any tall band.
function rezone(s) {
  const j = s.j, open = new Set(j.openWalls ?? []);
  if (s.derived) {
    j.zones = deriveZones(j.walls.filter((w) => !open.has(w.id)), j.anchors.filter((a) => a.location !== 'island'), j.openings ?? []);
    return s;
  }
  for (const a of j.anchors) {
    if (a.location === 'island') continue;
    const zs = j.zones[TIER[a.item]];
    if (zs.some((z) => inside(a, z))) continue;
    const near = zs.filter((z) => z.wall === a.wall)
      .sort((x, y) => Math.min(Math.abs(x.from - a.at), Math.abs(x.to - a.at)) - Math.min(Math.abs(y.from - a.at), Math.abs(y.to - a.at)))[0];
    if (near) { near.from = Math.min(near.from, a.at); near.to = Math.max(near.to, a.at + a.width); }
    else zs.push({ wall: a.wall, from: a.at, to: a.at + a.width });
  }
  for (const t of ['base', 'wall', 'tall']) j.zones[t] = merge(j.zones[t]);
  for (const t of ['base', 'wall']) j.zones[t] = j.zones[t].flatMap((z) => {
    let parts = [z];
    for (const tall of j.zones.tall.filter((x) => x.wall === z.wall))
      parts = parts.flatMap((p) => p.to <= tall.from || p.from >= tall.to ? [p]
        : [{ ...p, to: tall.from }, { ...p, from: tall.to }].filter((q) => q.to - q.from >= 150));
    return parts;
  });
  return s;
}

// How much a candidate departs from the designer's setup: appliance travel (a change of wall
// costs extra) plus every millimetre of cabinet band gained or lost.
function cost(original, j) {
  let c = 0;
  original.anchors.forEach((a, i) => {
    const b = j.anchors[i];
    c += Math.abs(a.at - b.at);
  });
  for (const t of ['base', 'wall', 'tall']) for (const w of original.walls) {
    const len = (zs) => zs.filter((z) => z.wall === w.id).reduce((n, z) => n + z.to - z.from, 0);
    c += Math.abs(len(original.zones[t]) - len(j.zones[t]));
  }
  return c;
}

// Designer limit: an appliance stays on its own wall and moves at most MAX_SHIFT; every
// band edge stays within MAX_SHIFT of where it was set up. Nothing is added or removed.
export function withinLimits(original, j) {
  if (original.anchors.some((a, i) => a.wall !== j.anchors[i].wall || Math.abs(a.at - j.anchors[i].at) > MAX_SHIFT)) return false;
  for (const t of ['base', 'wall', 'tall']) for (const w of original.walls) {
    const on = (zs) => zs.filter((z) => z.wall === w.id).sort((a, b) => a.from - b.from);
    const a = on(original.zones[t]), b = on(j.zones[t]);
    if (a.length !== b.length || a.some((z, n) => Math.abs(z.from - b[n].from) > MAX_SHIFT || Math.abs(z.to - b[n].to) > MAX_SHIFT)) return false;
  }
  return true;
}

function* candidates(s, original) {
  const j = s.j;
  for (const [i, a] of j.anchors.entries()) {
    if (a.location === 'island') continue;
    const len = j.walls.find((w) => w.id === a.wall).length;
    for (const d of SHIFTS) {
      const at = a.at + d;
      if (at < 0 || at + a.width > len) continue;
      const k = { j: clone(j), derived: s.derived };
      k.j.anchors[i].at = at;
      if (a.center != null) k.j.anchors[i].center = at + a.width / 2;
      k.walls = [a.wall];
      yield rezone(k);
    }
  }
  for (const t of ['base', 'wall', 'tall']) for (const [zi, z] of j.zones[t].entries()) for (const edge of ['from', 'to'])
    for (const d of SHIFTS) {
      const at = z[edge] + d, len = j.walls.find((w) => w.id === z.wall).length;
      if (at < 0 || at > len) continue;
      const k = { j: clone(j), derived: false };
      k.j.zones[t][zi][edge] = at;
      k.walls = [z.wall];
      yield rezone(k);
    }
}

// Walls a problem message names ("0/base: …", "corner 1/2/base: …", "corner on 3 at …",
// "… on wall 2", "… on 2 (…)") — changes on those walls are tried first.
function problemWalls(problems) {
  const ids = new Set();
  for (const p of problems)
    for (const m of p.matchAll(/(?:^|corner |corner on |on wall |on |wall )(\d+)(?:\/(\d+))?/g)) { ids.add(m[1]); if (m[2]) ids.add(m[2]); }
  return [...ids];
}
function score(j, catalog) {
  const errors = check(j);
  if (errors.length) return { problems: 1000 + errors.length, walls: problemWalls(errors) };
  const r = layout({ ...j, lockAnchors: true, lockZones: true, searchHobSides: true }, catalog, { fast: 'packing' });
  return { problems: r.problems.length, walls: problemWalls(r.problems) };
}
const better = (a, b) => a.problems < b.problems || (a.problems === b.problems && a.cost < b.cost);

// Returns the corrected engine input and its full layout. If the time budget runs out first,
// the least-broken arrangement found is returned; its result may still carry problems.
export async function correctKitchen(start, catalog, { original = start, derived = false, budgetMs = 30000, perRound = 400 } = {}) {
  const t0 = Date.now(), seen = new Set();
  const key = (j) => JSON.stringify([j.anchors.map((a) => [a.wall, a.at]), j.zones]);
  let current = { j: clone(start), derived, ...score(start, catalog) };
  current.cost = cost(original, current.j);
  let best = current, confirmed = 0;
  seen.add(key(current.j));
  while (Date.now() - t0 < budgetMs) {
    if (!current.problems) {
      const full = await planKitchen(current.j, catalog);
      if (!full.problems.length) return { input: current.j, result: full };
      if (++confirmed >= 3) break;
      current.problems = full.problems.length;           // fast and full disagree: keep looking
      current.walls = problemWalls(full.problems);
    }
    const pool = [];
    for (const k of candidates(current, original)) {
      const id = key(k.j);
      if (seen.has(id) || !withinLimits(original, k.j)) continue;
      seen.add(id); k.cost = cost(original, k.j); pool.push(k);
    }
    // Changes on the walls the remaining problems name come first, cheapest first.
    const hot = new Set(current.walls ?? []), off = (k) => (k.walls ?? []).some((w) => hot.has(w)) ? 0 : 1;
    pool.sort((a, b) => off(a) - off(b) || a.cost - b.cost);
    let next = null;
    for (const k of pool.slice(0, perRound)) {
      if (Date.now() - t0 >= budgetMs) break;
      Object.assign(k, score(k.j, catalog));
      if (!next || better(k, next)) next = k;
      if (!k.problems) break;                             // cheapest passing correction wins
      await new Promise((r) => setImmediate(r));
    }
    if (!next || next.problems > current.problems) break;   // sideways is fine, worse is not
    if (better(next, best)) best = next;
    current = next;
  }
  // Still breaking a placement rule the limits cannot fix (an appliance in front of a door or
  // window, hob too close to the sink): draw it anyway with that rule waived, and hand the
  // broken rules back so they are listed for the designer.
  const errors = check(best.j), waived = [...new Set(errors.map((e) => e.match(/\((anchors-never-in-front-of-door|window-rules-by-anchor|hob-sink-min-gap)\)$/)?.[1]).filter(Boolean))];
  if (waived.length) best.j.waived = waived;
  return { input: best.j, result: await planKitchen(best.j, catalog), waived: errors.filter((e) => waived.some((r) => e.endsWith(`(${r})`))) };
}
// Plain-language list of what differs between the designer's setup and what was drawn.
export function describeCorrections(original, j) {
  const out = [], mm = (n) => `${Math.round(n)} mm`;
  original.anchors.forEach((a, i) => {
    const b = j.anchors[i];
    if (a.location === 'island' || (a.wall === b.wall && a.at === b.at)) return;
    const c = (x) => mm(x.at + x.width / 2);
    out.push(a.wall !== b.wall
      ? { kind: 'appliance', item: a.item, description: `${NAME[a.item]} moved from wall W${a.wall} to wall W${b.wall}, centred at ${c(b)}.` }
      : { kind: 'appliance', item: a.item, description: `${NAME[a.item]} on wall W${a.wall} moved ${mm(Math.abs(b.at - a.at))} (centre ${c(a)} → ${c(b)}).` });
  });
  for (const t of ['base', 'wall', 'tall']) for (const w of original.walls) {
    const spans = (zs) => zs.filter((z) => z.wall === w.id).map((z) => `${z.from}–${z.to} mm`).join(', ');
    const before = spans(original.zones[t]), after = spans(j.zones[t]);
    if (before === after) continue;
    out.push({ kind: 'zone', tier: t, wall: `W${w.id}`, description: !after
      ? `${BAND[t]} on wall W${w.id} removed (was ${before}).`
      : !before ? `${BAND[t]} added on wall W${w.id} at ${after}.`
      : `${BAND[t]} on wall W${w.id} changed from ${before} to ${after}.` });
  }
  return out;
}
