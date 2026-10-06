import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadCatalog, readWorkbook } from '../../core/loadCatalog.mjs';
import '../../ui/cabinet-catalog.js';
const { cabinetQuote, profilesFor, validEntries, groupTree, shortDesc } = globalThis.CabinetCatalog;

const wb = readWorkbook();
const cat = loadCatalog(wb);
const leaves = (node) => [...node.items, ...Object.values(node.dirs).flatMap(leaves)];

test('catalogue is the workbook: every Cabinets row parses and keeps its workbook values', () => {
  assert.equal(cat.bad.length, 0, JSON.stringify(cat.bad));
  assert.equal(cat.ok.length, wb.cabinets.length);
  for (const [i, c] of cat.ok.entries()) {
    const r = wb.cabinets[i];
    assert.equal(c.code, r['Cabinet Code (Corrections by Rashmi)']);
    assert.equal(c.familyName, r['Family Name'] === '�' ? null : r['Family Name']);
    // the workbook's own definition: Carcass Net Sqft = W × (H + SKRT) / 92903.4
    assert.match(r._carcassFormula, /^=\(Q(\d+)\*\(R\1\+S\1\)\)\/92903\.4$/);
    assert.ok(Math.abs(c.carcassSqft - (r.Width * (r.Height + (r.SKRT ?? 0))) / 92903.4) < 1e-6, c.code);
  }
});

test('shutter profiles and description groups come from the workbook, not from code', () => {
  const style = (d) => wb.designs[d];
  assert.deepEqual(profilesFor(wb.designs, 'Modern'), Object.keys(wb.designs).filter((d) => style(d) === 'Modern'));
  assert.deepEqual(profilesFor(wb.designs, null), Object.keys(wb.designs));
  const entries = cat.ok.map((c) => ({ ...c, w: c.width, category: 'base', inSeries: true, path: `F/${c.width}/${c.code}.glb` }));
  const byDesc = groupTree(entries.map((e) => ({ ...e, path: `Base Cabinets/${e.code}.glb` })), 'description');
  assert.deepEqual(Object.keys(byDesc.dirs), ['Base']);   // type folder first, without "Cabinets"
  for (const [desc, leaf] of Object.entries(byDesc.dirs.Base.dirs))
    for (const e of leaf.items) assert.equal(shortDesc(e.description), desc, e.code);
  // the folder already names the type, so the description drops it
  assert.equal(shortDesc('Base cabinet + 2 HB drawer'), '2 HB drawer');
  assert.equal(shortDesc('Base sink cabinet + hinged shutter'), 'Sink + hinged shutter');
  assert.equal(shortDesc('Tall cabinet - Low Depth + 6 shelf + hinged shutter'), 'Low Depth + 6 shelf + hinged shutter');
  assert.equal(shortDesc('Mid ht. wall cabinet + 4 shelves'), '4 shelves');
  assert.equal(shortDesc('Loft cabinet + 1  glass shelf + hinged shutter'), shortDesc('Loft cabinet + 1 glass shelf + hinged shutter'));
});

test('both browse modes offer exactly the same valid cabinets for a profile', () => {
  const [a, b] = cat.ok.filter((c) => c.profiles.length);
  const entries = [
    { ...a, w: 600, category: 'base', inSeries: true, path: 'Base/600/a.glb' },
    { ...b, w: 900, category: 'base', inSeries: true, path: 'Base/900/b.glb' },
    { ...a, code: 'no-model', w: 600, category: 'base', inSeries: true, path: null },
    { ...a, code: 'wall', w: 600, category: 'wall720', inSeries: true, path: 'Wall/w.glb' },
    { ...a, code: 'other-series', w: 600, category: 'base', inSeries: false, path: 'Base/600/o.glb' },
    { ...a, code: 'no-profile', w: 600, category: 'base', inSeries: true, profiles: [], path: 'Base/600/n.glb' },
  ];
  const profile = a.profiles[0];
  const valid = validEntries(entries, { cats: ['base'], maxW: 700, profile, cross: false });
  assert.deepEqual(valid.map((e) => e.code), [a.code]);
  const codes = (mode) => leaves(groupTree(valid, mode)).map((e) => e.code).sort();
  assert.deepEqual(codes('width'), codes('description'));
  assert.deepEqual(Object.keys(groupTree(valid, 'width').dirs), ['Base']);
});

