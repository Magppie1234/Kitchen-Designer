// server.mjs — the full MAI builder, running on THIS project's rules.
//
// The UI (ui/builder.html) and every supporting service are the originals from
// MAI_Designer-main: the designer dashboard and design store, the GLB model library, the
// cabinet library, repricing, share links, the series master and the pricing stack.
//
// What is NOT imported is the old rule cluster — data/rules.json plus lib/planFromExtract,
// planningEngine, autoLayout, tiers, zones, corners, tiling, hobSides, veggieSink, keeps,
// ruleLog, suggest and public/rule-engine.js. Layout comes from ONE rule file, rules.json at
// the root, read by engine.mjs. /api/build translates the UI's request into that engine's
// input, runs it, and translates the result back into the plan shape every view renders.
//
//   node server.mjs          -> http://localhost:5055
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './loadCatalog.mjs';
import { layout, gate } from './engine.mjs';
import { fitKitchen, prepareAnchorInput } from './fitting.mjs';
import { aiConfiguration, configuredProposer } from './ai-provider.mjs';
import { improveFittedKitchen } from './ai-planner.mjs';
import { check } from './checkInput.mjs';
import { RULE_PARAMS } from './config.mjs';
import { handleDesigns } from './vendor/designApi.js';
import { handleConfig, requireSeries, offCatalogWarnings, seriesFinishGroup, seriesAllowsCode } from './vendor/series.js';
import { handleLibrary, handleReprice } from './vendor/libraryApi.js';
import { handleShare } from './vendor/shareApi.js';
import { loadRoom, resolveOpenings } from './vendor/apiRuntime.js';
import { priceSaleable } from './vendor/saleablePricing.js';
import { estimateKitchen } from './vendor/costEstimate.js';
import { accessoriesFor } from './vendor/accessories.js';
import { specOf } from './engine.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const UI = join(ROOT, 'ui');
const MODELS = join(UI, 'models');
const MANIFEST = join(ROOT, 'data', 'module-models.json');
const PORT = process.env.PORT || 5055;
const { ok: CATALOG } = loadCatalog();
let aiBuildActive=false;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------- UI -> engine
const ANCHOR_WIDTH = { hob: 900, sink: 900, fridge: 600 };

// Families that may sit immediately beside the hob. The sink, the hob and the blind-corner
// units are excluded — they are placed by their own rules, not chosen as a flank.
const FLANKABLE = new Set(['GD', 'AC', 'SH', 'DW', 'AP']);

// Plain names for the catalogue's shape codes, so the designer picks "grain trolley" rather
// than "GD:1BL+1HF". A shape with no entry falls back to its raw code — visible and ugly,
// which is the right prompt to name it here rather than a silent blank.
const SHAPE_LABELS = {
  'HO:2HB': 'Hob · 2 deep drawers',
  'HO:2LB+1HB': 'Hob · 2 shallow + 1 deep',
  'GD:1BL+1HF': 'Grain trolley',
  'AC:BPO': 'Bottle pullout',
  'AC:WBP+1HF': 'Waste bin pullout',
  'AC:TR': 'Tray unit',
  'AP:OVN+1FP': 'Oven unit',
  'SH:1SX': 'Single shutter',
  'SH:1SX+2HS': 'Shutter + 2 drawers',
  'DW:2HB': 'Drawers · 2 deep',
  'DW:2LB+1HB': 'Drawers · 2 shallow + 1 deep',
  'DW:2HB+1BL': 'Drawers · 2 deep + 1 internal',
};

// The UI stores walls as a polygon of {a:[x,y], b:[x,y]}. The engine wants a clockwise
// rectilinear loop of length + compass direction, so read the direction off each segment.
const dirOf = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || ![...a,...b].every(Number.isFinite)) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'E' : 'W') : (dy >= 0 ? 'S' : 'N');
};

// The designer's own cabinet bands. The UI's zone tool draws them per wall at exactly the
// three tiers this engine solves — base, wall, tall — and sends them as
// {wall:'W0', tier, s, e}. They are the designer SAYING where cabinets go, so when any have
// been drawn they are the zones, verbatim; deriveZones() below only fills in for a room
// where the tool was never used.
function designerZones(uiZones, walls) {
  const zones = { base: [], wall: [], tall: [] };
  const byId = new Map(walls.map((w) => [w.id, w]));
  for (const z of uiZones) {
    const wall = String(z.wall).replace(/^W/, '');
    const w = byId.get(wall);
    if (!w || !zones[z.tier]) continue;
    const from = Math.max(0, Math.round(Math.min(z.s, z.e)));
    const to = Math.min(w.length, Math.round(Math.max(z.s, z.e)));
    if (to - from > 0) zones[z.tier].push({ wall, from, to });
  }
  return Object.values(zones).some((t) => t.length) ? zones : null;
}

