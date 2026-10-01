// models.mjs — the GLB model library, read straight from the Models folder.
//
// A cabinet model is named by its cabinet code (the "Corrections by Rashmi" column), so
// linking is an exact filename match against data/workbook.json — no hand-kept manifest. The
// folder is rescanned on every request: dropping in or renaming a file needs no restart.
// "Additional Items" (countertop, backsplash, fillers, panels) are stretched to fit by the
// renderer; ui/models/Accessories (Kubos, Tark, hood panels) is the only other root.
// Three folders hold models that attach to a plan rather than to a catalogue code:
//   Anchors/   appliances for the plan's anchors — hob, sink, fridge, dishwasher, chimney
//   Handle/    the detailed handle per handle type (C&J profile, Titus bar)
//   Structure/ room fabric — beam, column, door, window
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
export const MODEL_ROOTS = [join(ROOT, 'Models'), join(ROOT, 'ui', 'models')];

// The renderer's shelf for a catalogue unit: base / wall720 / wall1085 / loft / midht /
// tall2040 / tall2400. Used by the thumbnail and the cabinet library.
export function categoryOf(unit) {
  if (unit.group === 'base') return 'base';
  if (['MD', 'MDW', 'MDT'].includes(unit.zone)) return 'midht';
  if (unit.group === 'tall') return unit.height < 2300 ? 'tall2040' : 'tall2400';
  if (['LO', 'LB', 'LOF', 'LBF'].includes(unit.zone)) return 'loft';
  return unit.height < 900 ? 'wall720' : 'wall1085';
}

// Anchors/Handle/Structure are matched by what the file name says it is, so a new size of
// an existing appliance (Hob_750.glb) needs no code change: the renderer picks among all
// files of a type by measured width.
const APPLIANCE = [[/hob/i, 'hob'], [/sink/i, 'sink'], [/refrigerator|fridge/i, 'fridge'], [/dishwasher/i, 'dishwasher'], [/chimney|hood/i, 'chimney']];
const HANDLE = [[/c\s*&\s*j|\bcj\b/i, 'CJ'], [/titus|\btts\b/i, 'TTS']];
const STRUCTURE = [[/beam/i, 'beam'], [/colu?mn|coulmn/i, 'column'], [/door/i, 'door'], [/window/i, 'window']];
const pick = (table, name) => (table.find(([re]) => re.test(name)) ?? [])[1] ?? null;
const FRONTS = new Set(['+z', '-z', '+x', '-x']);

// Anchors/orientation.json: which way each appliance file faces as authored (the files come
// from different sources — the double-bowl sink faces -z, the veggie sink +x). Unlisted: +z.
function applianceFronts() {
  const file = join(MODEL_ROOTS[0], 'Anchors', 'orientation.json');
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; }
  catch { return {}; }   // a malformed file must not take the whole model library down
}

// A filename that is the catalogue code with one surplus XXX field still links to it.
function codeFor(name, byCode) {
  if (byCode.has(name)) return name;
  const f = name.split('-');
  for (let i = 0; i < f.length; i++)
    if (f[i] === 'XXX') { const c = [...f.slice(0, i), ...f.slice(i + 1)].join('-'); if (byCode.has(c)) return c; }
  return null;
}

export function modelManifest(catalog) {
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const models = [], seen = new Set(), fronts = applianceFronts();
  for (const root of MODEL_ROOTS) {
    if (!existsSync(root)) continue;
    for (const rel of readdirSync(root, { recursive: true })) {
      if (!/\.glb$/i.test(rel)) continue;
      const path = rel.split(sep).join('/'), name = path.split('/').pop().replace(/\.glb$/i, '');
      // A GLB can be replaced without its catalogue code changing.  Expose a stable
      // fingerprint so the renderer never reuses yesterday's model for today's SKU.
      const stat = statSync(join(root, rel));
      const version = `${Math.floor(stat.mtimeMs)}-${stat.size}`;
      if (seen.has(path)) continue;   // Models wins over ui/models for the same path
      seen.add(path);
      const code = codeFor(name, byCode), unit = code && byCode.get(code);
      if (unit) models.push({ code, category: categoryOf(unit), w: unit.width, h: unit.height, d: unit.depth, path, name, version });
      else if (/^Additional Items\//i.test(path))
        models.push({ category: 'item', item: name, side: /\/RH\//.test(path) ? 'RH' : /\/LH\//.test(path) ? 'LH' : null, path, name, version });
      else if (/^Accessories\//i.test(path)) models.push({ category: 'accessory', path, name, version });
      else if (/^Anchors\//i.test(path) && pick(APPLIANCE, name))
        models.push({ category: 'appliance', appliance: pick(APPLIANCE, name), ...(FRONTS.has(fronts[name]) ? { front: fronts[name] } : {}), path, name, version });
      else if (/^Handle\//i.test(path) && pick(HANDLE, name))
        models.push({ category: 'handle', handle: pick(HANDLE, name), path, name, version });
      else if (/^Structure\//i.test(path) && pick(STRUCTURE, name))
        models.push({ category: 'structure', structure: pick(STRUCTURE, name), path, name, version });
      else models.push({ category: 'unlinked', path, name, version });   // named for no catalogue code
    }
  }
  // first file per code wins; a duplicate filename is reported, not silently swapped in
  const linked = new Set();
  for (const m of models) if (m.code) { if (linked.has(m.code)) m.duplicate = true; linked.add(m.code); }
  return {
    models: models.filter((m) => !m.duplicate),
    missing: catalog.map((c) => c.code).filter((c) => !linked.has(c)),
    unlinked: models.filter((m) => m.category === 'unlinked' || m.duplicate).map((m) => m.path),
  };
}

// Absolute file for a served /models/<path>, or null when it escapes every root.
export function modelFile(rel) {
  for (const root of MODEL_ROOTS) {
    const full = join(root, rel);
    if (full.startsWith(root + sep) && existsSync(full)) return full;
  }
  return null;
}

if (process.argv[1]?.endsWith('models.mjs')) {
  const { loadCatalog } = await import('./loadCatalog.mjs');
  const m = modelManifest(loadCatalog().ok);
  console.log(`${m.models.filter((x) => x.code).length} cabinet models linked, ${m.missing.length} codes without a model, ${m.unlinked.length} files not linked`);
  for (const c of m.missing) console.log(`  NO MODEL  ${c}`);
  for (const p of m.unlinked) console.log(`  UNLINKED  ${p}`);
}
