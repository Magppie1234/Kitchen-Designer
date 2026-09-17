import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitKitchen} from '../../fitting.mjs';
import {layout,geometryProblems,reserveTallReturns,wallBaseEndProblems,blindCornerProblems,gate} from '../../engine.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {toPlan} from '../../server.mjs';
const cat=loadCatalog().ok;
const fixture=()=>JSON.parse(readFileSync('verification/alignment-3600.json')).input;

test('3600 room is rechecked under synchronized corners without changing original input',async()=>{
  const j=fixture(),before=JSON.stringify(j),r=await fitKitchen(j,cat);
  assert.equal(JSON.stringify(j),before);assert.equal(r.proposal,null);
  assert.equal(gate(r.result).verdict,'FEASIBLE');
  assert.ok(!blindCornerProblems(j,r.result.placed).some(p=>/but wall blind cabinet is on/.test(p)));
  const plan=toPlan(r.result,j,[]);assert.equal(plan.validationVersion,9);
  const disabled=await fitKitchen(j,cat,{proposals:false});assert.equal(disabled.proposal,null);
});

test('tall footprint reserves neighbouring zones but not a distant wall or twice on repeated passes',()=>{
  const j=fixture(),placed={base:[],wall:[],tall:[{wall:'3',at:3000,width:600,role:'refrigerator',code:cat.find(c=>c.family==='REF'&&c.height===2400).code}]};
  assert.deepEqual(reserveTallReturns(j,placed,cat),[]);
  assert.deepEqual(placed.tall.filter(p=>p.crossTall).map(p=>[p.wall,p.at,p.width]),[['0',0,330]]);
  assert.deepEqual(reserveTallReturns(j,placed,cat),[]);assert.equal(placed.tall.filter(p=>p.crossTall).length,1);
  j.zones.base.push({wall:'0',from:0,to:330});j.zones.wall.push({wall:'0',from:0,to:330});
  reserveTallReturns(j,placed,cat);
  const plan=toPlan({placed,problems:[],notes:[],warnings:[],unresolved:[]},j,[]);
  assert.ok(plan.runs.find(r=>r.key==='W0').segments.every(s=>s.kind==='gap'));
  assert.equal(plan.tiers.W0.wall.length,0,'reservations must not render as invented cabinets');
  placed.tall.find(p=>p.code).at=2000;reserveTallReturns(j,placed,cat);assert.equal(placed.tall.filter(p=>p.crossTall).length,0);
});

test('shared endpoint validator catches a shortened base beneath a complete wall run',()=>{
  const input={zones:{base:[{wall:'a',from:0,to:1280}],wall:[{wall:'a',from:0,to:1280}],tall:[]}};
  const placed={base:[{wall:'a',at:0,width:1150}],wall:[{wall:'a',at:0,width:1280}],tall:[]};
  assert.match(wallBaseEndProblems(input,placed).join(),/base run is unfinished/);
  placed.base[0].width=1280;assert.deepEqual(wallBaseEndProblems(input,placed),[]);
});
