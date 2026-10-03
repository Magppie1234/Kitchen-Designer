// render.mjs — photoreal AI render of a 3D snapshot, ported from the Render Studio project
// ("web plugin"): the same layered prompt and the same Gemini Interactions call. Server-only;
// GEMINI_API_KEY never leaves this file.
import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.KITCHEN_RENDER_MODEL || 'gemini-3.1-flash-image';
const IMAGE_SIZE = process.env.KITCHEN_RENDER_SIZE || '2K';
const ASPECTS = ['16:9', '3:2', '4:3', '1:1', '4:5', '9:16', '21:9'];
const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BASE64 = 20_000_000;

const GEOMETRY_LOCK = `This image is a rendered viewport of an accurate 3D CAD model of a kitchen.
Convert it into a photorealistic architectural photograph.

Preserve the underlying geometry EXACTLY. Do not add, remove, resize, or
reposition any cabinet, drawer, shutter, handle, appliance, countertop,
splashback, or wall. Do not change the number of cabinet modules. Do not
change the counter height or the camera angle. Do not invent additional
cabinetry or hardware that is not present in the source image.

Your task is limited to: applying realistic materials and surface finishes,
adding physically plausible natural lighting, and producing photographic
depth, reflection and shadow detail. The structure stays identical.`;

const TEXT_REMOVAL = `One deliberate exception to the rule above: remove lettering, keep structure.
Any text, lettering, numerals, dimension annotations, callouts, brand names,
logos, badges, labels, stickers or watermarks that appear on surfaces in the
source image must be erased, and replaced with the clean, continuous material
that surrounds them. Cabinet fronts, appliance fascias, splashbacks and walls
should read as unmarked.

Erasing this lettering must not change the shape, size or position of the
object it was printed on. An appliance keeps its exact outline, its exact
controls and its exact placement — it simply carries no branding.`;

// Lighting is artificial on purpose: asking for daylight made the model invent a window (or a
// window's reflection) to explain it.
const HOUSE = `Photographed as a high-end interior magazine shot. The lighting is artificial
and even: bright, soft, neutral-white ambient light fills the whole room like a
well-lit showroom, with no directional sunlight and no dim or evening mood.
All of that light comes from the ceiling: small recessed downlights, flush
with the ceiling, are the main light source. The ceiling is a simple recessed
tray with a concealed cove strip around its edge; that strip is a warm accent
only. The room needs no window to be bright, so never add one. Warm LED strips
run under the wall cabinets and wash the wall below them — the space between
wall cabinets and countertop stays exactly as in the source, with no shelves,
niches or dividers added. Glass-fronted units and open shelves that already
exist in the source may be gently lit from inside, but the glass stays clear
and the shelves behind it stay visible. The floor and every appliance keep the
colour they have in the source image.
No sun patches or light beams on walls, floor or cabinets, and no reflections
of windows or glazing bars on any surface — gloss shows only soft, linear
highlights from the ceiling lights.
Neutral colour grade, clean whites, no colour cast. Keep the source image's
exact camera position, lens, field of view and perspective — do not zoom,
crop, re-frame, straighten or correct the perspective; every edge in the
result must sit on the same pixel as in the source. Uncluttered — no food, no
clutter on the counters, at most one or two restrained styling objects.`;

const NEGATIVE = `Do not render any text, watermarks, logos, brand names, or people.
Do not produce a stylised, illustrated, or CGI-looking result.

Do not invent any fixture, appliance or fitting that is not clearly visible in
the source image — no added sink, tap, hob, cooktop, extractor hood, oven,
microwave, shelf, splashback or cabinet. Where the source shows a plain panel,
render a plain panel. A kitchen that looks incomplete is correct; a kitchen with
equipment the model does not contain is wrong.`;

// Last in the prompt on purpose: it is the rule a client notices first when it is broken.
const HARD_RULE = `HARD RULE — this overrides everything else in this prompt.
Never, under any circumstances, invent anything that is not in the source
image: no cabinet, drawer, shelf, tall unit, wall unit, window, door, opening,
appliance, sink, tap, hob, hood, furniture or architectural feature.

A blank wall in the source stays a blank wall. Empty floor stays empty floor.
Where a cabinet run ends in the source it ends at the same place in the
result — never continue it along another wall or around a corner. Count the
cabinets, windows and doors in the source: the result has exactly the same
number of each, in exactly the same places.

There are exactly two exceptions:
1. A few small decoration pieces (a vase, a bowl, a plant, glassware), and only
   standing on a countertop or on a glass shelf.
2. The ceiling: one simple recessed tray with a concealed warm cove strip, plus
   small recessed downlights flush with the ceiling, drawn on the ceiling only.
   No pendant, chandelier, track light or any fitting that hangs below the
   ceiling.
Nothing may be added on the floor, on a wall or on a cabinet front.`;

