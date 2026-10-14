import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layout,requiredStorageProblems,geometryProblems,fitQuality,gate} from '../../core/engine.mjs';
import {fitKitchen} from '../../core/fitting.mjs';
import {planKitchen} from '../../core/planner.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
import {ZONE_ACCESSORIES} from '../../vendor/accessories.js';
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
  assert.ok(!Object.values(ZONE_ACCESSORIES).flat().some(a=>/dish rack|vegetable|onion|potato/i.test(a.name)));
  const rules=JSON.parse(readFileSync('rules.json','utf8'));
  assert.ok(!rules.rules.some(r=>r.id==='countertop-beside-tall-appliance'));
  assert.ok(!rules.rules.find(r=>r.id==='preferred-models').preferred.some(p=>/dish rack|vegetable basket/.test(p.item)));
});

test('100mm allowance improves an already valid layout and does not accumulate on regeneration',async()=>{
  const j=runEndFixture();j.zones.tall=[{wall:'C',from:0,to:3000}];Object.assign(j.anchors.find(a=>a.item==='fridge'),{wall:'C',at:1160});   // 240mm of closure pieces as drawn; a 20mm slide gets it to 90
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

test('bottle pullouts are capped by base run (1 / 2 / 3) and grain trolleys at 2; extras become plain cabinets, never fillers',async()=>{
  const {storageCaps,capStorage}=await import('../../core/engine.mjs');
  const caps=len=>storageCaps({zones:{base:[{from:0,to:len}]}})['bottle pullout'];
  assert.deepEqual([caps(2999),caps(3000),caps(5000),caps(5001)],[1,2,2,3]);
  const code=(fam,w,spec)=>cat.find(c=>c.zone==='BC'&&c.handle==='CJ'&&c.family===fam&&c.width===w&&(!spec||c.spec.includes(spec))).code;
  const u=(role,at,width,c)=>({wall:'A',at,width,role,code:c});
  const placed={base:[u('hob',0,900,'hob'),u('bottle pullout',900,300,code('AC',300,'BPO')),u('shutter',1200,450,code('SH',450)),
    u('bottle pullout',1650,150,code('AC',150,'BPO')),u('grain trolley',1800,600,code('GD',600)),u('grain trolley',2400,450,code('GD',450)),u('grain trolley',2850,600,code('GD',600))],wall:[],tall:[]};
  capStorage({handle:'CJ',zones:{base:[{wall:'A',from:0,to:2800}]}},placed,cat);   // 2.8 m: one bottle pullout
  const roles=placed.base.map(p=>`${p.role}:${p.width}`);
  assert.deepEqual(roles.filter(r=>r.startsWith('bottle')),['bottle pullout:300'],'the one beside the hob stays');
  assert.ok(roles.includes('shutter:600'),'450 shutter + 150 BPO -> one 600 cabinet');
  assert.ok(!roles.some(r=>r.startsWith('gap filler')),'never leaves a filler');
  assert.equal(placed.base.filter(p=>p.role==='grain trolley').length,2);
});

test('tandem pantry and microwave + oven only go in as a pair; no fridge in front of a column',async()=>{
  const {check}=await import('../../core/checkInput.mjs');
  const j=JSON.parse(readFileSync('verification/alignment-3600.json')).input;
  const r=(await fitKitchen(j,cat,{proposals:false})).result;
  const has=role=>r.placed.tall.some(p=>p.role===role);
  assert.equal(has('tandem pantry'),has('microwave + oven'));
  const f=j.anchors.find(a=>a.item==='fridge');
  const atCol={...j,columns:[{wall:f.wall,at:f.at+100,width:300,depth:300}]};
  assert.ok(check(atCol).some(e=>e.endsWith('(fridge-not-at-column)')));
});
