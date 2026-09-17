// checkInput.mjs — validate the designer-owned input before solving.
import { readFileSync } from 'node:fs';
import { RULE_PARAMS } from './config.mjs';
import './ui/geometry.js';

const ANCHOR_TIER = { hob: 'base', sink: 'base', fridge: 'tall' };

// The room is a closed rectilinear outline walked CLOCKWISE. Each wall carries a length and a
// compass direction, and `at` is measured along the direction of travel. That makes any
// rectilinear plan expressible — rectangle, L or U — and it makes consecutive walls genuinely
// adjacent, which the old top/right/bottom/left labels only managed for one corner in four.
const DIRS = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };

export function outline(walls) {
  let x = 0, y = 0;
  const out = [];
  for (const w of walls) {
    const d = DIRS[w.dir];
    if (!d || !Number.isFinite(w.length) || w.length <= 0) return null;
    const x1 = x + d[0] * w.length, y1 = y + d[1] * w.length;
    out.push({ ...w, x0: x, y0: y, x1, y1, dx: d[0], dy: d[1] });
    x = x1; y = y1;
  }
  return { walls: out, closed: x === 0 && y === 0 };
}
const overlaps = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;

export function check(j) {
  const problems = [];
  if (!j || !Array.isArray(j.walls)) return ['input: walls must be an array'];
  if (j.walls.length < 4 || j.walls.some(w => !w || typeof w !== 'object')) return ['walls: a room needs at least four valid walls'];
  for (const key of ['anchors', 'openings', 'columns', 'structures'])
    if (j[key] != null && (!Array.isArray(j[key]) || j[key].some(x => !x || typeof x !== 'object')))
      return [`input: ${key} must be an array of objects`];
  if (j.zones != null && (typeof j.zones !== 'object' || Array.isArray(j.zones))) return ['input: zones must be an object'];
  for (const [tier, zs] of Object.entries(j.zones ?? {}))
    if (!Array.isArray(zs) || zs.some(z => !z || typeof z !== 'object')) return [`input: ${tier} zones must be an array of objects`];
  const wall = Object.fromEntries(j.walls.map((w) => [w.id, w]));
  const openings = j.openings ?? [];
  const columns = j.columns ?? [];
  const anchors = j.anchors ?? [];
  const zones = j.zones ?? {};

  const within = (id, from, to, what) => {
    if (!wall[id]) return problems.push(`${what}: unknown wall "${id}"`);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > wall[id].length)
      problems.push(`${what}: invalid span ${from}..${to} on wall ${id} (0..${wall[id].length})`);
  };

  if (Object.keys(wall).length !== j.walls.length) problems.push('wall ids must be unique');
  for (const w of j.walls) {
    if (!w.id || !Number.isSafeInteger(w.length) || w.length <= 0) problems.push(`wall ${w.id ?? '(missing id)'} needs a positive integer millimetre length`);
    if (!DIRS[w.dir]) problems.push(`wall ${w.id}: direction must be E, S, W or N, got "${w.dir}"`);
  }
  const shape = outline(j.walls);
  if (!shape) problems.push('walls: every wall needs a positive length and a valid direction');
  else if (!shape.closed) {
    const last = shape.walls.at(-1);
    problems.push(`walls do not close the room: the outline ends at (${last.x1}, ${last.y1}) instead of (0, 0)`);
  }
  if (shape?.closed) {
    const ws = shape.walls.map(w => ({ a: [w.x0, w.y0], b: [w.x1, w.y1] }));
    if (!KitchenGeometry.area(ws)) problems.push('walls: room has zero area');
    for (let i = 0; i < ws.length; i++) for (let k = i + 1; k < ws.length; k++) {
      if (k === i + 1 || (i === 0 && k === ws.length - 1)) continue;
      const a = ws[i], b = ws[k];
      if (Math.max(Math.min(a.a[0], a.b[0]), Math.min(b.a[0], b.b[0])) <= Math.min(Math.max(a.a[0], a.b[0]), Math.max(b.a[0], b.b[0]))
        && Math.max(Math.min(a.a[1], a.b[1]), Math.min(b.a[1], b.b[1])) <= Math.min(Math.max(a.a[1], a.b[1]), Math.max(b.a[1], b.b[1])))
        problems.push(`walls: outline self-intersects at walls ${i}/${k}`);
    }
  }
  problems.push(...(j.inputProblems ?? []));
  if (j.ceiling != null && (!Number.isFinite(j.ceiling) || j.ceiling < (RULE_PARAMS.heights[j.height]?.design_height ?? 0)))
    problems.push(`ceiling ${j.ceiling}mm is below the ${j.height} design height`);

  if (!RULE_PARAMS.heights[j.height]) problems.push(`height must be "7ft" or "8ft", got "${j.height}"`);
  if (!['CJ', 'TTS'].includes(j.handle)) problems.push(`base handle must be CJ or TTS, got "${j.handle}"`);

  for (const item of Object.keys(ANCHOR_TIER)) {
    const found = anchors.filter((a) => a.item === item);
    if (found.length !== 1) problems.push(`exactly one ${item} anchor is required, found ${found.length}`);
  }
  for (const a of anchors) {
    if (!ANCHOR_TIER[a.item]) problems.push(`${a.item}: only hob, sink and fridge may be anchors`);
    within(a.wall, a.at, a.at + a.width, `anchor ${a.item}`);
    const tier = ANCHOR_TIER[a.item];
    if (tier && wall[a.wall]) {
      const inside = (zones[tier] ?? []).some((z) => z.wall === a.wall && a.at >= z.from && a.at + a.width <= z.to);
      if (!inside) problems.push(`anchor ${a.item}: must be fully inside a ${tier} zone on wall ${a.wall}`);
    }
  }
  const hob = anchors.find((a) => a.item === 'hob');
  if (hob && !RULE_PARAMS.hob_widths.includes(hob.width))
    problems.push(`hob width must be one of ${RULE_PARAMS.hob_widths.join(', ')}mm`);
  // The designer's optional hob/flank SHAPE choices (rules.json: hob-shape-is-designer-choice).
  // Only the form is checked here; whether the catalogue actually offers the shape, and
  // whether it fits this run, is the engine's call — it has the catalogue and the geometry.
  // A shape names a configuration and never a dimension, so a bare number is always wrong.
  const SHAPE = /^[A-Z0-9]+(\+[A-Z0-9]+)*$/;
  if (hob) {
    if (hob.design !== undefined && !(typeof hob.design === 'string' && SHAPE.test(hob.design)))
      problems.push(`hob design must be a shape like "2LB+1HB", got ${JSON.stringify(hob.design)}`);
    if (hob.flanks !== undefined) {
      if (typeof hob.flanks !== 'object' || hob.flanks === null) problems.push('hob flanks must be an object of {left, right}');
      else for (const [side, v] of Object.entries(hob.flanks)) {
        if (!['left', 'right'].includes(side)) { problems.push(`hob flank side must be left or right, got "${side}"`); continue; }
        if (v === null || v === undefined) continue;   // side deliberately left to the engine
        const m = typeof v === 'string' && v.split(':');
        if (!m || m.length !== 2 || !/^[A-Z]{2,3}$/.test(m[0]) || !SHAPE.test(m[1]))
          problems.push(`hob ${side} flank must be "FAMILY:SHAPE" like "GD:1BL+1HF", got ${JSON.stringify(v)}`);
      }
    }
  }
  for (const a of anchors) {
    if (a.item !== 'hob' && (a.design !== undefined || a.flanks !== undefined))
      problems.push(`${a.item}: only the hob takes a design or flank choice`);
  }

  for (const o of openings) {
    if (!['door', 'window'].includes(o.type)) problems.push(`unknown opening type "${o.type}"`);
    within(o.wall, o.at, o.at + o.width, `${o.type} on ${o.wall}`);
    if (o.sill != null && (!Number.isFinite(o.sill) || o.sill < 0)) problems.push('window sill must be nonnegative millimetres');
    if (o.winH != null && (!Number.isFinite(o.winH) || o.winH <= 0)) problems.push('window height must be positive millimetres');
  }
  for (const c of columns) {
    within(c.wall, c.at, c.at + c.width, `column on ${c.wall}`);
    if(c.depth!=null&&(!Number.isFinite(c.depth)||c.depth<=0)) problems.push(`column on ${c.wall}: depth must be positive millimetres`);
  }
  for(const s of j.structures??[]) if(!['x0','x1','y0','y1','z0','z1'].every(k=>Number.isFinite(s[k]))||s.x1<=s.x0||s.y1<=s.y0||s.z1<=s.z0)
    problems.push('structure: expected a positive finite volume in millimetres');
  for(let i=0;i<openings.length;i++) for(let k=i+1;k<openings.length;k++){
    const a=openings[i],b=openings[k];
    if(a.wall===b.wall&&overlaps(a.at,a.at+a.width,b.at,b.at+b.width)) problems.push(`openings overlap on wall ${a.wall}`);
  }
  for (const [tier, spans] of Object.entries(zones)) {
    if (!['base', 'wall', 'tall'].includes(tier)) problems.push(`unknown zone tier "${tier}"`);
    for (const z of spans ?? []) within(z.wall, z.from, z.to, `${tier} zone`);
    const sorted = [...(spans ?? [])].sort((a, b) => String(a.wall).localeCompare(String(b.wall)) || a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a.wall === b.wall && a.to > b.from) problems.push(`${tier} zones overlap on wall ${a.wall}`);
    }
  }
  // Base and wall zones describe different heights and may share a run. A tall cabinet owns
  // that run from floor to ceiling, so it can never share even part of a span with either one.
  for (const tier of ['base', 'wall']) for (const z of zones[tier] ?? []) for (const tall of zones.tall ?? []) {
    if (z.wall === tall.wall && overlaps(z.from, z.to, tall.from, tall.to))
      problems.push(`tall zones overlap ${tier} zones on wall ${z.wall}`);
  }

  for (let i = 0; i < anchors.length; i++) for (let k = i + 1; k < anchors.length; k++) {
    const a = anchors[i], b = anchors[k];
    if (a.wall === b.wall && overlaps(a.at, a.at + a.width, b.at, b.at + b.width))
      problems.push(`anchors ${a.item} and ${b.item} overlap on wall ${a.wall}`);
  }
  for (const a of anchors) for (const o of openings) {
    if (o.wall !== a.wall || !overlaps(a.at, a.at + a.width, o.at, o.at + o.width)) continue;
    if (o.type === 'door') problems.push(`${a.item} is in front of a door on ${o.wall} (anchors-never-in-front-of-door)`);
    if (o.type === 'window' && (a.item === 'hob' || a.item === 'fridge'))
      problems.push(`${a.item} is in front of a window on ${o.wall} (window-rules-by-anchor)`);
  }

  const sink = anchors.find((a) => a.item === 'sink');
  if (hob && sink) {
    let gap = Infinity;
    if (hob.wall === sink.wall)
      gap = Math.max(hob.at, sink.at) - Math.min(hob.at + hob.width, sink.at + sink.width);
    else {
      const order = j.walls.map((w) => w.id);
      for (let i = 0; i < order.length; i++) {
        const a = order[i], b = order[(i + 1) % order.length];
        if (hob.wall === a && sink.wall === b) gap = wall[a].length - (hob.at + hob.width) + sink.at;
        if (sink.wall === a && hob.wall === b) gap = wall[a].length - (sink.at + sink.width) + hob.at;
      }
    }
    if (gap < RULE_PARAMS.hob_sink_min_gap)
      problems.push(`hob and sink are ${gap}mm apart along the countertop, minimum is ${RULE_PARAMS.hob_sink_min_gap}mm (hob-sink-min-gap)`);
  }
  return [...new Set(problems)];
}

if (process.argv[1]?.endsWith('checkInput.mjs')) {
  const j = JSON.parse(readFileSync(process.argv[2] ?? 'data/default-kitchen.json', 'utf8'));
  const problems = check(j);
  console.log(problems.length ? problems.map((p) => `  x ${p}`).join('\n') : `  ok  ${j.project} input is valid`);
}
