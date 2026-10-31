// plan-read.mjs — reads an uploaded kitchen plan with Gemini 3.8 Flash, in two calls:
//   findKitchens(pages)   page images -> where each kitchen is (POST /api/kitchen-detect)
//   readKitchen(image)    close-up of one kitchen -> editable draft (POST /api/vision-extract)
// The draft is what ui/builder.html applyVisionExtract() takes: walls, open sides, doors and
// windows, columns, plus whatever cabinetry the drawing shows (base/wall/tall zones, hob, sink,
// fridge) so the fixtures screen opens pre-filled. Server-only; GEMINI_API_KEY never leaves it.
import { GoogleGenAI } from '@google/genai';

export const MODEL = 'gemini-3.8-flash';
const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PAGES = 6;

export const LOCATE = `These images are the pages of one architectural drawing (page 1 first). Find every KITCHEN shown in
PLAN VIEW (seen from above), possibly as one room of a whole-house plan. Ignore elevations, sections and schedules.
Return ONLY JSON: { "kitchens": [ { "page": <1-based page>, "label": "room name as printed, e.g. KITCHEN 14'-3\\" X 10'-0\\"",
  "box_2d": [ymin, xmin, ymax, xmax], "confidence": 0.0-1.0 } ] }
box_2d is normalised 0-1000 on that page, tight around the kitchen's walls. Empty list if there is no kitchen.`;

export const READ = `This is a crop of an architectural drawing, centred on the KITCHEN. Read it to set up a modular kitchen design.
Neighbouring rooms may be partly visible: describe only the kitchen.

Return ONLY JSON:
{
  "layout": "straight" | "L" | "U" | "parallel" | "G" | "island" | "peninsula" | "other",
  "units_on_drawing": "mm" | "ft-in",
  "outline": [ { "id": "S1", "kind": "wall" | "open" | "partition" | "glass", "dir": "right" | "down" | "left" | "up",
                 "length_mm": 0, "source": "printed" | "derived" | "estimated", "evidence": "" } ],
  "openings": [ { "type": "door" | "window" | "opening", "segment": "S1", "offset_mm": 0, "width_mm": 0,
                  "source": "printed" | "derived" | "estimated", "evidence": "" } ],
  "fixtures": [ { "type": "sink" | "hob" | "fridge" | "dishwasher" | "base_run" | "wall_run" | "tall_unit" | "island" | "peninsula" | "column" | "other",
                  "label": "text on the drawing", "segment": "S1" | null, "offset_mm": 0, "length_mm": 0, "depth_mm": 0,
                  "source": "printed" | "derived" | "estimated", "evidence": "" } ],
  "unreadable": ["things you could not determine"],
  "confidence": 0.0-1.0,
  "notes": ""
}

OUTLINE: trace the kitchen floor boundary clockwise from its top-left corner, as many segments as it really has —
every jog, alcove, wall stub, column face and partition is its own segment. Where the kitchen opens into another room
with no wall, use kind "open". "dir" is the walking direction on the drawing. Segments must close back to the start.

FIXTURES: only what the drawing actually shows. "base_run" = a run of base cabinets / countertop along a wall;
"wall_run" = overhead wall cabinets; "tall_unit" = a full-height unit (pantry, oven tower, fridge housing).
offset_mm is where the item STARTS along its segment, in walking direction; length_mm is its length along the wall.
A plan that only shows walls, doors and windows has an empty fixtures list.

NUMBERS — this is the most important rule:
- "printed": the number is written on the drawing; put the label text in evidence (e.g. "14'-3\\"").
- "derived": computed from printed numbers; show the arithmetic in evidence (e.g. "4180-1100-30=3050").
- "estimated": no printed basis. Use only when unavoidable, and say why in evidence.
Positions along a wall (offset_mm) must come from the dimension chain along that wall whenever one is drawn.
Convert ft-in exactly (1 ft = 304.8 mm, 1 in = 25.4 mm).

ONLY report what is drawn. Do not add a door, window, sink or hob that is not shown. A window crossed out or
marked "NO WINDOW" is not a window — mention it in notes. Fixture labels on the drawing ("SINK", "HOB",
"REFRIGERATOR", ...) are what define fixtures.`;

const fail = (status, message) => Object.assign(new Error(message), { status });
const parseJson = (t = '') => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } };
const parseDataUrl = (url) => {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(url || ''));
  if (!m || !MIMES.has(m[1])) throw fail(400, 'Plan pages must be PNG, JPEG or WebP images.');
  return { mime_type: m[1], data: m[2] };
};