test('quote: each cabinet is series rate × carcass net sqft, and the total is the sum of the lines', () => {
  const byCode = { A: { carcassSqft: 3.971867553 }, B: { carcassSqft: 16.14580306 } };
  const q = cabinetQuote({ A: 2, B: 1, X: 1 }, byCode, 7900);
  assert.deepEqual(q.lines.map((l) => [l.code, l.amount]), [['A', 31378], ['A', 31378], ['B', 127552]]);
  assert.equal(q.total, 31378 * 2 + 127552);
  assert.deepEqual(q.unpriced, ['X']);
  assert.equal(cabinetQuote({ A: 1 }, byCode, 9400).total, Math.round(3.971867553 * 9400), 'a series change reprices');
  const none = cabinetQuote({ A: 1 }, byCode, null);
  assert.equal(none.total, 0); assert.deepEqual(none.unpriced, ['A']);
});

test('quote: base / wall / tall are all priced at the room series rate', () => {
  const byCode = { B: { carcassSqft: 2, group: 'base' }, W: { carcassSqft: 3, group: 'wall' }, T: { carcassSqft: 10, group: 'tall' } };
  const q = cabinetQuote({ B: 1, W: 1, T: 1 }, byCode, 9900);
  assert.deepEqual(q.lines.map((l) => l.rate), [9900, 9900, 9900]);
  assert.equal(q.total, 15 * 9900); assert.equal(q.rate, 9900);
});

// ---- the edit gate, run against the real builder functions ----
const html = readFileSync('ui/builder.html', 'utf8');
const between = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); return html.slice(i, html.indexOf(b, i)); };

function builder() {
  const el = {}; const $ = (id) => (el[id] ??= { innerHTML: '' });
  const seg = { kind: 'cabinet', code: 'BC-SH-TTS-ST-1SX-LHS-XXX-600-720-560-15', width: 600, x0: 0, x1: 600 };
  const S = { modules: [{ run: 'W0', segTier: 'base', seg: 0, code: seg.code, label: 'shelf', W: 600, H: 720, D: 560 }],
    plan: { runs: [{ key: 'W0', segments: [seg] }], tiers: {} }, view: '2d' };
  const ctx = vm.createContext({ S, $, esc: String, inr: String, showToast() {}, draw2d() {}, drawElevation() {}, resultPlanFullscreen: null,
    CabinetCatalog: globalThis.CabinetCatalog, seriesRate: () => 7900 });
  vm.runInContext([
    between('S.selModRef=null;   // {run', '/*__RELOCATE_CORE_START__*/'),
    between('function showModule', '// Elevation dispatcher'),
    between('function modTitle', '// Will `txt`'),
    between('function startModDrag', 'function onModDrag'),
  ].join('\n'), ctx);
  ctx.openLibPanel = () => { ctx.panelOpened = true; };
  ctx.afterEdit = () => {};
  return { ctx, S, el, seg };
}

