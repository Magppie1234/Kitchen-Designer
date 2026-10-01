import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {islandRules as r,islandContext,assembleIsland,validateIsland,suggestIslands} from '../../core/island.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {layout,gate} from '../../core/engine.mjs';
import {check} from '../../core/checkInput.mjs';
import {toEngineInput,toPlan} from '../../server.mjs';
import {enumerateModules} from '../../vendor/costEstimate.js';
import {livePlanSvg} from '../../vendor/shareApi.js';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';

const cat=loadCatalog().ok;
const rectangle=(w=6000,h=6000)=>[[[0,0],[w,0]],[[w,0],[w,h]],[[w,h],[0,h]],[[0,h],[0,0]]].map(([a,b],n)=>({id:String(n),a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])}));
const context={ready:true,walls:rectangle(),obstacles:[]};
const island=(extra={})=>({x:3000,y:3000,length:1800,rows:1,rotation:0,seatSides:[],fixtures:[],...extra});
function input(i=island()){
  const base=runEndFixture();base.walls[1].length=6000;base.walls[3].length=6000;
  base.drawnZones=true;base.island=i;return base;
}

test('minimum, rotation and finished seating dimensions use metric rules',()=>{
  assert.equal(IslandRules.check(context,island({length:1200}),r).valid,true);
  assert.equal(IslandRules.check(context,island({length:1199}),r).valid,false);
  const i=island({seatSides:['south']});
  assert.equal(IslandRules.shape(i,r).depth,976);
  assert.equal(IslandRules.shape({...i,rotation:90},r).width,976);
  assert.equal(IslandRules.shape({...i,endPanel:20,backPanel:20},r).length,1840+60);
  assert.equal(IslandRules.shape({...i,backPanel:20},r).depth,976);
});
test('four standard widths keep their purpose and width in both orientations',()=>{
  for(const preset of IslandRules.presets(r)){
    const i=island({...preset});
    assert.equal(IslandRules.shape(i,r).depth,preset.width);
    assert.equal(IslandRules.shape({...i,rotation:90},r).width,preset.width);
    assert.equal(IslandRules.check(context,i,r,{services:false}).valid,true);
  }
  assert.deepEqual(IslandRules.presets(r).map(p=>p.width),[600,900,976,1200]);
  const offered=suggestIslands(input(),cat);
  assert.deepEqual(IslandRules.recommendations(offered.options,r).map(c=>IslandRules.shape(c.option,r).depth),[600,900,976,1200]);
});
test('stool centres stay on the countertop edge, half underneath, in every orientation',()=>{
  for(const preset of IslandRules.presets(r))for(const rotation of [0,90,180,270]){
    const i=island({...preset,rotation}),b=IslandRules.shape(i,r),seats=IslandRules.stools(i,r);
    for(const seat of seats){
      const [x,y]=IslandRules.point(i,r,seat.x,seat.y);
      const overlapX=Math.max(0,Math.min(x+160,b.x1)-Math.max(x-160,b.x0));
      const overlapY=Math.max(0,Math.min(y+160,b.y1)-Math.max(y-160,b.y0));
      assert.equal(Math.round(overlapX*overlapY),320*320/2);
    }
    const svg=IslandRules.svg(i,r,{sc:.1,X:x=>x/10,Y:y=>y/10});
    if(seats.length)assert.ok(svg.indexOf('data-island-stool=')<svg.indexOf('data-island-countertop='),'opaque countertop covers the tucked-in half');
  }
});
test('900 mm seating-only island has no cabinet BOM or storage charge, and prices its full tabletop',()=>{
  const j=input(island({rows:0,length:2377,seatSides:['north','south'],support:{confirmed:true,material:'Verified tabletop',approvedOverhang:376}}));
  assert.deepEqual(check(j),[]);
  const result=layout(j,cat);assert.deepEqual(result.island.problems,[]);assert.deepEqual(result.island.working,[]);
  assert.equal(result.island.depth,900);assert.equal(result.island.total,2377+60);
  const plan=toPlan(result,j,cat,{}),withTable=enumerateModules(plan),without=enumerateModules({...plan,island:null});
  assert.equal(withTable.specs.length,without.specs.length);
  assert.equal(withTable.counterMm2-without.counterMm2,(2377+60)*900);
  assert.deepEqual(IslandRules.shape(j.island,r).working,[]);
  j.island.fixtures=[{type:'sink',row:0,at:0,width:900}];assert.ok(check(j).some(p=>p.includes('invalid fixture')));
});
test('custom lengths are room-limited rather than restricted to presets or the former 50000 mm limit',()=>{
  const j=input(island({x:40000,length:60017}));j.walls[0].length=80000;j.walls[2].length=80000;
  const built=validateIsland(j,cat);assert.deepEqual(built.problems,[]);
  assert.equal(built.working.reduce((n,m)=>n+m.width,0),60017);assert.equal(built.total,60017+60);
  assert.ok(built.working.some(m=>m.kind==='filler'&&m.width===17&&!m.code));
  const choices=suggestIslands(j,cat,j.island);assert.ok(choices.options.some(o=>o.length===60017));
  assert.ok(IslandRules.recommendations(choices.options,r,0,60017).every(o=>o.option.length===60017));
});
test('600 cabinets require 1050 clear and a 1650 wall offset; bare walls do not assume cabinets',()=>{
  const c={...context,obstacles:[{x0:0,x1:6000,y0:0,y1:600,clearance:1050,label:'cabinets'}]};
  const i=island({y:1950});
  assert.equal(IslandRules.check(c,i,r).valid,true);
  assert.equal(IslandRules.check(c,i,r).clearances.north.actual,1050);
  assert.equal(IslandRules.check(c,{...i,y:1949},r).valid,false);
  assert.equal(IslandRules.check(context,island({y:1350}),r).valid,true);
  assert.equal(IslandRules.check(context,island({y:1349}),r).valid,false,'island storage fronts still need a working aisle at an empty wall');
  assert.equal(IslandRules.check(context,island({y:4750}),r).valid,true,'an unseated back uses the walking-only clearance');
});
test('seating has 1150 clearance, 650 usable width, corners and support exclusions',()=>{
  const i=island({length:1800,seatSides:['south'],y:6000-1150-976/2});
  let v=IslandRules.check(context,i,r);assert.equal(v.valid,true);assert.equal(v.seats.south,2);
  assert.equal(v.clearances.south.required,1150);assert.equal(v.unresolved.length,1);
  assert.equal(IslandRules.check(context,{...i,y:i.y+1},r).valid,false);
  assert.equal(IslandRules.seatCounts({...i,seatObstructions:{south:600}},r).south,1);
  assert.equal(IslandRules.seatCounts({...i,seatSides:['south','east']},r).south,2);
  assert.equal(IslandRules.check(context,{...i,support:{confirmed:true,material:'Verified slab',approvedOverhang:376}},r).unresolved.length,0);
  assert.equal(IslandRules.check(context,island({rows:2,seatSides:['south']}),r).valid,false);
});
test('real polygon, door swing, opening projections and final cabinets are checked',()=>{
  const points=[[0,0],[6000,0],[6000,6000],[3100,6000],[3100,2500],[2900,2500],[2900,6000],[0,6000]];
  const walls=points.map((a,n)=>({a,b:points[(n+1)%points.length]}));
  assert.equal(IslandRules.check({...context,walls},island(),r).valid,false);
  const c={...context,obstacles:[{x0:2500,x1:3500,y0:0,y1:2800,clearance:0,label:'door swing'}]};
  assert.equal(IslandRules.check(c,island(),r).valid,false);
  const opening={x0:0,x1:6000,y0:0,y1:600,clearance:1050,label:'deep open appliance',openBox:{x0:0,x1:6000,y0:0,y1:2000}};
  assert.match(IslandRules.check({...context,obstacles:[opening]},island({y:1950}),r).problems.join(' '),/opening space/);
  const j=input(island({y:1950}));
  assert.equal(validateIsland(j,cat).problems.length,0);
  assert.ok(validateIsland(j,cat,{base:[{wall:'A',at:2000,width:2000,depth:800}],tall:[]}).problems.length);
});
test('module packing uses catalogue codes and closes custom lengths with panels',()=>{
  const b=assembleIsland(input(island({rows:2})),cat);
  assert.deepEqual(b.problems,[]);assert.equal(b.working.reduce((n,m)=>n+m.width,0),3600);
  assert.ok(b.working.every(m=>cat.some(c=>c.code===m.code)));
  const custom=assembleIsland(input(island({length:1217})),cat);assert.deepEqual(custom.problems,[]);assert.equal(custom.working.reduce((n,m)=>n+m.width,0),1217);assert.ok(custom.working.some(m=>m.kind==='filler'&&m.width===17));
});
test('independent adjacent island sinks are assembled and service checks block release until verified',()=>{
  const i=island({length:1500,fixtures:[{type:'sink',row:0,at:0,width:900},{type:'veggie',row:0,at:900,width:600}]});
  const j=input(i);j.anchors=j.anchors.filter(a=>a.item!=='sink');
  for(const f of i.fixtures)j.anchors.push({item:f.type,location:'island',wall:'island-0',at:f.at,width:f.width});
  assert.deepEqual(check(j),[]);
  const v=validateIsland(j,cat);assert.deepEqual(v.problems,[]);
  assert.equal(v.working.filter(m=>['sink','veggie sink'].includes(m.label)).length,2);
  assert.equal(gate(v).verdict,'UNRESOLVED');
  i.plumbingConfirmed=true;i.prepConfirmed=true;
  assert.equal(gate(validateIsland(j,cat)).verdict,'FEASIBLE');
});
test('island hob preserves pictured shapes, separation and required storage',()=>{
  const i=island({length:3000,rows:2,fixtures:[{type:'hob',row:0,at:900,width:900}]});
  const j=input(i),a=j.anchors.find(a=>a.item==='hob');Object.assign(a,{location:'island',wall:'island-0',at:900,design:'2LB+1HB',flanks:{left:'DW:2HB',right:'GD:1BL+1HF'}});
  const b=assembleIsland(j,cat);assert.deepEqual(b.problems,[]);
  assert.ok(b.working.some(m=>m.label==='bottle pullout'));
  assert.ok(b.working.some(m=>m.label==='grain trolley'));
  assert.equal(cat.find(c=>c.code===b.working.find(m=>m.label==='hob').code).spec.join('+'),'2LB+1HB');
  i.fixtures.push({type:'veggie',row:0,at:1800,width:600});
  j.anchors.push({item:'veggie',location:'island',wall:'island-0',at:1800,width:600});
  assert.match(assembleIsland(j,cat).problems.join(' '),/350 mm separation/);
});
test('suggestions depend on cabinet zones and preserve selected invalid dimensions and position',()=>{
  const j=input(island({x:500,y:700,length:1217}));const before=structuredClone(j);
  const s=suggestIslands(j,cat,j.island);assert.ok(s.options.length>1);
  assert.equal(s.selected.x,500);assert.equal(s.selected.length,1217);assert.ok(s.selected.problems.length);
  assert.ok(s.options.some(o=>o.rotation===90));assert.deepEqual(j,before);
  j.drawnZones=false;assert.equal(suggestIslands(j,cat).options.length,0);
});
test('island hob chooses a packable pullout and can keep the grain trolley on a wall',()=>{
  const j=input(island({length:3000,rows:2,fixtures:[{type:'hob',row:0,at:900,width:900}],hobInstallation:{confirmed:true,left:300,right:300,rear:100,cutoutDepth:450,extraction:'Ceiling extraction verified'}}));
  Object.assign(j.anchors.find(a=>a.item==='hob'),{location:'island',wall:'island-0',at:900});
  const preview=validateIsland(j,cat);assert.deepEqual(preview.problems,[]);
  assert.ok(preview.working.some(m=>m.role==='bottle pullout'));
  assert.equal(preview.working.filter(m=>m.row===0).reduce((n,m)=>n+m.width,0),3000);
  const solved=layout(j,cat);assert.deepEqual(solved.problems,[]);assert.deepEqual(solved.unresolved,[]);
  assert.ok(solved.placed.base.some(m=>m.role==='grain trolley'));
  assert.equal(solved.island.x,j.island.x);assert.equal(solved.island.length,3000);
});
test('engine, plan, BOM, countertop pricing and shared SVG retain the selected island',()=>{
  const j=input(island({x:4500,seatSides:['south'],support:{confirmed:true,material:'Verified',approvedOverhang:376}}));
  const result=layout(j,cat);assert.deepEqual(result.island.problems,[]);
  const plan=toPlan(result,j,cat,{});
  assert.equal(plan.island.x,4500);assert.equal(plan.island.depth,976);
  for(const m of result.island.working)assert.ok(plan.bom[m.code]);
  const withIsland=enumerateModules(plan),without=enumerateModules({...plan,island:null});
  assert.equal(withIsland.counterMm2-without.counterMm2,(1800+60)*976);
  assert.equal(withIsland.specs.length-without.specs.length,result.island.working.length);
  const svg=livePlanSvg({plan,walls:rectangle(11970,6000)});
  assert.match(svg,/1860.*976 mm/);assert.doesNotMatch(svg,/NaN/);
});
test('UI coordinates translate once across nonzero room origins and malformed fixtures return validation',()=>{
  const walls=rectangle().map(w=>({...w,a:w.a.map(n=>n+1000),b:w.b.map(n=>n+1000)}));
  const a=[{type:'hob',wall:'W0',off:1200,width:900},{type:'sink',wall:'W0',off:3500,width:900},{type:'fridge',wall:'W1',off:1200,width:700}];
  const {input:j}=toEngineInput(a,{walls,zones:[{tier:'base',wall:'W0',s:0,e:6000}],island:true,islandConfig:island({fixtures:[{type:'sink',row:0,at:0,width:900}]})});
  assert.equal(j.island.x,2000);assert.equal(j.anchors.find(a=>a.item==='sink').location,'island');
  j.island.fixtures=[null];assert.ok(check(j).some(s=>s.includes('invalid fixture')));
  assert.equal(validateIsland(j,cat).valid,false);
});
test('browser island script parses; rulebook has 26 island rules and no electrical supply rule',()=>{
  new vm.Script(readFileSync('ui/island-ui.js','utf8'));
  const rules=JSON.parse(readFileSync('rules.json','utf8')).rules.filter(r=>r.id.startsWith('island-'));
  assert.equal(rules.length,26);assert.ok(rules.every(r=>!/electric/i.test(r.statement)));
});
test('placement guide certifies shaded cells against aisles, seating, concave walls and doors',()=>{
  const pts=[[0,0],[8000,0],[8000,4000],[4000,4000],[4000,8000],[0,8000]];
  const c={ready:true,walls:pts.map((a,n)=>({a,b:pts[(n+1)%pts.length]})),obstacles:[
    {x0:0,x1:8000,y0:0,y1:600,clearance:1050,label:'wall cabinets'},
    {x0:0,x1:1200,y0:4000,y1:5000,clearance:0,label:'door swing'}]};
  const i=island({length:1200,x:2000,y:2300,seatSides:['south']}),area=IslandRules.placementArea(c,i,r);
  assert.ok(area.cells.length);
  for(const cell of area.cells)for(const x of [cell.x0,(cell.x0+cell.x1)/2,cell.x1])for(const y of [cell.y0,(cell.y0+cell.y1)/2,cell.y1])
    assert.equal(IslandRules.check(c,{...i,x,y},r,{services:false}).valid,true,`guide must not offer an invalid centre at ${x},${y}`);
});
test('exact-fit placement remains marked even when there is no room for a shaded cell',()=>{
  const c={ready:true,walls:rectangle(3160,2600),obstacles:[]},i=island({length:1200,x:1580,y:1350});
  const area=IslandRules.placementArea(c,i,r);assert.equal(area.cells.length,0);assert.ok(area.points.some(p=>p.x===1580&&p.y===1350));
  const turned=IslandRules.placementArea(c,{...i,rotation:180},r);
  assert.ok(turned.points.some(p=>p.x===1580&&p.y===1250),'show the legal point for an invalid, reversed island too');
});
test('drag clamps at cabinet and seating boundaries and never produces an invalid saved point',()=>{
  const c={...context,obstacles:[{x0:0,x1:6000,y0:0,y1:600,clearance:1050,label:'cabinets'}]},i=island({seatSides:['south']});
  const north=IslandRules.moveWithin(c,i,r,{x:3000,y:-3000});assert.equal(north.blocked,true);assert.equal(north.position.y,2138);
  const south=IslandRules.moveWithin(c,i,r,{x:3000,y:9000});assert.equal(south.position.y,4362);
  for(const target of [{x:-2000,y:-2000},{x:9000,y:9000},{x:2900,y:2800}]){
    const moved=IslandRules.moveWithin(c,i,r,target);assert.equal(IslandRules.check(c,moved.position,r,{services:false}).valid,true);
  }
});