let client;
export async function ask(input) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw fail(503, 'Plan reading is not configured: GEMINI_API_KEY is missing on the server.');
  client ??= new GoogleGenAI({ apiKey: key });
  let r;
  try { r = await client.interactions.create({ model: MODEL, input }, { maxRetries: 0 }); } // each retry is billed
  catch (e) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    console.error(`[plan-read] Gemini HTTP ${status}: ${e?.error?.message || e?.message || e}`);
    throw fail(status === 429 ? 429 : 502, status === 429 ? 'The plan reader is rate-limited or out of quota. Try again shortly.' : 'The plan reader returned an error.');
  }
  const u = r.usage || {};
  return { json: parseJson(r.output_text), text: r.output_text,
    tokens: { in: u.total_input_tokens || 0, out: (u.total_output_tokens || 0) + (u.total_thought_tokens || 0) } };
}

// body: { pages: [dataUrl, ...] } -> the shape ui/builder.html afterKitchenDetect() reads
// (the browser keeps its own full-resolution page images and attaches them).
export async function findKitchens(body) {
  const all = Array.isArray(body?.pages) ? body.pages : [];
  if (!all.length) throw fail(400, 'No plan pages were sent.');
  const pages = all.slice(0, MAX_PAGES).map(parseDataUrl);
  const { json } = await ask([{ type: 'text', text: LOCATE },
    ...pages.map((p) => ({ type: 'image', ...p, resolution: 'high' }))]);
  const found = Array.isArray(json?.kitchens) ? json.kitchens : [];
  return {
    pageCount: all.length, truncated: all.length > MAX_PAGES,
    pages: pages.map((_, i) => ({ pageIndex: i, detection: { isDedicatedKitchenDrawing: false,
      candidates: found.filter((k) => +k.page === i + 1 && Array.isArray(k.box_2d) && k.box_2d.length === 4).map((k, n) => {
        const [y0, x0, y1, x1] = k.box_2d.map((v) => Math.max(0, Math.min(1000, +v || 0)) / 1000);
        return { id: `k${i}-${n}`, label: String(k.label || 'Kitchen').slice(0, 80),
          confidence: Math.max(0, Math.min(1, +k.confidence || 0.5)),
          boundingBox: { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) } };
      }).filter((c) => c.boundingBox.width > 0.01 && c.boundingBox.height > 0.01) } })),
  };
}

// body: { imageDataUrl } -> applyVisionExtract() draft
export async function readKitchen(body) {
  const img = parseDataUrl(body?.imageDataUrl);
  const { json, text } = await ask([{ type: 'text', text: READ }, { type: 'image', ...img, resolution: 'ultra_high' }]);
  if (!json?.outline?.length) throw fail(502, text?.trim() ? 'The plan reader could not trace the kitchen walls.' : 'The plan reader returned nothing.');
  return toDraft(json);
}

const STEP = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
const TIER = { base_run: 'base', wall_run: 'wall', tall_unit: 'tall' };

