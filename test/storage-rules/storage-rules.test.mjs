import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layout,requiredStorageProblems,geometryProblems,fitQuality,gate} from '../../engine.mjs';
import {fitKitchen} from '../../fitting.mjs';
import {planKitchen} from '../../planner.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
import {accessoriesFor} from '../../vendor/accessories.js';
import {toPlan} from '../../server.mjs';
const cat=loadCatalog().ok;
const cabinet=(role,at,width,wall='A')=>({role,at,width,wall,code:'test'});

test('grain trolley is required anywhere; bottle pullout may sit outside a hob flank',()=>{
  const base=[cabinet('hob',2000,900),cabinet('drawers',1400,600),cabinet('drawers',2900,600),
    cabinet('bottle pullout',3500,300),cabinet('grain trolley',1000,600,'B')];
  assert.deepEqual(requiredStorageProblems({base}),[]);
  base[4].wall='A';base[4].at=6500;assert.deepEqual(requiredStorageProblems({base}),[]);
  base[3].at=1100;assert.deepEqual(requiredStorageProblems({base}),[]);
  base[3].at=800;assert.match(requiredStorageProblems({base}).join(),/flanking cabinets/);
  base[3].at=1100;base.pop();assert.match(requiredStorageProblems({base}).join(),/at least one grain trolley/);
  base.splice(3,1);assert.match(requiredStorageProblems({base}).join(),/at least one bottle pullout/);
});

test('named hob flanks remain intact while required storage is fitted beyond them',()=>{
  const j=runEndFixture();j.anchors.find(a=>a.item==='hob').flanks={left:'DW:2LB+1HB',right:'DW:2LB+1HB'};
  const r=layout(j,cat),hob=r.placed.base.find(p=>p.role==='hob');
  assert.deepEqual(r.problems,[]);assert.deepEqual(requiredStorageProblems(r.placed),[]);
  const flanks=r.placed.base.filter(p=>p.designerChoice);
  assert.equal(flanks.length,2);for(const p of flanks)assert.match(p.code,/-2LB-1HB-/);
  const bottle=r.placed.base.find(p=>p.role==='bottle pullout'&&flanks.some(f=>p.at+p.width===f.at||p.at===f.at+f.width));
  assert.ok(bottle);assert.notEqual(bottle.at+ bottle.width,hob.at);assert.notEqual(bottle.at,hob.at+hob.width);
  assert.ok(r.placed.base.some(p=>p.role==='grain trolley'));
  assert.deepEqual(geometryProblems(j,r.placed,cat),[]);
  for(const family of ['GD','BPO']){
    const missing=layout(j,cat.filter(c=>family==='GD'?c.family!=='GD':!c.spec.includes('BPO')));
    assert.equal(gate(missing).verdict,'REJECTED');
    assert.match(missing.problems.join(),family==='GD'?/grain trolley/:/bottle pullout/);
  }
});

test('cancelled accessories do not appear automatically or block a valid design',()=>{
  const j=runEndFixture(),r=layout(j,cat),plan=toPlan(r,j,[]);
  assert.deepEqual(r.unresolved,[]);assert.equal(plan.verdict,'FEASIBLE');assert.equal(plan.releaseBlocked,false);
  assert.ok(!accessoriesFor(['cooking','washing','island']).some(a=>/dish rack|vegetable|onion|potato/i.test(a.name)));
  const rules=JSON.parse(readFileSync('rules.json','utf8'));
  assert.ok(!rules.rules.some(r=>r.id==='countertop-beside-tall-appliance'));
  assert.ok(!rules.rules.find(r=>r.id==='preferred-models').preferred.some(p=>/dish rack|vegetable basket/.test(p.item)));
});

test('100mm allowance improves an already valid layout and does not accumulate on regeneration',async()=>{
  const j=runEndFixture();j.zones.tall=[{wall:'C',from:0,to:3000}];Object.assign(j.anchors.find(a=>a.item==='fridge'),{wall:'C',at:1150});
  const saved=JSON.stringify(j),before=await planKitchen(j,cat),fitted=await fitKitchen(j,cat,{proposals:false});
  assert.deepEqual(before.problems,[]);assert.deepEqual(fitted.result.problems,[]);
  assert.ok(fitQuality(fitted.result)[4]<fitQuality(before)[4],'fewer millimetres of avoidable closure pieces');
  assert.ok(fitted.adjustments.length);assert.equal(fitted.proposal,null,'authorized anchor moves need no zone proposal');
  assert.equal(JSON.stringify(j),saved);
  assert.deepEqual(fitted.input.zones,j.zones);assert.deepEqual(fitted.input.openings,j.openings);
  for(const [i,a] of fitted.input.anchors.entries()){
    assert.equal(a.wall,j.anchors[i].wall);assert.equal(a.width,j.anchors[i].width);
    assert.ok(Math.abs(a.at-j.anchors[i].at)<=100);
  }
  assert.deepEqual(geometryProblems(fitted.input,fitted.result.placed,cat),[]);
  const again=await fitKitchen(j,cat,{proposals:false});assert.deepEqual(again.input.anchors,fitted.input.anchors);
});