function styleAssignment(labels) {
  if (!labels.length) return '';
  return [
    `The final ${labels.length} reference ${labels.length === 1 ? 'image' : 'images'} show material and finish direction`,
    'only, and each one is assigned to specific surfaces:', '',
    ...labels.map((l, i) => `- Reference image ${i + 1}: ${l}`), '',
    'Match each swatch\'s colour, grain, sheen and reflectivity on the surfaces it',
    'is assigned to.', '',
    'On every surface a swatch is assigned to, the colour, grain and texture shown',
    'in the source image are placeholders. Disregard them completely and replace',
    'them with the assigned swatch; none of the source\'s original finish may show',
    'through or blend with it. The source defines only the shape, edges and',
    'position of those surfaces.', '',
    'Apply it to EVERY instance of those surfaces, with no exception. If a finish',
    'is assigned to the cabinet fronts, then every front carries it — the run',
    'under the window, the tall units, the appliance housing surrounds, the',
    'shutter half-hidden at the edge of frame, and the panels that close off the',
    'end of a run. Do not leave one module, one end panel or one corner in a',
    'different material for variety or contrast, and do not fall back to a wood',
    'or default finish on any surface a swatch has claimed. A surface that the',
    'camera only partly sees is still that surface.', '',
    'Surfaces no swatch claims keep the material and colour they already have in',
    'the source image; do not introduce a second cabinet material that was not',
    'asked for.', '',
    'Three things are never part of the cabinet fronts, and no swatch ever covers',
    'them, whatever the assignments above say:',
    '- Handles: the recessed profile handle running along the edge of a front, and',
    '  any bar handle. Each keeps exactly the colour and material it has in the',
    '  source image.',
    '- Skirting: the plinth strip under the base and tall units is always brown, as',
    '  in the source image.',
    '- Glass units: the frames around glass doors and the edge linings of glass',
    '  shelves are dark bronze-brown, as in the source image — never silver, chrome,',
    '  steel or aluminium.', '',
    'Do not copy the swatches\' geometry, layout or framing, and do not draw the',
    'swatches themselves as objects, samples or panels anywhere in the scene.',
  ].join('\n');
}

export const composePrompt = (labels = []) =>
  [GEOMETRY_LOCK, TEXT_REMOVAL, [HOUSE, styleAssignment(labels)].filter(Boolean).join('\n\n'), NEGATIVE, HARD_RULE].join('\n\n');

const fail = (status, message) => Object.assign(new Error(message), { status });
const parseDataUrl = (url) => {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(url || ''));
  if (!m || !MIMES.has(m[1])) throw fail(400, 'Images must be PNG, JPEG or WebP data URLs.');
  return { mime_type: m[1], data: m[2] };
};

let client;
// body: { image: dataUrl, aspectRatio, references: [{ image: dataUrl, label }] }
export async function renderSnapshot(body, { signal } = {}) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw fail(503, 'AI rendering is not configured: GEMINI_API_KEY is missing on the server.');
  const source = parseDataUrl(body.image);
  const refs = (Array.isArray(body.references) ? body.references : []).slice(0, 4)
    .map((r) => ({ ...parseDataUrl(r.image), label: String(r.label || '').slice(0, 200) }));
  if (source.data.length + refs.reduce((n, r) => n + r.data.length, 0) > MAX_BASE64) throw fail(413, 'The snapshot is too large to render.');
  const aspect = ASPECTS.includes(body.aspectRatio) ? body.aspectRatio : '16:9';
  client ??= new GoogleGenAI({ apiKey: key });
  let interaction;
  try {
    interaction = await client.interactions.create({
      model: MODEL,
      input: [{ type: 'text', text: composePrompt(refs.map((r) => r.label)) },
        ...[source, ...refs].map(({ mime_type, data }) => ({ type: 'image', mime_type, data }))],
      store: true,
      // delivery/mime_type deliberately omitted — the live API rejects them (see Render Studio notes)
      response_format: { type: 'image', aspect_ratio: aspect, image_size: IMAGE_SIZE },
    }, { maxRetries: 0, ...(signal ? { fetchOptions: { signal } } : {}) }); // no auto-retry: each retry is billed
  } catch (e) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    const detail = e?.error?.message || e?.message || String(e);
    console.error(`[render] Gemini HTTP ${status}: ${detail}`);
    throw fail(status === 429 ? 429 : 502, status === 429 ? 'The AI renderer is rate-limited or out of quota. Try again shortly.' : 'The AI renderer returned an error.');
  }
  const img = interaction.output_image;
  if (!img?.data) throw fail(502, interaction.output_text?.trim() ? `The AI renderer did not return an image: ${interaction.output_text.trim()}` : 'The AI renderer did not return an image.');
  return { image: `data:${img.mime_type || 'image/png'};base64,${img.data}`, model: MODEL };
}