// Fallback only, for a room whose zone tool was never used: every wall long enough to
// furnish carries base and wall runs, and the fridge anchors a tall band.
function deriveZones(walls, anchors) {
  const zones = { base: [], wall: [], tall: [] };
  const fridge = anchors.find((a) => a.item === 'fridge');
  const TALL_BAND = 1800;
  for (const w of walls) {
    if (w.length < 600) continue;
    if (fridge && fridge.wall === w.id) {
      // Grow the tall band out from the fridge, but never over another anchor on the same
      // wall — a sink swallowed by the fridge's band is the commonest way this goes wrong.
      const others = anchors.filter((a) => a !== fridge && a.wall === w.id).sort((a, b) => a.at - b.at);
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

export function toEngineInput(anchors = [], options = {}) {
  const notes = [];
  const inputProblems = [];
  const walls = (options.walls ?? []).map((w, i) => ({
    id: String(i), length: w?.a && w?.b ? Math.round(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])) : NaN, dir: dirOf(w?.a, w?.b),
  }));
  (options.walls ?? []).forEach((w,i,ws) => {
    if (JSON.stringify(w?.b)!==JSON.stringify(ws[(i+1)%ws.length]?.a)) inputProblems.push(`wall ${i}: endpoints are disconnected`);
    if (Number.isFinite(w.length) && Math.abs(w.length-walls[i].length)>1) notes.push(`wall ${i}: length recalculated from endpoints (${w.length} -> ${walls[i].length}mm)`);
  });
  const mm = Number(options.kitchenHeightMm) || Number(options.ceiling) || 2500;
  const height = mm >= 2300 ? '8ft' : '7ft';
  if (mm !== RULE_PARAMS.heights[height].design_height)
    notes.push(`ceiling ${mm}mm read as the ${height} system (${RULE_PARAMS.heights[height].design_height}mm design height)`);

  // The two sides disagree about what an along-wall offset MEANS. The UI stores `off` as the
  // CENTRE of a fixture or opening (it draws every one of them as off±width/2); the engine's
  // `at` is the LEFT EDGE, and it adds `width` to get the far side. Passing the centre
  // through unconverted shifts everything half a cabinet down the wall, which reads as
  // "invalid span" and "in front of a window" on layouts that are actually fine — so convert
  // here, once, and clamp to the wall so a fixture centred near a corner still lands inside.
  const wallLen = (id) => walls.find((w) => w.id === id)?.length ?? Infinity;
  const leftEdge = (wall, off, width) =>
    Math.max(0, Math.min(Math.round(wallLen(wall) - width), Math.round(off - width / 2)));
  const wallId = (w) => String(w).replace(/^W/, '');

  const mapped = [];
  for (const a of anchors) {
    if (!ANCHOR_WIDTH[a.type]) { notes.push(`anchor "${a.type}" is not one this engine places`); continue; }
    const wall = wallId(a.wall), width = a.type==='sink' ? (a.width ?? options.sinkWidth ?? (a.elevation==='B'?600:900)) : (a.width??ANCHOR_WIDTH[a.type]);
    const anchor = { item: a.type, wall, at: Math.round(a.off-width/2), width };
    if (a.type==='hob') anchor.center = a.off;
    // The designer's hob SHAPE choices ride on the hob anchor. They name a configuration and
    // never a size — the engine solves the width — and they are hard: it places that shape or
    // says why it could not (rules.json: hob-shape-is-designer-choice).
    if (a.type === 'hob') {
      if (options.hobDesign) anchor.design = String(options.hobDesign);
      const f = options.hobFlanks ?? {};
      const flanks = Object.fromEntries(['left', 'right'].filter((s) => f[s]).map((s) => [s, String(f[s])]));
      if (Object.keys(flanks).length) anchor.flanks = flanks;
      if (anchor.design || anchor.flanks)
        notes.push(`hob chosen by shape: ${[anchor.design && `base "${anchor.design}"`,
          ...Object.entries(anchor.flanks ?? {}).map(([s, v]) => `${s} flank "${v}"`)].filter(Boolean).join(', ')}`);
    }
    mapped.push(anchor);
  }

  const input = {
    project: 'UI', height, ceiling: Number(options.ceiling) || mm, inputProblems,
    dishwasher: options.dishwasher,
    handle: /^(tts|titus|eh)$/i.test(String(options.handles?.base ?? options.handles ?? '')) ? 'TTS' : 'CJ',
    walls,
    openings: (options.openings ?? []).map((o) => {
      const wall = wallId(o.wall), width = Math.round(o.width);
      return { ...o, wall, type: o.type, at: Math.round(o.off-width/2), width,
        ...(o.type==='window'?{sill:o.sill??(o.variant==='fulllength'?50:900),winH:o.winH??(o.variant==='fulllength'?2100:1200)}:{}) };
    }),
    columns: (options.structures ?? [])
      .filter((s) => s.wall !== undefined && s.width)
      .map((s) => {
        const wall = wallId(s.wall), width = Math.round(s.width);
        return { wall, at: leftEdge(wall, s.off ?? 0, width), width };
      }),
    anchors: mapped,
  };
  // UI structures are world-space boxes, not wall/off records. Project flush
  // columns onto the actual wall; keep every volume for the final collision test.
  const origin = options.walls?.[0]?.a ?? [0,0];
  input.structures = (options.structures??[]).filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)&&s.w>0&&s.d>0).map(s=>({
    type:s.type, x0:s.x-s.w/2-origin[0], x1:s.x+s.w/2-origin[0],
    y0:s.y-s.d/2-origin[1], y1:s.y+s.d/2-origin[1],
    z0:s.type==='beam'?input.ceiling-(s.h??s.drop??300):0, z1:s.type==='beam'?input.ceiling:(s.h??input.ceiling),
  }));
  for(const s of options.structures??[]) {
    if(s.type!=='column'||!Number.isFinite(s.x)||!Number.isFinite(s.y)||!(s.w>0&&s.d>0)) continue;
    for(let i=0;i<(options.walls??[]).length;i++) {
      const w=options.walls[i]; if(!walls[i].dir) continue;
      const n=KitchenGeometry.normal(w,options.walls), ux=(w.b[0]-w.a[0])/walls[i].length, uy=(w.b[1]-w.a[1])/walls[i].length;
      const halfAlong=(Math.abs(ux)*s.w+Math.abs(uy)*s.d)/2, halfDeep=(Math.abs(n[0])*s.w+Math.abs(n[1])*s.d)/2;
      const along=(s.x-w.a[0])*ux+(s.y-w.a[1])*uy, deep=(s.x-w.a[0])*n[0]+(s.y-w.a[1])*n[1];
      if(Math.abs(deep-halfDeep)>1 || along+halfAlong<=0 || along-halfAlong>=walls[i].length) continue;
      const at=Math.max(0,Math.round(along-halfAlong)), end=Math.min(walls[i].length,Math.round(along+halfAlong));
      input.columns.push({wall:String(i),at,width:end-at,depth:Math.round(deep+halfDeep)});
    }
  }

  const drawn = designerZones(options.zones ?? [], walls);
  input.zones = drawn ?? deriveZones(walls, mapped);
  const open = new Set(options.roomMode==='open' ? (options.openWalls??[]).map(String) : []);
  input.openWalls=[...open];
  for(const tier of ['base','wall','tall']) input.zones[tier]=input.zones[tier].filter(z=>!open.has(z.wall));
  notes.push(drawn
    ? `cabinet bands: using the ${(options.zones ?? []).length} you drew (base ${drawn.base.length}, wall ${drawn.wall.length}, tall ${drawn.tall.length})`
    : 'cabinet bands: none drawn, so base and wall runs were assumed along every wall and a tall band around the fridge — draw them with the Zones tool to decide this yourself');

  // Say plainly which designer choices this engine does NOT read, rather than letting them
  // look considered. Everything named here is a real control in the UI whose value never
  // reaches rules.json, so the plan would be identical with it set any other way.
  const IGNORED = [
    ['hobSides', (v) => v && Object.values(v).some((s) => s?.mode && s.mode !== 'none'),
      'the old hob side-section presets — they name exact widths; pick the flank SHAPE instead and the engine sizes it'],
    ['keeps', (v) => v?.length, 'pinned cabinets — this engine re-solves every wall from scratch'],
    ['islandType', (v) => v, 'the island — not something this engine places'],
    ['kubos', (v) => v, 'the KUBOS open shelving'],
    ['tark', (v) => v, 'the Tark system'],
    ['fridgeType', (v) => v && v !== 'builtin', 'built-in vs free-standing fridge — a tall fridge tower is always used'],
  ];
  for (const [key, set, why] of IGNORED)
    if (set(options[key])) notes.push(`not applied: ${why}`);

  return { input, notes };
}

