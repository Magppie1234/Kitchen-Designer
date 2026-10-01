import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { surfaceRates, installRates } from '../../vendor/pricingConfig.js';
import { priceSaleable } from '../../vendor/saleablePricing.js';
import '../../ui/cabinet-catalog.js';

const rules = JSON.parse(readFileSync('rules.json', 'utf8'));
const R = rules.params.quote_rates;

test('billing rates in rates.json are the rates the designer confirmed (rules.json quote_rates)', () => {
  assert.ok(rules.rules.some((r) => r.id === 'quote-surface-and-install-rates'));
  const s = surfaceRates(), inst = installRates();
  assert.equal(s.Countertop.materialPerSqft, R.countertop_material);
  assert.equal(s.Backsplash.materialPerSqft, R.backsplash_material);
  assert.equal(s.Countertop.installPerSqft, R.countertop_install);
  assert.equal(s.Backsplash.installPerSqft, R.backsplash_install);
  assert.equal(inst.Cabinets, R.cabinet_install);
});

test('countertop material is billed once in A and its installation once in B; cabinets install on carcass sqft', () => {
  const plan = { runs: [{ key: 'W0', total: 1200, segments: [{ kind: 'cabinet', code: 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15', width: 600, height: 720, depth: 560 }, { kind: 'cabinet', code: 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15', width: 600, height: 720, depth: 560 }] }],
    tiers: {}, bom: { 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15': 2 } };
  const price = priceSaleable(plan, {});
  const counterSqft = 1200 * 560 / 92903;   // both cabinets' worktop, unrounded
  assert.equal(price.breakdown.counter, Math.round(counterSqft * R.countertop_material), 'server countertop line is stone only');

  // the Quote's own maths, run against that plan
  const html = readFileSync('ui/builder.html', 'utf8');
  const src = html.slice(html.indexOf('// Backsplash = the dado'), html.indexOf('// Every room\'s grand total'));
  const byCode = { 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15': { carcassSqft: 5.296 } };
  const ctx = vm.createContext({ window: { TALL_ANCHORS: ['fridge'] }, CabinetCatalog: globalThis.CabinetCatalog, hobBOQItems: () => [], seriesRate: () => 11400,
    S: { plan: { ...plan, price: { ...price, breakdown: { ...price.breakdown, counter: 999999 } } }, cabCat: byCode, options: {},
      quoteCfg: {}, cfgInstall: installRates(), cfgSurfaces: surfaceRates() } });
  vm.runInContext(src + ';globalThis.q=quoteMath();', ctx);
  const q = ctx.q;
  assert.equal(q.counter, Math.round(price.counterSqft * R.countertop_material), 'a saved combined figure is not reused');
  assert.equal(q.svcCtop, Math.round(q.ctopSqft * R.countertop_install));
  assert.equal(q.ctopSqft, +price.counterSqft.toFixed(1), 'A and B measure the same countertop area');
  assert.equal(q.cabSqft, 10.6, 'cabinet installation uses the cabinet table\'s carcass net sqft');
  assert.equal(q.svcCab, Math.round(10.6 * R.cabinet_install));
  assert.equal(q.svcWall, Math.round(q.wallPanelSqft * R.backsplash_install));
  assert.equal(q.wallpanel, Math.round(q.wallPanelSqft * R.backsplash_material));
});

test('backsplash is the dado: countertop runs under wall cabinets, countertop top to cabinet underside', () => {
  const html = readFileSync('ui/builder.html', 'utf8');
  const ctx = vm.createContext({ window: { TALL_ANCHORS: ['fridge'] }, S: {} });
  vm.runInContext(html.slice(html.indexOf('// Backsplash = the dado'), html.indexOf('function quoteMath(){')), ctx);
  const plan = { geometry: { baseTop: 850, wallBottom: 1415 },
    runs: [{ key: 'W0', segments: [
      { kind: 'cabinet', x0: 0, width: 600 },                  // under a wall cabinet → counts
      { kind: 'anchor', label: 'hob', x0: 600, width: 900 },   // under the chimney slot → counts
      { kind: 'cabinet', x0: 1500, width: 600 },               // nothing above → no backsplash
      { kind: 'door', x0: 2100, width: 900 },
      { kind: 'tallBank', x0: 3000, width: 600 } ] }],
    tiers: { W0: { wall: [
      { kind: 'wallSolid', x0: 0, width: 600 },
      { kind: 'chimney', x0: 600, width: 900 },
      { kind: 'none', x0: 1500, width: 600 },
      { kind: 'overDoor', x0: 2100, width: 900 },
      { kind: 'wallSolid', x0: 3000, width: 600 } ] } } };   // over the tall unit: no countertop, none
  const a = ctx.backsplashArea(plan);
  assert.equal(a.mm2, 1500 * 565);
  assert.equal(a.sqft, +(1500 * 565 / 92903).toFixed(1));
});

test('accessory prices come from the Kitchen Accessories sheet by S. NO.; unmapped names are absent (₹0)', async () => {
  const { accessoryPrices } = await import('../../vendor/pricingConfig.js');
  const p = accessoryPrices();
  assert.deepEqual(p['Cutlery Tray Silverstone'].map((r) => [r.sn, r.width, r.price]), [[1, 600, 6150], [2, 900, 7200]]);
  assert.equal(p['Onion & Potato Basket (Large)'][0].price, 7480);
  assert.equal(p['Tark System'][0].width, 600);
  assert.equal(p['Double Tray'], undefined);
});