test('before "Start editing", clicking or hovering a cabinet shows only its code and changes nothing', () => {
  const { ctx, S, el, seg } = builder();
  const before = JSON.stringify(S.plan);
  ctx.selectModule(0);
  assert.equal(S.selModRef, null); assert.ok(!ctx.panelOpened);
  assert.match(el.modDetail.innerHTML, new RegExp(seg.code)); assert.doesNotMatch(el.modDetail.innerHTML, /mm|sqft/);
  ctx.selectTierUnit('W0', 'base', 0);
  assert.equal(S.selModRef, null);
  assert.equal(ctx.modTitle(0), `<title>${seg.code}</title>`);
  S.selModRef = { run: 'W0', tier: 'base', idx: 0 };     // even a stale selection cannot edit
  ctx.editDelete(); ctx.editReplacePick('X', 600, 720, 0);
  assert.equal(JSON.stringify(S.plan), before);
  assert.equal(ctx.startModDrag({ preventDefault() { throw new Error('drag started'); } }, 0), undefined);
});

test('after "Start editing", a cabinet can be selected and deleted', () => {
  const { ctx, S } = builder();
  S.editing = true;
  ctx.selectModule(0);
  assert.deepEqual({ ...S.selModRef }, { run: 'W0', tier: 'base', idx: 0 }); assert.ok(ctx.panelOpened);
  ctx.editDelete();   // deleting leaves open space of the same width — nothing drawn in it
  const open = S.plan.runs[0].segments[0];
  assert.deepEqual([open.kind, open.open, open.label], ['filler', true, 'open space']);
});

test('toolbar offers an explicit Start editing button instead of the click hint', () => {
  assert.doesNotMatch(html, /Click a cabinet to edit/);
  const tabs = between('function renderResultTabs', 'function setPlanTier');
  assert.match(tabs, /onclick="enterEditMode\(\)"[^>]*>✎ Start editing</);
  assert.match(tabs, /Done editing/);
});

test('server plan price (Review screen) equals the Quote: series rate × carcass sqft', async () => {
  const { priceSaleable } = await import('../../vendor/saleablePricing.js');
  const { getSeries } = await import('../../vendor/series.js');
  const [a, b] = cat.ok;
  const plan = { runs: [], tiers: {}, bom: { [a.code]: 2, [b.code]: 1 } };
  for (const id of ['elite-modern', 'signature-classic']) {
    const rate = getSeries(id).startingRatePerSqft;
    const expected = cabinetQuote(plan.bom, Object.fromEntries(cat.ok.map((c) => [c.code, c])), rate).total;
    const price = priceSaleable(plan, { seriesId: id });
    assert.equal(price.breakdown.cabinets, expected);
    assert.equal(price.rate, rate);
  }
  assert.equal(priceSaleable(plan, {}).breakdown.cabinets, 0, 'no series, no cabinet price');
});

test('space left by deleting tall cabinets offers tall cabinets and takes one back as a tall unit', () => {
  const { ctx, S } = builder();
  vm.runInContext(between('// Library categories for a slot', 'function fillThumb'), ctx);
  const tall = (x0) => ({ kind: 'tallBank', tier: 'tall', code: 'TC-SH-TTS-ST-5SX-LHS-XXX-600-2400-560-15', width: 600, height: 2400, depth: 560, x0, x1: x0 + 600, units: [{ type: 'shelves', width: 600 }] });
  S.plan.runs[0].segments = [{ kind: 'cabinet', code: 'BC', width: 600, x0: 0, x1: 600 }, tall(600), tall(1200), { kind: 'filler', width: 50, x0: 1800, x1: 1850 }];
  S.editing = true; S.libData = { entries: [] };
  for (const idx of [1, 2]) { S.selModRef = { run: 'W0', tier: 'base', idx }; ctx.editDelete(); }   // delete both talls
  const segs = S.plan.runs[0].segments;
  assert.deepEqual(segs.map((x) => [x.kind, x.tier ?? 'base', x.width]), [['cabinet', 'base', 600], ['filler', 'tall', 1200], ['filler', 'base', 50]],
    'the two tall spaces merge; the base filler beside them stays separate');
  S.selModRef = { run: 'W0', tier: 'base', idx: 1 };
  assert.deepEqual([...ctx.thumbCatsFor(S.selModRef, segs[1])], ['tall2400']);
  assert.deepEqual([...ctx.thumbCatsFor(S.selModRef, segs[0])], ['base']);
  ctx.editReplacePick('TC-SH-TTS-ST-5SX-LHS-XXX-600-2400-560-15', 600, 2400, 0);
  assert.deepEqual(segs.map((x) => [x.kind, x.tier ?? 'base', x.width]), [['cabinet', 'base', 600], ['tallBank', 'tall', 600], ['filler', 'tall', 600], ['filler', 'base', 50]]);
  assert.equal(segs[1].units[0].code, 'TC-SH-TTS-ST-5SX-LHS-XXX-600-2400-560-15');
});

