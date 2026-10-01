import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {check} from '../../core/checkInput.mjs';
import {layout,geometryProblems} from '../../core/engine.mjs';
import {toEngineInput,toPlan} from '../../server.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';

const cat=loadCatalog().ok;
const html=readFileSync('ui/builder.html','utf8').replace(/\r\n/g,'\n');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const plain=x=>JSON.parse(JSON.stringify(x));
function editor(){
  const S={walls:[{length:6000},{length:6000}],openings:[],anchors:[],suggested:[],sink:{veggie:false},fridge:{width:600},hob:{size:900},options:{},steps:{}};
  const c=vm.createContext({S,FX_DOOR_CLEAR:400,FX_WIN_MARGIN:100,FRIDGE_PICKS:[],isOpenWall:()=>false,sinkWidth:()=>900});
  for(const n of ['markInProcess','syncSinkStep','renderStepModal','renderEditorLeft','renderPos'])c[n]=()=>{};
  c.showToast=m=>c.message=m;
  vm.runInContext(between('function suggestedOff(', 'function offOnWall('),c);
  vm.runInContext(between('function fridgeWidth(', '// nearest wall (screen space)'),c);
  vm.runInContext(between('function ensureVeggieAnchor(', 'function setDoubleSize('),c);
  vm.runInContext(between('function syncFridgeStep(', 'function renderFridgeWizard('),c);
  return c;
}

test('veggie can be added before the main sink and has an independent persistent anchor',()=>{
  const c=editor();c.toggleVeggie();
  assert.equal(c.S.sink.veggie,true);assert.equal(c.S.anchors.length,1);
  const veggie=c.S.anchors[0];assert.equal(veggie.type,'veggie');
  veggie.wall='W1';veggie.off=2400;
  c.ensureAnchor('sink','A');c.ensureVeggieAnchor();
  assert.equal(veggie.wall,'W1');assert.equal(veggie.off,2400);
  const main=plain(c.S.anchors.find(a=>a.type==='sink'));
  c.toggleVeggie();assert.equal(c.S.sink.veggie,false);
  assert.deepEqual(plain(c.S.anchors),[main]);
});

test('both sinks allow touching or distant positions and windows but reject door and fixture overlaps',()=>{
  const c=editor();c.S.anchors=[{type:'sink',wall:'W0',off:1500,elevation:'A'}];
  assert.equal(c.fxDropValid('veggie',0,2250,600),true);
  assert.equal(c.fxDropValid('veggie',1,4500,600),true);
  assert.equal(c.fxDropValid('veggie',0,1500,600),false);
  c.S.openings=[{type:'window',wall:'W1',off:2000,width:1000,sill:950}];
  for(const type of ['sink','veggie'])assert.equal(c.fxDropValid(type,1,2000,600),true);
  c.S.openings[0].type='door';
  for(const type of ['sink','veggie'])assert.equal(c.fxDropValid(type,1,2000,600),false);
});

test('adding veggie with no legal space does not silently create an invalid fixture',()=>{
  const c=editor();c.S.walls=[{length:1000}];c.S.openings=[{type:'door',wall:'W0',off:500,width:900}];
  c.toggleVeggie();assert.equal(c.S.sink.veggie,false);assert.equal(c.S.anchors.length,0);assert.match(c.message,/No clear 600 mm space/);
});

for(const at of [2000,7000])test(`generation keeps both sinks at independent positions, veggie at ${at}mm`,()=>{
  const j=runEndFixture();j.anchors.push({item:'veggie',wall:'A',at,width:600});
  assert.deepEqual(check(j),[]);
  const r=layout(j,cat);assert.deepEqual(r.problems,[]);
  assert.equal(r.placed.base.find(p=>p.role==='sink').at,1100);
  const veggie=r.placed.base.find(p=>p.role==='veggie sink');assert.equal(veggie.at,at);assert.equal(veggie.width,600);
  const plan=toPlan(r,j,[],{}),seg=plan.runs.flatMap(r=>r.segments).find(s=>s.veggie);
  assert.equal(seg.kind,'anchor');assert.equal(seg.label,'veggie sink');assert.equal(seg.x0,at);
  assert.ok(plan.bom[veggie.code]);
});

