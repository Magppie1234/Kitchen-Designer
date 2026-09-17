import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arrangeBlindFronts,blindShutterProblems,blindCornerProblems,layout,geometryProblems,overlapProblems} from '../../engine.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {toPlan} from '../../server.mjs';
import {enumerateModules} from '../../vendor/costEstimate.js';
import {livePlanSvg,liveElevSvg} from '../../vendor/shareApi.js';
import '../../ui/rule-log.js';
const catalog=loadCatalog().ok;
const fixture=()=>{const j=JSON.parse(readFileSync('verification/filler-3600-input.json'));j.anchors.find(a=>a.item==='fridge').at+=10;return j;};

test('a 600mm adjacent front puts the opening at 640mm on either corner leg',()=>{
  for(const end of ['from','to'])for(const gap of [0,40,100,143]){
    const input={walls:[{id:'A',length:4000},{id:'B',length:4000}]};
    const blind={wall:'A',at:end==='from'?0:2850,width:1150,code:'blind',role:'blind corner',corner:{id:'A:B',end,adjacentWall:'B',adjacentEnd:'from'}};
    const filler={wall:'A',at:end==='from'?1150:2850-gap,width:gap,role:'gap filler',trim:true};
    const required={wall:'B',at:560,width:40,role:'corner filler',trim:true};
    const placed={base:[blind,required,{wall:'B',at:600,width:600,depth:600,role:'drawers',code:'ordinary'},...(gap?[filler]:[])],wall:[],tall:[]};
    arrangeBlindFronts(input,placed,[],[]);
    assert.equal(blind.shutter.cornerDistance,640);
    assert.equal(end==='from'?blind.shutter.x0:4000-blind.shutter.x1,640);
    assert.equal(blind.corner.deadSpace,Math.min(100,gap));
    assert.equal(blind.width,1150);assert.equal(required.at,560);assert.equal(required.width,40);
    assert.equal(placed.base.filter(p=>p.hiddenCorner).reduce((n,p)=>n+p.width,0),Math.min(100,gap));
    assert.deepEqual(blindShutterProblems(input,placed,[]),[]);
    blind.shutter.x0+=1;assert.ok(blindShutterProblems(input,placed,[]).length);
  }
});

test('front projection includes offsets and concealed space is capped at 100mm',()=>{
  const input={walls:[{id:'A',length:4000},{id:'B',length:4000}]};
  const blind={wall:'A',at:0,width:1150,role:'blind corner',corner:{id:'A:B',end:'from',adjacentWall:'B',adjacentEnd:'from'}};
  const placed={base:[blind,{wall:'B',at:600,width:600,depth:560,offset:40,code:'ordinary'}],wall:[],tall:[]};
  arrangeBlindFronts(input,placed,[]);assert.equal(blind.shutter.x0,640);
  blind.at=101;assert.match(blindShutterProblems(input,placed,[]).join(),/allowed range is 0-100mm/);
});

test('saved kitchen moves residuals into concealed corners and keeps both tiers synchronized',()=>{
  const input=fixture(),r=layout(input,catalog),plan=toPlan(r,input,[]);
  assert.deepEqual(r.problems,[]);assert.deepEqual(geometryProblems(input,r.placed,catalog),[]);assert.deepEqual(overlapProblems(r.placed),[]);
  assert.deepEqual(blindCornerProblems(input,r.placed),[]);
  const row=r.placed.base.filter(p=>p.wall==='2').sort((a,b)=>a.at-b.at);
  assert.deepEqual(row.filter(p=>p.hiddenCorner).map(p=>p.width),[100,57]);
  assert.deepEqual(row.filter(p=>p.role==='gap filler').map(p=>p.width),[43]);
  assert.equal(row.find(p=>p.role==='sink').at,1193);
  for(const tier of ['base','wall'])for(const p of r.placed[tier].filter(p=>p.corner)){
    assert.ok(p.corner.deadSpace<=100);assert.equal(p.shutter.clearance,40);
    assert.equal(p.shutter.cornerDistance,p.shutter.adjacentFront+40);
    assert.equal(catalog.find(c=>c.code===p.code).width,p.width);
  }
  const output=plan.runs.find(r=>r.key==='W2').segments;
  assert.equal(plan.validationVersion,9);
  assert.ok(output.filter(p=>p.hiddenCorner).every(p=>p.kind==='gap'&&p.code===null));
  assert.ok(output.filter(p=>p.kind==='corner').every(p=>p.shutter&&p.corner));
  assert.ok(!plan.tiers.W2.wall.some(p=>p.label==='concealed corner space'));
  const withSpace=enumerateModules(plan),without=structuredClone(plan);
  without.runs.forEach(r=>r.segments=r.segments.filter(p=>!p.hiddenCorner));
  const noSpace=enumerateModules(without);
  assert.equal(withSpace.specs.length,noSpace.specs.length);
  assert.equal(withSpace.counterMm2-noSpace.counterMm2,157*560);
  assert.ok(!r.notes.some(n=>/143mm filler|57mm filler/.test(n)));
  const explanation=KitchenRuleLog.explain({status:'applied',detail:r.notes.find(n=>/100mm concealed corner/.test(n))});
  assert.equal(explanation.title,'Corner shutters aligned');assert.match(explanation.problem,/concealed and empty/);
});

test('shared drawings show the shutter independently of the cabinet body',()=>{
  const s={kind:'corner',label:'blind corner',width:1150,x0:80,depth:560,shutter:{x0:600,x1:1230,width:630},corner:{deadSpace:80}};
  const state={walls:[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}],plan:{runs:[{key:'W0',total:4000,segments:[{kind:'gap',hiddenCorner:true,x0:0,width:80,depth:560},s]}],tiers:{W0:{wall:[]}}}};
  assert.match(livePlanSvg(state),/data-blind-shutter/);assert.match(liveElevSvg(state),/data-blind-shutter/);
});