// ---------------------------------------------------------------- engine -> UI
// The views (2D plan, elevation, 3D, walkthrough) all read the SAME plan shape, and they
// read it positionally: base segments are laid end to end by accumulating `width` from the
// start of the wall, so the segment list must TILE the wall with no holes. The engine
// places items at absolute offsets and leaves the untouched spans empty, so every hole is
// filled below with a 'gap' segment — a kind no renderer draws, which advances the cursor
// and nothing more. Wall-tier units carry an explicit x0 instead and need no filling.

// Base-tier role -> the kind the renderers switch on. Order matters: 'corner filler' is a
// filler, not a corner, so the filler test runs first.
function baseKind(role) {
  if (role === 'perpendicular cabinet footprint' || role === 'unresolved corner reservation') return 'gap';
  if (role === 'concealed corner space') return 'gap';
  if (role === 'perpendicular tall footprint') return 'gap';
  if (role === 'corner void') return 'gap';
  if (/\(tall above\)/.test(role)) return 'tallBank';
  if (/^door/.test(role)) return 'door';
  if (/^window/.test(role)) return 'window';
  if (/filler|countertop return|^panel/.test(role)) return 'filler';
  if (/corner/.test(role)) return 'corner';
  if (/^(hob|sink|dishwasher)$/.test(role)) return 'anchor';
  return 'cabinet';
}