// Model reading -> draft. Walls run corner i -> i+1, clockwise on screen (y down), mm, first corner
// at the origin. Opening and fixture positions become CENTRES along their wall (applyVisionExtract
// and the anchors measure from the wall's start); zones keep start/end.
export function toDraft(read) {
  const segs = (read.outline || []).filter((s) => STEP[s.dir] && +s.length_mm > 0);
  if (segs.length < 3) throw fail(502, 'The plan reader found fewer than three walls.');
  let x = 0, y = 0;
  const corners = segs.map((s) => { const p = [x, y]; x += STEP[s.dir][0] * s.length_mm; y += STEP[s.dir][1] * s.length_mm; return p.map(Math.round); });
  const warnings = [];
  const gap = Math.round(Math.hypot(x, y));
  if (gap > 50) warnings.push(`The walls read from the plan don't close by ${gap} mm — check the wall lengths.`);
  // Shoelace in y-down screen space: positive = clockwise. A counter-clockwise trace is reversed,
  // which flips every wall's direction, so positions along a wall are mirrored too.
  const area = corners.reduce((s, p, i) => { const q = corners[(i + 1) % corners.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const n = segs.length, ccw = area < 0;
  const idx = new Map(segs.map((s, i) => [s.id, ccw ? n - 1 - i : i]));
  const len = segs.map((s) => +s.length_mm);
  const pts = ccw ? [corners[0], ...corners.slice(1).reverse()] : corners;
  // a span [start, start+w) on segment id -> {i, s, e} on the final wall, clamped to it
  const span = (id, start, w) => {
    if (!idx.has(id)) return null;
    const k = segs.findIndex((s) => s.id === id), L = len[k];
    let s = Math.max(0, Math.min(L, +start || 0)), e = Math.max(s, Math.min(L, s + (+w || 0)));
    if (ccw) [s, e] = [L - e, L - s];
    return { i: idx.get(id), s: Math.round(s), e: Math.round(e) };
  };
  const openWalls = segs.map((s, k) => (s.kind === 'open' ? idx.get(s.id) : -1)).filter((i) => i >= 0);

  const openings = [];
  for (const o of read.openings || []) {
    const p = span(o.segment, o.offset_mm, o.width_mm);
    if (!p || openWalls.includes(p.i) || p.e - p.s < 300) continue;
    openings.push({ type: o.type === 'window' ? 'window' : 'door', ...(o.type === 'opening' ? { variant: 'doorless' } : {}),
      wallIndex: p.i, width_mm: p.e - p.s, distanceFromStart_mm: Math.round((p.s + p.e) / 2) });
  }

  const structures = [], zones = [], fixtures = [];
  let dishwasher = false;
  for (const f of read.fixtures || []) {
    if (f.type === 'dishwasher') { dishwasher = true; continue; }
    if (f.type === 'island' || f.type === 'peninsula') { warnings.push(`The plan shows ${f.type === 'island' ? 'an island' : 'a peninsula'} — add it on the fixtures screen.`); continue; }
    const p = f.segment ? span(f.segment, f.offset_mm, f.length_mm || (f.type === 'column' ? 300 : 600)) : null;
    if (!p) { if (['hob', 'sink', 'fridge'].includes(f.type)) warnings.push(`The ${f.type} is not against a wall on the plan — place it on the fixtures screen.`); continue; }
    if (openWalls.includes(p.i) && f.type !== 'column') continue;
    if (f.type === 'column') {
      // centre of the column: on the wall at the middle of its span, pushed inward by half its depth
      const a = pts[p.i], b = pts[(p.i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], inward = [-u[1], u[0]], m = (p.s + p.e) / 2, d = +f.depth_mm || 300;
      structures.push({ type: 'column', x_mm: Math.round(a[0] + u[0] * m + inward[0] * d / 2), y_mm: Math.round(a[1] + u[1] * m + inward[1] * d / 2),
        width_mm: Math.max(100, p.e - p.s), depth_mm: d });
    } else if (TIER[f.type]) {
      if (p.e - p.s >= 300) zones.push({ wall: 'W' + p.i, tier: TIER[f.type], s: p.s, e: p.e });
    } else if (['hob', 'sink', 'fridge'].includes(f.type) && !fixtures.some((x) => x.type === f.type)) {
      fixtures.push({ type: f.type, wall: 'W' + p.i, off: Math.round((p.s + p.e) / 2), width_mm: p.e - p.s });
    }
  }

  const all = [...segs, ...(read.openings || []), ...(read.fixtures || [])];
  const guessed = all.filter((v) => v.source === 'estimated').length;
  if (guessed) warnings.push(`${guessed} measurement${guessed > 1 ? 's were' : ' was'} estimated, not printed — check ${guessed > 1 ? 'them' : 'it'} against the plan.`);
  for (const u of (read.unreadable || []).slice(0, 3)) warnings.push(`Not readable on the plan: ${u}.`);
  const c = +read.confidence || 0;
  return { room: { corners_mm: pts }, openWalls, openings, structures, zones, fixtures, dishwasher,
    confidence: c >= 0.85 ? 'high' : c >= 0.6 ? 'medium' : 'low', warnings, layout: read.layout || null };
}

// ---- Read with the designer's pins (POST /api/plan-pins) ----
// The designer clicks hints on the uploaded plan (room inside, a wall, each door, window, column);
// the browser draws them on the image as numbered dots and sends the list. The model answers in
// IMAGE coordinates, not millimetres: locating things on a picture is what it does well, reading
// lengths is not. The browser converts to mm with the plan's scale, squares the walls
// (ui/builder.html pinReadToDraft), and one wall's real length sets the scale.
export const PIN_KINDS = { room: 'a point INSIDE a room', wall: 'on a wall of a room boundary',
  door: 'on a door', window: 'on a window', column: 'on a column' };
// A room dot may carry the designer's name for it ("Kitchen", "Store"): several room dots = several rooms.
const pinLine = (p) => `- dot ${p.n}: ${PIN_KINDS[p.kind]}${p.kind === 'room' && p.name ? ` — the room "${p.name}"` : ''}`;

export const PIN_READ = (pins) => {
  const rooms = pins.filter((p) => p.kind === 'room');
  return `This is a crop of an architectural floor plan centred on a KITCHEN, seen from above.
The designer has added numbered red dots as hints. The dots are NOT part of the drawing:
${pins.length ? pins.map(pinLine).join('\n') : '- (no dots: find the kitchen yourself)'}

Return ONLY JSON:
{
  "rooms": [ {
    "dot": n | null,
    "corners": [[y, x], ...],
    "open_edges": [k, ...],
    "openings": [ { "type": "door" | "window" | "opening", "from": [y, x], "to": [y, x], "dot": n | null } ],
    "columns": [ { "box_2d": [ymin, xmin, ymax, xmax], "dot": n | null } ]
  } ],
  "notes": ""
}
Every coordinate is normalised 0-1000 on THIS image, in [y, x] order.

ROOMS: ${rooms.length > 1 ? `one entry per "inside a room" dot (${rooms.map((p) => p.n).join(', ')}), in that order, "dot" set to it`
  : rooms.length ? `one entry, for the room with dot ${rooms[0].n}` : 'one entry, for the kitchen ("dot": null)'}.
Wall, door, window and column dots belong to the room they are on. A door between two of these rooms is listed in both.
CORNERS: the room's floor boundary, traced along the INSIDE FACE of its walls — the room side of each wall's drawn
thickness, never the wall's middle or outer face. Clockwise, starting at the top-left corner, one point per corner:
every jog, alcove, wall stub and column face is its own corner. Edge k runs from corner k to corner k+1 (the last one
back to corner 0). The boundary must enclose the room's dot and run along every "wall" dot on it.
OPEN_EDGES: edges where the room opens into another space with no wall drawn.
OPENINGS: every door, window or wall opening on the boundary — each dotted one, plus any you clearly see. "from" and
"to" are its two ends (the jambs), on the boundary line. A plain gap in a wall with no door leaf is "opening".
A door drawn open shows its leaf as a thin rectangle at right angles to the wall, where the swing arc ends. That
leaf is part of the door, NEVER a wall: the boundary runs straight across the doorway, not around the leaf.
COLUMNS: each column on or inside the boundary, as its box.
Only report what is drawn. A dot you cannot match to anything: say so in notes.`;
};

const yx = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(+n))
  ? [Math.max(0, Math.min(1000, +v[1])) / 1000, Math.max(0, Math.min(1000, +v[0])) / 1000] : null;

// One room of the model answer -> image fractions [x, y] (0-1, y down), which the browser maps onto the plan.
function toRoom(read) {
  const corners = (read?.corners || []).map(yx).filter(Boolean);
  if (corners.length < 3) return null;
  const n = corners.length;
  return {
    dot: Number.isInteger(+read.dot) && read.dot !== null ? +read.dot : null,
    corners,
    openEdges: [...new Set((read.open_edges || []).map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < n))],
    openings: (read.openings || []).map((o) => ({ type: ['door', 'window', 'opening'].includes(o?.type) ? o.type : 'door', a: yx(o?.from), b: yx(o?.to) }))
      .filter((o) => o.a && o.b),
    columns: (read.columns || []).filter((c) => Array.isArray(c?.box_2d) && c.box_2d.length === 4).map((c) => {
      const [y0, x0, y1, x1] = c.box_2d.map((v) => Math.max(0, Math.min(1000, +v || 0)) / 1000);
      return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
    }).filter((c) => c.x1 > c.x0 && c.y1 > c.y0),
  };
}
// The whole answer: { rooms: [...], notes }. A bare single-room answer (no "rooms") is read as one room.
export function toPinRead(read) {
  const rooms = (Array.isArray(read?.rooms) ? read.rooms : [read]).map(toRoom).filter(Boolean);
  if (!rooms.length) throw fail(502, 'The plan reader could not trace the room walls.');
  return { rooms, notes: String(read.notes || '').slice(0, 400) };
}

// body: { imageDataUrl (with the dots drawn on), pins: [{ n, kind, name? }] }
export async function readWithPins(body) {
  const img = parseDataUrl(body?.imageDataUrl);
  const pins = (Array.isArray(body?.pins) ? body.pins : []).filter((p) => PIN_KINDS[p?.kind] && Number.isInteger(+p.n))
    .slice(0, 60).map((p) => ({ n: +p.n, kind: p.kind, ...(p.kind === 'room' && p.name ? { name: String(p.name).replace(/["\r\n]/g, '').slice(0, 40) } : {}) }));
  const { json, text } = await ask([{ type: 'text', text: PIN_READ(pins) }, { type: 'image', ...img, resolution: 'ultra_high' }]);
  if (!json) throw fail(502, text?.trim() ? 'The plan reader could not trace the room walls.' : 'The plan reader returned nothing.');
  return toPinRead(json);
}