test('engine accepts veggie on another wall and rejects either sink across a doorway',()=>{
  const j=runEndFixture();j.zones.base.push({wall:'C',from:0,to:11970});
  j.anchors.push({item:'veggie',wall:'C',at:5000,width:600});
  assert.deepEqual(check(j),[]);
  const r=layout(j,cat);assert.deepEqual(r.problems,[]);
  assert.equal(r.placed.base.find(p=>p.role==='veggie sink').wall,'C');
  for(const item of ['sink','veggie']){
    const a=j.anchors.find(a=>a.item===item);j.openings=[{type:'door',wall:a.wall,at:a.at,width:600}];
    assert.ok(check(j).some(e=>e.includes(`${item} is in front of a door`)));
    assert.ok(geometryProblems(j,r.placed,cat).some(e=>e.includes('obstructs a door')));
  }
});

test('API carries optional veggie placement and rejects a selected but unplaced veggie sink',()=>{
  const {input}=toEngineInput([{type:'veggie',wall:'W1',off:1800}],{veggieSink:true});
  assert.deepEqual(input.anchors.find(a=>a.item==='veggie'),{item:'veggie',wall:'1',at:1500,width:600});
  assert.ok(!input.inputProblems.some(p=>p.includes('veggie')));
  assert.ok(toEngineInput([],{veggieSink:true}).input.inputProblems.some(p=>p.includes('veggie sink')));
});

test('fridge width editor reserves 50mm per side and rejects an opening that cannot fit',()=>{
  const c=editor();c.setFridgeWidth('900');
  assert.equal(c.S.fridge.width,900);assert.equal(c.S.options.fridgeWidth,900);
  assert.equal(c.fxWidthMm(c.S.anchors[0]),1000);
  const at=c.S.anchors[0].off;c.setFridgeWidth('7000');
  assert.equal(c.S.fridge.width,900);assert.equal(c.S.anchors[0].off,at);
  c.setFridgeWidth('-1');assert.equal(c.S.fridge.width,900);
});

test('900mm fridge reserves a 1000mm opening throughout layout and rendering data',()=>{
  const mapped=toEngineInput([{type:'fridge',wall:'W0',off:10120,width:1000}],{fridgeWidth:900}).input.anchors[0];
  assert.equal(mapped.at,9620);assert.equal(mapped.width,1000);assert.equal(mapped.applianceWidth,900);
  const j=runEndFixture();Object.assign(j.anchors.find(a=>a.item==='fridge'),{width:1000,applianceWidth:900});
  j.walls[0].length+=400;j.walls[2].length+=400;j.zones.tall[0].to+=400;
  assert.deepEqual(check(j),[]);
  const r=layout(j,cat);assert.deepEqual(r.problems,[]);
  const fridge=r.placed.tall.find(p=>p.role==='refrigerator');
  assert.equal(fridge.width,1000);assert.equal(fridge.applianceWidth,900);assert.equal(fridge.sideClearance,50);
  for(const p of r.placed.tall.filter(p=>p!==fridge&&p.wall===fridge.wall))
    assert.ok(p.at+p.width<=fridge.at || p.at>=fridge.at+1000,'neighbours must stay outside the opening');
  const plan=toPlan(r,j,[],{}),seg=plan.runs.flatMap(r=>r.segments).find(s=>s.units?.some(u=>u.applianceWidth));
  assert.equal(seg.width,1000);assert.equal(seg.units[0].applianceWidth,900);assert.equal(seg.units[0].sideClearance,50);
  assert.equal(seg.code,null,'an appliance opening is not a resized catalogue cabinet');
  j.anchors.find(a=>a.item==='fridge').width=900;
  assert.match(check(j).join(),/50mm clearance/);
});