// Wall-tier role -> kind. wallSolid/wallGlass/wallBlind render as cabinets; chimney and
// filler render as backsplash; anything else (a blocker) is dropped, harmlessly, because
// the wall tier is positioned by x0 rather than by accumulation.
function wallKind(role) {
  if (role === 'perpendicular cabinet footprint' || role === 'unresolved corner reservation') return null;
  if (role === 'concealed corner space') return null;
  if (role === 'perpendicular tall footprint') return null;
  if (role === 'corner void') return null;
  if (/\(tall above\)|no cabinet\)/.test(role)) return null;
  if (/glass/.test(role)) return 'wallGlass';
  if (/blind/.test(role)) return 'wallBlind';
  if (/chimney/.test(role)) return 'chimney';
  if (/filler|countertop return|^panel/.test(role)) return 'filler';
  return 'wallSolid';
}

// A tall unit's engine role -> the four unit types the tall renderers know.
const TALL_TYPE = [
  [/refrigerator|fridge/, 'fridge'],
  [/pantry/, 'pantry'],
  [/oven|microwave|appliance/, 'appliance'],
  [/glass|crockery/, 'glass'],
  [/shelf/, 'shelves'],
];
const tallType = (role) => (TALL_TYPE.find(([re]) => re.test(role)) ?? [, 'pantry'])[1];

