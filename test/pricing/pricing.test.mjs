import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { surfaceRates, installRates, cityRates } from '../../vendor/pricingConfig.js';
import { priceSaleable } from '../../vendor/saleablePricing.js';
import '../../ui/cabinet-catalog.js';
import '../../ui/backsplash.js';

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
    tiers: {}, bom: { 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15': 2 },
    backsplash: { W0: [{ x0: 0, x1: 1200, z0: 850, z1: 1415 }] } };   // added in the Elevation; tucks 10mm behind the countertop
  const price = priceSaleable(plan, {});
  const counterSqft = 1200 * 560 / 92903;   // both cabinets' worktop, unrounded
  assert.equal(price.breakdown.counter, Math.round(counterSqft * R.countertop_material), 'server countertop line is stone only');

  // the Quote's own maths, run against that plan
  const html = readFileSync('ui/builder.html', 'utf8');
  const src = html.slice(html.indexOf('// Backsplash geometry'), html.indexOf('// The discount is one'));
  const byCode = { 'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15': { carcassSqft: 5.296 } };
  const ctx = vm.createContext({ window: { TALL_ANCHORS: ['fridge'] }, CabinetCatalog: globalThis.CabinetCatalog, Backsplash: globalThis.Backsplash, hobBOQItems: () => [], seriesRate: () => 11400,
    S: { plan: { ...plan, price: { ...price, breakdown: { ...price.breakdown, counter: 999999 } } }, cabCat: byCode, options: {},
      quoteCfg: {}, cfgInstall: installRates(), cfgSurfaces: surfaceRates() } });
  vm.runInContext(src + ';globalThis.q=quoteMath();', ctx);
  const q = ctx.q;
  assert.equal(q.counter, Math.round(price.counterSqft * R.countertop_material), 'a saved combined figure is not reused');
  assert.equal(q.svcCtop, Math.round(q.ctopSqft * R.countertop_install));
  assert.equal(q.ctopSqft, +price.counterSqft.toFixed(1), 'A and B measure the same countertop area');
  assert.equal(q.cabSqft, 10.6, 'cabinet installation uses the cabinet table\'s carcass net sqft');
  assert.equal(q.svcCab, Math.round(10.6 * R.cabinet_install));
  assert.equal(q.wallPanelSqft, +(1200 * 575 * 1.25 / 92903).toFixed(1), 'backsplash bills its cut area × 1.25');
  assert.equal(q.svcWall, Math.round(q.wallPanelSqft * R.backsplash_install));
  assert.equal(q.wallpanel, Math.round(q.wallPanelSqft * R.backsplash_material));
});