test('By width lists every cabinet in a folder; the ones that cannot go in the slot say why', () => {
  const { whyInvalid } = globalThis.CabinetCatalog;
  const opts = { cats: ['base'], maxW: 600, profile: 'MD1', cross: false };
  const e = (x) => ({ category: 'base', w: 600, inSeries: true, profiles: ['MD1'], path: 'Base/x.glb', ...x });
  assert.equal(whyInvalid(e({}), opts), null);
  assert.equal(whyInvalid(e({ w: 900 }), opts), '900 mm wide — 600 mm free');
  assert.equal(whyInvalid(e({ category: 'wall720' }), opts), 'wall cabinet — this is a base space');
  assert.equal(whyInvalid(e({ inSeries: false }), opts), 'not in this series');
  assert.equal(whyInvalid(e({ profiles: ['MD2'] }), opts), 'not offered in shutter profile MD1');
  // the builder: width mode keeps the non-fitting ones (with a reason); family mode drops them
  const html = readFileSync('ui/builder.html', 'utf8');
  assert.match(html, /S\.libBrowse==='width'\s*\n?\s*\? lib\.entries\.filter\(e=>e\.path\)\.map\(e=>\(\{\.\.\.e,reason:CabinetCatalog\.whyInvalid\(e,opts\)\}\)\)/);
  assert.match(html, /\$\{e\.reason\?`disabled title=/, 'a cabinet that cannot go there has its Use button disabled');
});

test('a hob or sink anchor is replaced only by its own kind of cabinet and stays the anchor', () => {
  const { whyInvalid } = globalThis.CabinetCatalog;
  const family = { re: /^BC-HO-/, name: 'hob' };
  const opts = { cats: ['base'], maxW: 900, profile: null, cross: true, family };
  assert.equal(whyInvalid({ category: 'base', w: 900, code: 'BC-HO-CJ-ST-XXX-2HB-XXX-900-720-560-15' }, opts), null);
  assert.equal(whyInvalid({ category: 'base', w: 900, code: 'BC-DW-CJ-ST-XXX-2HB-XXX-900-720-560-15' }, opts), 'not a hob cabinet');
  const { ctx, S } = builder();
  S.plan.runs[0].segments = [{ kind: 'anchor', label: 'hob', func: 'hob', code: 'BC-HO-CJ-ST-2LB-1HB-XXX-900-720-560-15', width: 900, x0: 0, x1: 900 }];
  S.editing = true; S.libData = { entries: [] }; S.selModRef = { run: 'W0', tier: 'base', idx: 0 };
  ctx.editReplacePick('BC-DW-CJ-ST-XXX-2HB-XXX-900-720-560-15', 900, 720, 0);
  assert.equal(S.plan.runs[0].segments[0].code, 'BC-HO-CJ-ST-2LB-1HB-XXX-900-720-560-15', 'a drawer cabinet cannot replace the hob');
  ctx.editReplacePick('BC-HO-CJ-ST-XXX-2HB-XXX-900-720-560-15', 900, 720, 0);
  assert.deepEqual([S.plan.runs[0].segments[0].kind, S.plan.runs[0].segments[0].label, S.plan.runs[0].segments[0].code], ['anchor', 'hob', 'BC-HO-CJ-ST-XXX-2HB-XXX-900-720-560-15']);
});