export function toPlan(result, input, notes, options = {}) {
  const runs = [], tiers = {};
  const heights=RULE_PARAMS.heights[input.height];
  const byCode=new Map(CATALOG.map(c=>[c.code,c]));
  const dimensions=(p,tier)=>{
    const c=byCode.get(p.code);
    return {height:p.height??c?.height??(tier==='wall'?heights.wall:tier==='tall'?heights.tall:720),
      depth:p.depth??c?.depth??(tier==='wall'?RULE_PARAMS.low_depth:560), offset:p.offset??0,
      z:p.z??(tier==='wall'?RULE_PARAMS.counter_height+RULE_PARAMS.backsplash:tier==='base'?100:0)};
  };
  input.walls.forEach((w, i) => {
    const key = `W${i}`;
    const segments = [];
    let cursor = 0;
    const on = (tier) => (result.placed[tier] ?? []).filter((p) => p.wall === w.id).sort((a, b) => a.at - b.at);

    // Every base segment carries x0/x1 as well as x/from/to: the elevation view positions by
    // x0 (and the editor's reindex() only fills it in after the first edit), so without it
    // every unit of a fresh plan drew at the run start.
    for (const p of on('base')) {
      if (p.at > cursor) segments.push({ kind: 'gap', width: p.at - cursor, wall: key, x: cursor, x0: cursor, x1: p.at });
      const kind = baseKind(p.role);
      const tall = kind==='tallBank' ? on('tall').find(t=>!t.blocker&&t.at===p.at&&t.width===p.width) : null;
      const seg = {
        kind, tier: kind === 'tallBank' ? 'tall' : 'base',
        label: p.role.replace(/ \(tall above\)$/, '').replace(/ \(no cabinet\)$/, ''),
        width: p.width, wall: key, x: p.at, from: p.at, to: p.at + p.width, x0: p.at, x1: p.at + p.width,
        code: p.code ?? null, func: p.role,
        ...dimensions(tall??p,tall?'tall':'base'),
        ...(p.corner?{corner:p.corner,shutter:p.shutter}:{}),
        ...(p.hiddenCorner?{hiddenCorner:true}:{}),
      };
      // the base row's anchors are named by the label the renderers test for
      if (kind === 'anchor') seg.label = p.role;
      // a tall band shows through the base row as its own typed unit
      if (kind === 'tallBank') {
        seg.code=tall?.code??null;
        if(tall?.trim) {seg.kind='filler';seg.trim=true;seg.tier='tall';}
        else seg.units = [{ type: tallType(seg.label), width: p.width, code:seg.code, ...dimensions(tall??p,'tall') }];
      }
      segments.push(seg);
      cursor = Math.max(cursor, p.at + p.width);
    }
    if (cursor < w.length) segments.push({ kind: 'gap', width: w.length - cursor, wall: key, x: cursor, x0:cursor, x1:w.length });

    // The wall tier is its own row with its own kinds and its own along-wall x0 — never a
    // copy of the base row. loft and tall stay empty: this engine has three tiers, and the
    // tall band is already carried by the base row above (counting it twice would double
    // every tall unit in the price).
    const wall = [];
    for (const p of on('wall')) {
      const kind = wallKind(p.role);
      if (!kind) continue;
      wall.push({ kind, width: p.width, x0: p.at, x1: p.at + p.width, code: p.code ?? null, label: p.role, ...dimensions(p,'wall'),...(p.corner?{corner:p.corner,shutter:p.shutter}:{}) });
    }
    runs.push({ key, wall: w.id, total: w.length, segments });
    tiers[key] = { wall, loft: [], tall: [] };
  });

  const bom = {};
  for (const tier of ['base', 'wall', 'tall'])
    for (const p of result.placed[tier] ?? []) {
      if (p.blocker || !p.code) continue;
      bom[p.code] = (bom[p.code] ?? 0) + 1;
    }

  const zones = [];
  if (input.anchors.some((a) => a.item === 'hob')) zones.push('cooking');
  if (input.anchors.some((a) => a.item === 'sink')) zones.push('washing');
  if (input.anchors.some((a) => a.item === 'fridge')) zones.push('cooling');

  const log = [
    ...notes.map((detail) => ({ rule: 'Adapter', status: 'assumed', detail })),
    ...result.notes.map((detail) => ({ rule: 'Engine', status: 'applied', detail })),
    ...result.problems.map((detail) => ({ rule: 'Hard constraint', status: 'conflict', detail })),
    ...result.unresolved.map((detail) => ({ rule: 'Unresolved', status: 'assumed', detail })),
    ...result.warnings.map((detail) => ({ rule: 'Preference', status: 'skipped', detail })),
  ];

  const verdict = gate(result);
  const plan = {
    schemaVersion:2, validationVersion:9,
    geometry:{height:input.height,baseTop:RULE_PARAMS.counter_height,wallBottom:RULE_PARAMS.counter_height+RULE_PARAMS.backsplash,wallTop:heights.design_height,tall:heights.tall,counterThickness:30},
    openings:(input.openings??[]).map(o=>({...o,wall:`W${input.walls.findIndex(w=>w.id===o.wall)}`,off:o.at+o.width/2})),
    runs, tiers, bom, zones, island: null,
    accessories: accessoriesFor(zones), placedAccessories: [], recommendations: [],
    warnings: [...result.problems, ...result.unresolved, ...result.warnings],
    log, clashes: [],
    verdict: verdict.verdict, releaseBlocked: verdict.releaseBlocked,
  };
  // Pricing is the original saleable-area model (shutter sqft x finish rate), fed by the
  // plan this engine just produced — the same numbers the library and reprice paths use.
  plan.price = priceSaleable(plan, { pg: options.pg, finish: options.finish });
  plan.cost = estimateKitchen(plan);
  return plan;
}

// ------------------------------------------------------------------- endpoints
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

// Anchor suggestion: the longest free walls get sink, hob and fridge, each centred and kept
// off any door or window. The original picked these with a scoring rule book (lib/suggest.js
// + lib/planningEngine.js); this project's rule file does not cover anchor CHOICE, only what
// can be built once the designer has placed them — so the suggestion is deliberately plain
// geometry, and the engine still judges whatever comes back.
// ponytail: longest-wall heuristic; swap in a scored pick if designers fight the defaults.
function suggestAnchors(ex) {
  const order = ex.room.walls.map((w, i) => ({ i, w })).sort((a, b) => b.w.length - a.w.length);
  const blocked = new Set((ex.openings ?? []).map((o) => o.wallIndex));
  const free = order.filter((x) => !blocked.has(x.i) && x.w.length >= 1200);
  const pool = free.length >= 3 ? free : order.filter((x) => x.w.length >= 1200);
  return ['sink', 'hob', 'fridge']
    .map((type, n) => (pool[n] ? { type, wall: `W${pool[n].i}`, off: Math.round(pool[n].w.length / 2) } : null))
    .filter(Boolean);
}

