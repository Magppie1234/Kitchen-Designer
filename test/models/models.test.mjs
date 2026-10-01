import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../core/loadCatalog.mjs';
import { modelManifest, modelFile } from '../../core/models.mjs';

const catalog = loadCatalog().ok, man = modelManifest(catalog);

test('every linked model is named by a catalogue code, one file per code', () => {
  const codes = new Set(catalog.map((c) => c.code)), linked = man.models.filter((m) => m.code);
  assert.ok(linked.length > 250, `only ${linked.length} models linked`);
  for (const m of linked) assert.ok(codes.has(m.code), m.path);
  assert.equal(new Set(linked.map((m) => m.code)).size, linked.length);
  assert.equal(linked.length + man.missing.length, codes.size);
});

test('model entries carry a fingerprint so an updated handle variant cannot be served from a stale 3D cache', () => {
  const cAndJ = man.models.find((m) => m.code === 'BC-GD-CJ-ST-1BL-1HF-XXX-600-720-560-15');
  const titus = man.models.find((m) => m.code === 'BC-GD-TTS-ST-1BL-1HF-XXX-600-720-560-15');
  assert.match(cAndJ.path, /C & J Profile Cabinets/);
  assert.match(titus.path, /External Handle/);
  assert.match(cAndJ.version, /^\d+-\d+$/);
  assert.match(titus.version, /^\d+-\d+$/);
  assert.notEqual(cAndJ.version, titus.version);
});

test('a filename with one surplus XXX field still links to its code', () => {
  const m = man.models.find((x) => x.code === 'BC-DW-TTS-ST-1HB-XXX-900-520-560-15');
  assert.match(m.path, /BC-DW-TTS-ST-1HB-XXX-XXX-900-520-560-15\.glb$/);
});

test('countertop, filler and panel items are listed; model paths cannot escape the roots', () => {
  for (const name of ['Countertop 30mm', 'BFP-717', 'VP-560-15'])
    assert.ok(man.models.some((m) => m.category === 'item' && m.item === name), name);
  assert.ok(modelFile(man.models[0].path));
  assert.equal(modelFile('../server.mjs'), null);
});

test('Anchors, Handle and Structure files are typed by name, never left unlinked', () => {
  const of = (cat, key) => man.models.filter((m) => m.category === cat).map((m) => `${m[key]}:${m.name}`).sort();
  assert.deepEqual(of('appliance', 'appliance'), ['chimney:chimney', 'dishwasher:dishwasher_fully', 'dishwasher:dishwasher_semi',
    'fridge:refrigerator_big', 'fridge:refrigerator_small', 'hob:Hob_600', 'hob:Hob_900', 'sink:sink and faucet_veggie', 'sink:sink double bowl']);
  assert.deepEqual(of('handle', 'handle'), ['CJ:C&J HANDLE', 'TTS:TITUS HANDLE']);
  assert.deepEqual(of('structure', 'structure'), ['beam:BEAM', 'column:COULMN', 'door:DOOR', 'window:WINDOW_1', 'window:WINDOW_2']);
  assert.ok(!man.unlinked.some((p) => /^(Anchors|Handle|Structure)\//.test(p)));
});

test('appliance files authored facing another way carry their front from Anchors/orientation.json', () => {
  const front = (name) => man.models.find((m) => m.category === 'appliance' && m.name === name)?.front ?? '+z';
  assert.equal(front('sink and faucet_veggie'), '+x');
  assert.equal(front('sink double bowl'), '-z');
  assert.equal(front('Hob_900'), '-z');
  assert.equal(front('Hob_600'), '+z');
  assert.equal(front('chimney'), '+z');
});

test('every chimney panel the renderer can ask for exists, and its sizes reach the browser config', async () => {
  const { RULES } = await import('../../vendor/rules.js');
  const p = RULES.params, items = new Set(man.models.filter((m) => m.category === 'item').map((m) => m.item));
  assert.deepEqual(p.chimney_panel_height, { '7ft': 450, '8ft': 600 });
  for (const hob of [600, 900]) for (const h of Object.values(p.chimney_panel_height))
    assert.ok(items.has(`CP-${hob + p.chimney_wider_than_hob_by}-${h}-15`), `CP-${hob + p.chimney_wider_than_hob_by}-${h}-15`);
});