test('city charges: 4 site visits at the city rate; loading and transport by shipment-weight bracket', () => {
  const CR = cityRates();
  for (const [name, c] of Object.entries(CR.cities))
    assert.ok(c.zone && c.siteRate > 0 && c.loading.length === 6 && c.transport.length === 6 && [...c.loading, ...c.transport].every((n) => n > 0), name);
  assert.equal(CR.cities.Bengaluru.transport[0], 86400);
  assert.equal(CR.cities.Visakhapatnam.siteRate, 6000);
  for (const gone of ['Ahemdabad', 'Banglore', 'Vizag']) assert.equal(CR.cities[gone], undefined);

  // A project of rooms, each {bom, priced}: the page's own projectQuote(), with the room switch
  // stubbed to swap the plan in.
  const html = readFileSync('ui/builder.html', 'utf8');
  const src = html.slice(html.indexOf('// Backsplash geometry'), html.indexOf('// The discount is one'));
  const byCode = { 'BC-X': { carcassSqft: 5 }, 'TC-X': { carcassSqft: 20 } };
  const run = (city, boms, discount = 0) => {
    const rooms = boms.map((bom, i) => ({ id: i, design: { plan: bom && { runs: [], tiers: {}, bom, price: {} } } }));
    const ctx = vm.createContext({ window: { TALL_ANCHORS: ['fridge'] }, CabinetCatalog: globalThis.CabinetCatalog, Backsplash: globalThis.Backsplash, hobBOQItems: () => [], seriesRate: () => 10000,
      stashRoom() {}, withRoom(r, fn) { ctx.S.plan = r.design.plan; return fn(); },
      S: { rooms, cabCat: byCode, options: {}, project: { city, discount }, quoteCfg: {}, cityCfg: CR, cfgInstall: installRates(), cfgSurfaces: surfaceRates() } });
    vm.runInContext(src + ';globalThis.pq=projectQuote();', ctx);
    return ctx.pq;
  };
  const pune = CR.cities.Pune, charges = (pq) => [pq.cc.svcVisits, pq.cc.lu, pq.cc.transport];
  let pq = run(' pune ', [{ 'BC-X': 20, 'WC-X': 10, 'LO-X': 4, 'TC-X': 3 }]);   // 34 × 100 + 3 × 250
  assert.equal(pq.cc.shipKg, 4150);
  assert.deepEqual(charges(pq), [4 * pune.siteRate, pune.loading[0], pune.transport[0]]);

  // two rooms: weighed together (3,250 + 3,250 kg → second bracket) and charged ONCE
  const room = { 'BC-X': 30, 'TC-X': 1 }, one = run('Pune', [room]);
  pq = run('Pune', [room, room, null], 40000);                                  // the third room is not generated
  assert.equal(pq.cc.shipKg, 6500);
  assert.deepEqual(charges(pq), [4 * pune.siteRate, pune.loading[1], pune.transport[1]]);
  assert.equal(pq.sub, 2 * one.sub);
  assert.equal(pq.beforeGst, pq.sub + 4 * pune.siteRate + pune.loading[1] + pune.transport[1] - 40000, 'one discount, one set of city charges');
  assert.equal(pq.total, pq.beforeGst + Math.round(pq.beforeGst * 0.18));
  assert.equal(pq.pending, 1);

  assert.deepEqual(charges(run('Pune', [{ 'BC-X': 300 }])), [4 * pune.siteRate, pune.loading[5], pune.transport[5]]);   // past every limit
  assert.deepEqual(charges(run('Atlantis', [room])), [0, 0, 0]);               // unlisted city charges nothing
  assert.deepEqual(charges(run('Pune', [null])), [0, 0, 0]);                   // nothing generated, nothing charged
});

test('multi-size accessories: the chosen size, else the default, prices the line', async () => {
  const { accessoryPrices } = await import('../../vendor/pricingConfig.js');
  const p = accessoryPrices();
  const html = readFileSync('ui/builder.html', 'utf8');
  const ctx = vm.createContext({ S: { accPrices: p, accSizes: {} } });
  vm.runInContext(html.slice(html.indexOf('// Accessory price from the price master'), html.indexOf('// Size picker for the accessories')), ctx);
  const price = (n, w) => vm.runInContext(`accPrice(${JSON.stringify(n)},${w})`, ctx);
  assert.deepEqual(['Kubos', 'Tark System', 'Ceiling Hanging Unit (cloud glass + LED)', 'Double Tray'].map((n) => price(n)), [28000, 32000, 105000, 22000]);
  ctx.S.accSizes = { Kubos: 34, 'Tark System': 37 };
  assert.deepEqual([price('Kubos'), price('Tark System')], [55000, 42000]);
  assert.equal(price('Cutlery Tray Silverstone', 900), 7200, 'width-matched accessories are unchanged');
  assert.equal(p.Pantry[0].price, p['Tandem Pantry'][0].price);
});

test('accessory prices come from the price master by S.No.; unmapped names are absent (₹0)', async () => {
  const { accessoryPrices } = await import('../../vendor/pricingConfig.js');
  const p = accessoryPrices();
  assert.deepEqual(p['Cutlery Tray Silverstone'].map((r) => [r.sn, r.width, r.price]), [[4, 600, 6150], [5, 900, 7200]]);
  assert.equal(p['Onion & Potato Basket (Large)'][0].price, 7480);
  assert.deepEqual(p['Tark System'].map((r) => [r.width, r.price]), [[600, 22000], [900, 32000], [1200, 42000]]);
  assert.deepEqual(p['Ceiling Hanging Unit (cloud glass + LED)'].map((r) => r.width), [1200, 1500, 1800, 2100, 2400]);
  for (const [name, rows] of Object.entries(p)) assert.ok(rows.length && rows.every((r) => r.price > 0), name);
  assert.deepEqual(p['Double Tray'].map((r) => [r.width, r.price]), [[600, 22000], [900, 25000]]);
  assert.equal(p['Bottle Pull-Out – Triple'], undefined);
  // the old sheet no longer carries prices
  const old = JSON.parse(readFileSync('data/accessories-master/accessories-master.json', 'utf8'))['Kitchen Accessories'];
  assert.ok(old.filter((r) => Number(r[0]) > 0).every((r) => r[5] === ''));
});