// Endpoints the original backend served that this project deliberately does not implement.
// A clear 501 beats a silent empty response that makes the UI look broken for no reason.
const NOT_WIRED = {
  '/api/vision-extract': 'AI floor-plan reading is not part of this project',
  '/api/kitchen-detect': 'AI kitchen detection is not part of this project',
  '/api/dwg-extract': 'DWG/DXF import is not part of this project',
};

const app = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,x-filename');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if(path==='/api/ai/status'&&req.method==='GET')return send(res,200,{configured:aiConfiguration().configured,busy:aiBuildActive});
    if (path === '/api/build') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST {anchors, options}' });
      const { anchors, options = {} } = await readBody(req);
      if(options.aiImprove===true&&options.keeps?.length)return send(res,400,{error:'AI improvement cannot preserve pinned cabinets yet. Unpin them before generating an AI alternative.'});
      // Stage 2: a committed series is required before anything can be generated, and only
      // its SKUs may be offered. Enforced here, server-side, not just hidden in the UI.
      const series = requireSeries(options.seriesId);
      const { input, notes } = toEngineInput(anchors, options);
      const invalid = check(prepareAnchorInput(input));
      // An input the engine cannot even read still has to answer in the FULL plan shape:
      // the result view reads price.breakdown.total unconditionally, so a thinner object
      // here throws in the browser and the designer sees a blank screen instead of the
      // reason their input was rejected.
      if (invalid.length)
        return send(res, 200, {
          schemaVersion:2, validationVersion:9,
          inputRejected:true,
          inputIssues:invalid.map(detail=>{
            const m=detail.match(/^anchor (hob|sink|fridge): must be fully inside a (base|tall) zone on wall (.+)$/);
            if(!m)return detail;
            const a=input.anchors.find(a=>a.item===m[1]),zones=input.zones[m[2]].filter(z=>z.wall===m[3]);
            return `The ${m[1]==='fridge'?'fridge':m[1]} on wall W${m[3]} occupies ${a.at}-${a.at+a.width} mm, outside its ${m[2]==='tall'?'tall-cabinet':'base-cabinet'} area${zones.length?' ('+zones.map(z=>`${z.from}-${z.to} mm`).join(', ')+')':''}. It could not be fitted within the 100 mm movement allowance. Move it inside that area or adjust the cabinet area, then generate again.`;
          }),
          runs: [], tiers: {}, bom: {}, zones: [], island: null,
          accessories: [], placedAccessories: [], recommendations: [], clashes: [],
          warnings: invalid,
          price: { model: 'saleable', currency: 'INR', rate: 0, shutterSqft: 0, counterSqft: 0, modules: 0, lines: [], breakdown: { cabinets: 0, counter: 0, total: 0 } },
          cost: { currency: 'INR', estimate: true, pieces: 0, breakdown: { material: 0, labour: 0, total: 0 } },
          log: invalid.map((detail) => ({ rule: 'Input', status: 'conflict', detail })),
          verdict: 'REJECTED', releaseBlocked: true,
        });
      const pg = seriesFinishGroup(series, options.pg ?? series.defaultFinish?.pg);
      const eligibleCatalog=CATALOG.filter(c=>seriesAllowsCode(series,c.code));
      const originalFitted = await fitKitchen(input, eligibleCatalog,{proposals:options.proposeAdjustments!==false});
      let fitted=originalFitted;
      if(options.aiImprove===true){
        if(aiBuildActive)return send(res,409,{error:'An AI layout improvement is already running. Try again when it finishes.'});
        aiBuildActive=true;
        try{fitted=await improveFittedKitchen(originalFitted,eligibleCatalog,{propose:configuredProposer()});}
        finally{aiBuildActive=false;}
      }
      const makePlan=(result,j)=>{
        const plan=toPlan(result,j,notes,{pg,finish:options.finish??series.defaultFinish?.finish});
        const {context,...planning}=result.planning;
        plan.planning={...planning,spans:context?.spans};
        if(planning.ai)plan.planning.ai={...planning.ai,attempts:planning.ai.attempts.map(({packingSpans,...attempt})=>attempt)};
        plan.log.push({rule:'Planning flow',status:'applied',detail:planning.mode},
          ...planning.attempts.map(a=>({rule:'Candidate',status:a.problems.length?'skipped':'applied',
            detail:`${a.name??a.source}: ${a.problems.length?a.problems.join('; '):`${a.cabinets} cabinets; ${a.grossStorageLitres} L gross storage carcass volume`}`})));
        plan.warnings.push(...offCatalogWarnings(plan.bom,series));
        plan.series={id:series.id,name:series.name,carcass:series.carcass};
        return plan;
      };
      const plan=makePlan(fitted.result,fitted.input);
      if(fitted.result.planning?.ai?.status==='improved')plan.aiOriginal=makePlan(originalFitted.result,originalFitted.input);
      if(fitted.adjustments?.length){
        plan.anchorAdjustments=fitted.adjustments.map(c=>{
          const wall='W'+input.walls.findIndex(w=>w.id===c.wall);
          return {...c,wall,description:`${c.item} on ${wall} moved ${Math.abs(c.delta)} mm ${c.delta>0?'towards the wall end':'towards the wall start'} (${c.from} to ${c.to} mm) to improve cabinet fit, within the 100 mm allowance.`};
        });
        plan.planning.anchorsFixed=false;
        plan.planning.adjustments=plan.anchorAdjustments;
        plan.log.push(...plan.anchorAdjustments.map(c=>({rule:'Appliance position adjusted',status:'applied',by:'engine',detail:c.description})));
      }
      plan.fitting={...fitted.search,found:!!fitted.proposal};
      if(fitted.proposal){
        const {input:j,result,changes}=fitted.proposal;
        const wallId=id=>'W'+j.walls.findIndex(w=>w.id===id);
        plan.fitting.proposal={plan:makePlan(result,j),changes:changes.map(c=>{
          const wall=j.walls.find(w=>w.id===c.wall),sign=Math.sign(c.delta);
          const direction=wall.dir==='E'?(sign>0?'right':'left'):wall.dir==='W'?(sign>0?'left':'right'):wall.dir==='S'?(sign>0?'down':'up'):(sign>0?'up':'down');
          const requiresZoneReview=c.kind==='zone'&&Math.abs(c.delta)>RULE_PARAMS.zone_boundary_tolerance;
          return {...c,wall:wallId(c.wall),requiresZoneReview,description:`${c.kind==='anchor'?c.item:c.tier+' zone '+(c.edge==='from'?'start':'end')} on ${wallId(c.wall)}: ${Math.abs(c.delta)} mm ${direction} (${c.from} → ${c.to} mm along wall)${requiresZoneReview?' — shorter upper run beside window; exceeds automatic tolerance and requires your approval':''}`};
        }),target:{anchors:j.anchors.map(a=>({type:a.item,wall:wallId(a.wall),off:a.at+a.width/2,width:a.width})),
          zones:Object.entries(j.zones).flatMap(([tier,zs])=>zs.map((z,i)=>({id:`fit-${tier}-${i}`,tier,wall:wallId(z.wall),s:z.from,e:z.to})))}};
        if(result.planning?.ai?.status==='improved')plan.fitting.proposal.plan.aiOriginal=makePlan(originalFitted.proposal.result,originalFitted.proposal.input);
      }
      if(plan.aiOriginal){
        plan.aiOriginal.anchorAdjustments=plan.anchorAdjustments;
        plan.aiOriginal.planning.anchorsFixed=plan.planning.anchorsFixed;
        plan.aiOriginal.planning.adjustments=plan.planning.adjustments;
        plan.aiOriginal.fitting=plan.fitting;
      }
      // every generated SKU must belong to the chosen series' catalogue — off-catalog codes
      // are named in plain warnings, never silently kept
      return send(res, 200, plan);
    }

    // Room + anchor suggestions. The guided flow calls this for EVERY new room shape and
    // throws on a non-200, so it has to answer even though suggestion is not a rule here.
    if (path === '/api/room' || path === '/api/suggest') {
      const q = url.searchParams;
      const ex = loadRoom({ w: +q.get('w'), h: +q.get('h'), shape: q.get('shape'), nw: +q.get('nw'), nh: +q.get('nh') });
      return send(res, 200, {
        detected: ex.detected, room: ex.room, openings: ex.openings, warnings: ex.warnings,
        suggested: suggestAnchors(ex), island: { fits: false, reason: 'islands are out of scope for this engine' },
      });
    }

    // AI Automate's wall picker. No scoring rule book here, so hand back the same plain
    // suggestion /api/suggest gives, in the shape the client reads.
    if (path === '/api/plan') {
      const { dims, walls, openings = [], seriesId } = await readBody(req);
      requireSeries(seriesId);
      const ex = loadRoom(Array.isArray(walls) && walls.length >= 3 ? null : dims);
      if (Array.isArray(walls) && walls.length >= 3) {
        ex.room.walls = walls.map((w) => ({ ...w, length: w.length || Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) }));
      }
      if (openings.length) ex.openings = resolveOpenings(ex.room, openings);
      return send(res, 200, { primary: { anchors: suggestAnchors(ex) }, alternatives: [], primaryCloses: null });
    }

    // The shapes a designer may pick for the hob base and for the cabinet flanking it. Read
    // straight off the catalogue, so adding a cabinet to cabinets.csv adds a choice here and
    // nothing product-shaped is ever hardcoded in the browser. Widths are listed only so the
    // UI can say what the engine has to work with — they are not a choice.
    if (path === '/api/shapes') {
      const base = CATALOG.filter((c) => c.group === 'base' && !c.blind && specOf(c));
      const group = (rows) => {
        const out = new Map();
        for (const c of rows) {
          const key = `${c.family}:${specOf(c)}`;
          if (!out.has(key)) out.set(key, { key, family: c.family, shape: specOf(c), widths: new Set() });
          out.get(key).widths.add(c.width);
        }
        return [...out.values()]
          .map((x) => ({ ...x, widths: [...x.widths].sort((a, b) => a - b), label: SHAPE_LABELS[x.key] ?? x.shape }))
          .sort((a, b) => a.label.localeCompare(b.label));
      };
      return send(res, 200, {
        // the hob base's own shape — the drawer configuration under the cooktop
        hob: group(base.filter((c) => c.family === 'HO')).map((x) => ({ ...x, label: SHAPE_LABELS[`HO:${x.shape}`] ?? x.shape })),
        // what may sit immediately beside it. Purpose units that cannot flank are left out.
        flanks: group(base.filter((c) => FLANKABLE.has(c.family))),
      });
    }

    // The GLB module library. The manifest's authoring modelsDir is dropped and every path
    // is forced to forward slashes — it was generated on Windows and otherwise hands the
    // browser backslash URLs that never resolve.
    if (path === '/api/models') {
      const man = JSON.parse(await readFile(MANIFEST, 'utf8'));
      delete man.modelsDir;
      const norm = (p) => String(p || '').split('\\').join('/');
      for (const m of man.models ?? []) m.path = norm(m.path);
      for (const k of Object.keys(man.byCode ?? {})) if (man.byCode[k]) man.byCode[k].path = norm(man.byCode[k].path);
      return send(res, 200, man);
    }

    if (path.startsWith('/models/')) {
      const rel = decodeURIComponent(path.slice('/models/'.length));
      const full = join(MODELS, normalize(rel));
      if (!full.startsWith(MODELS + sep)) return send(res, 403, { error: 'forbidden' });
      const buf = await readFile(full);
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'cache-control': 'public, max-age=86400' });
      return res.end(buf);
    }

    // Handlers shared verbatim with the original project: the design store behind the
    // designer dashboard, the app config (series master + money rates), the cabinet library
    // and repricing, and client share links.
    if (path.startsWith('/api/designs')) return handleDesigns(req, res);
    if (path.startsWith('/api/config')) return handleConfig(req, res);
    if (path.startsWith('/api/library')) return handleLibrary(req, res);
    if (path.startsWith('/api/reprice')) return handleReprice(req, res);
    if (path.startsWith('/api/share')) return handleShare(req, res);

    if (NOT_WIRED[path]) return send(res, 501, { error: NOT_WIRED[path] });

    // static
    const file = path === '/' ? '/builder.html' : path;
    const full = join(UI, normalize(file).replace(/^[/\\]+/, ''));
    if (!full.startsWith(UI)) return send(res, 403, { error: 'forbidden' });
    if ((await stat(full)).isDirectory()) throw new Error('dir');
    const buf = await readFile(full);
    res.writeHead(200, {
      'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    if (res.headersSent) return;
    if (e?.code === 'ENOENT' || e?.code === 'EISDIR' || e?.message === 'dir') return send(res, 404, { error: `not found: ${path}` });
    send(res, e?.status ?? 500, { error: String(e?.message ?? e) });
  }
});

// Only listen when run directly, so server.test.mjs can import the adapters (same pattern
// engine.mjs uses for its CLI block).
if (process.argv[1]?.endsWith('server.mjs')) {
  app.listen(PORT, () => {
    console.log(`\n  MAI builder on this project's rule file (rules.json)`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  ${CATALOG.length} cabinets · dashboard, 2D, 3D, library, pricing and share are live`);
    console.log(`  ${Object.keys(NOT_WIRED).length} endpoints return 501 (AI floor-plan read, DWG import)\n`);
  });
}
