import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layout,geometryProblems,gate,fill} from '../../engine.mjs';
import {check} from '../../checkInput.mjs';
import {toEngineInput,toPlan} from '../../server.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {enumerateModules} from '../../vendor/costEstimate.js';
import {bomOf} from '../../vendor/libraryApi.js';
import {priceSaleable} from '../../vendor/saleablePricing.js';
import {livePlanSvg,liveElevSvg} from '../../vendor/shareApi.js';
import {fixtures,uiRequest,measuredVolumes,collisions} from '../../verification/fixtures.mjs';
const cat=loadCatalog().ok;

for(const [name,j] of Object.entries(fixtures()))test('full pipeline: '+name,()=>{
  const req=uiRequest(j),{input,notes}=toEngineInput(req.anchors,req.options),result=layout(input,cat),plan=toPlan(result,input,notes,req.options);
  if(['p5','p6'].includes(name)){
    assert.equal(plan.verdict,'REJECTED');assert.ok(result.problems.some(p=>/corner|physical overlap/.test(p)));return;
  }
  const missingUpper=['u','seven','concave','reflected'].includes(name);
  if(missingUpper) {
    assert.equal(result.problems.length,1);
    assert.match(result.problems[0],/matching wall blind cabinet is missing/);
  } else assert.deepEqual(result.problems,[]);
  assert.deepEqual(collisions(measuredVolumes(input,result.placed)),[],'independent world volumes cannot intersect');
  assert.equal(plan.verdict,missingUpper?'REJECTED':'FEASIBLE','missing upper blind cabinets block release; cancelled accessories do not');
  const hob=result.placed.base.find(p=>p.role==='hob'),asked=input.anchors.find(a=>a.item==='hob');
  assert.ok(Math.abs(hob.at+hob.width/2-asked.center)<=100,'width selection must preserve centre within reported tolerance');
  const expected=Object.values(result.placed).flat().filter(p=>p.code&&!p.blocker);
  const {specs}=enumerateModules(plan);
  for(const p of expected)assert.ok(specs.some(s=>s.W===p.width&&s.H===p.height&&s.D===p.depth),'pricing lost dimensions '+p.code);
  assert.deepEqual(bomOf(plan),plan.bom,'reprice must preserve all tall SKUs');
  assert.equal(priceSaleable(plan,req.options).breakdown.total,plan.price.breakdown.total);
  for(const r of plan.runs){let cursor=0;for(const s of r.segments){assert.equal(s.x0,cursor);assert.equal(s.x1,s.x0+s.width);cursor=s.x1;}assert.equal(cursor,r.total);}
  if(name==='seven'){assert.equal(plan.geometry.wallTop,2140);assert.ok(specs.filter(s=>s.kind==='wall').every(s=>s.H===725));assert.ok(specs.filter(s=>s.kind==='tall').every(s=>s.H===2040));}
});
test('default fixture: physical return reservations and bounded repair',()=>{
  const j=JSON.parse(readFileSync('data/default-kitchen.json')),r=layout(j,cat);
  assert.equal(gate(r).verdict,'REJECTED','gap fillers do not waive missing synchronized upper cabinets');
  assert.ok(r.problems.some(p=>/matching wall blind cabinet is missing/.test(p)));
  assert.ok(!r.problems.some(p=>/tall visible panel/.test(p)));
  assert.deepEqual(collisions(measuredVolumes(j,r.placed)),[]);
  assert.ok(r.notes.some(n=>/hob moved -100mm/.test(n)));
  assert.ok(r.placed.base.some(p=>p.role==='corner void'&&p.width===560));
  assert.ok(r.placed.wall.some(p=>p.role==='corner void'&&p.width===336));
  const req=uiRequest(j),adapt=toEngineInput(req.anchors,req.options).input,ui=layout(adapt,cat);
  assert.equal(gate(ui).verdict,'REJECTED','a 225mm UI centre change cannot be hidden as width selection');
});
test('physical backstop catches perpendicular, opposite and cross-tier collisions',()=>{
  const j=fixtures().u;
  const placed={base:[{wall:'AA',at:4000,width:275,role:'one'},{wall:'BB',at:0,width:600,role:'two'}],wall:[],tall:[]};
  assert.ok(geometryProblems(j,placed,cat).some(p=>/physical overlap/.test(p)));
  const q={base:[{wall:'AA',at:500,width:600,role:'base'}],wall:[],tall:[{wall:'AA',at:500,width:600,role:'tower'}]};
  assert.ok(geometryProblems(j,q,cat).some(p=>/physical overlap/.test(p)));
});
test('column boxes survive adapter; low-depth cabinets keep their front at 560mm',()=>{
  const req=uiRequest(fixtures().straight);req.options.structures=[{type:'column',x:400,y:112,w:600,d:224}];
  const {input}=toEngineInput(req.anchors,req.options);
  assert.deepEqual(input.columns,[{wall:'0',at:100,width:600,depth:224}]);
  assert.equal(input.structures[0].x0,100);
  const low=cat.find(c=>c.group==='base'&&c.depth===336&&c.width===600&&c.handle==='CJ');assert.ok(low);
  const p={wall:'0',at:100,width:600,code:low.code,role:'low cabinet'};
  assert.deepEqual(geometryProblems(input,{base:[p],wall:[],tall:[]},cat),[]);
  assert.equal(p.depth+p.offset,560);
  assert.ok(geometryProblems(input,{base:[{...p,code:null,depth:560}],wall:[],tall:[]},cat).some(p=>/column/.test(p)));
});
test('window sill, sink width and EH handle survive input; low window obstructs counter',()=>{
  const req=uiRequest(fixtures().u);req.options.handles={base:'EH'};
  const sink=req.anchors.find(a=>a.type==='sink');sink.width=600;
  req.options.openings.find(o=>o.type==='window').sill=500;
  const {input}=toEngineInput(req.anchors,req.options);
  assert.equal(input.handle,'TTS');assert.equal(input.anchors.find(a=>a.item==='sink').width,600);
  assert.equal(input.openings.find(o=>o.type==='window').sill,500);
  assert.ok(layout(input,cat).problems.some(p=>/window|sink/.test(p)));
  const p={wall:'0',at:1125,width:600,role:'sink'};
  assert.ok(geometryProblems(input,{base:[p],wall:[],tall:[]},cat).some(p=>/obstructs a window/.test(p)));
});
test('malformed, disconnected, diagonal and fractional inputs are rejected before solving',()=>{
  for(const mutate of [j=>j.walls[0].length+=1,j=>j.anchors=null,j=>j.anchors[0].at=0.5,j=>j.zones.base='bad',j=>j.height='9ft']){
    const j=fixtures().u;mutate(j);assert.ok(check(j).length);assert.deepEqual(layout(j,cat).placed,{base:[],wall:[],tall:[]});
  }
  const req=uiRequest(fixtures().u);req.options.walls[0].b[1]=300;
  assert.ok(check(toEngineInput(req.anchors,req.options).input).some(p=>/direction|disconnected/.test(p)));
  assert.ok(fill(500.5,[450]).error);
});
test('concave normals and notch containment use polygon winding',()=>{
  const ws=uiRequest(fixtures().concave).options.walls;
  assert.deepEqual(KitchenGeometry.normal(ws[4],ws).map(n=>n||0),[0,-1]);
  assert.equal(KitchenGeometry.containsRect({x0:100,x1:2500,y0:1400,y1:2000},ws),false);
  assert.equal(KitchenGeometry.containsRect({x0:2000,x1:2600,y0:1600,y1:2200},ws),true);
});
test('share view leaves gaps empty and prices real depths/heights',()=>{
  const walls=uiRequest(fixtures().u).options.walls;
  const plan={runs:[{key:'W0',total:4275,segments:[{kind:'gap',width:3675,x0:0},{kind:'cabinet',width:600,x0:3675,height:720,depth:336}]}],tiers:{}};
  assert.equal((livePlanSvg({walls,plan}).match(/<polygon/g)||[]).length,2,'only room and real cabinet');
  assert.equal((liveElevSvg({walls,plan}).match(/<rect/g)||[]).length,1);
  const m=enumerateModules(plan);assert.equal(m.counterMm2,600*336);assert.equal(m.specs[0].D,336);
});
