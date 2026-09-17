import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {layout,geometryProblems,overlapProblems} from '../../engine.mjs';
import {toPlan} from '../../server.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import '../../ui/rule-log.js';
const cat=loadCatalog().ok;
const fixture=()=>{const j=JSON.parse(readFileSync('verification/filler-3600-input.json'));j.anchors.find(a=>a.item==='fridge').at+=10;return j;};

test('the screenshot fills visible sink gaps after using allowed concealed corner space',()=>{
  const input=fixture(),before=JSON.stringify(input),result=layout(input,cat),plan=toPlan(result,input,[]);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(result.problems,[]);
  const row=result.placed.base.filter(p=>p.wall==='2').sort((a,b)=>a.at-b.at);
  assert.deepEqual(row.filter(p=>p.role==='gap filler').map(p=>[p.at,p.width]),[[1150,43]]);
  assert.deepEqual(row.filter(p=>p.hiddenCorner).map(p=>p.width),[100,57]);
  let at=0;for(const p of row){assert.equal(p.at,at);at+=p.width;}assert.equal(at,3600);
  assert.equal(row.find(p=>p.role==='sink').at,1193);assert.equal(row.find(p=>p.role==='sink').width,1200);
  const segments=plan.runs.find(r=>r.key==='W2').segments;
  assert.ok(!segments.some(p=>p.kind==='gap'&&!p.hiddenCorner));assert.deepEqual(segments.filter(p=>p.kind==='filler').map(p=>p.width),[43]);
  for(const p of segments.filter(p=>p.kind==='filler')){assert.equal(p.code,null);assert.equal(p.depth,560);assert.equal(p.height,720);}
  assert.ok(result.notes.some(n=>/43mm filler closes/.test(n)));
  assert.deepEqual(geometryProblems(input,result.placed,cat),[]);assert.deepEqual(overlapProblems(result.placed),[]);
});

test('gap fillers meet the 30mm minimum while a cabinet-sized space still gets a cabinet',()=>{
  for(const delta of [-42,6,7]){
    const j=fixture();j.anchors.find(a=>a.item==='sink').at+=delta;
    const r=layout(j,cat),row=r.placed.base.filter(p=>p.wall==='2').sort((a,b)=>a.at-b.at);
    let at=0;for(const p of row){assert.equal(p.at,at);at+=p.width;}assert.equal(at,3600);
    assert.ok(row.filter(p=>p.role==='gap filler').every(p=>p.width>=30&&p.width<150));
    if(delta===-42)assert.ok(!row.some(p=>p.role==='gap filler'&&p.width<30));
    if(delta===7)assert.ok(row.some(p=>p.at===1050&&p.code&&p.width===150));
    assert.ok(!r.problems.some(p=>/filler .*outside/.test(p)));
  }
});

test('upper gaps are filled without filling windows or changing required tall panels',()=>{
  const j=fixture(),r=layout(j,cat),plan=toPlan(r,j,[]);
  assert.ok(r.placed.wall.some(p=>p.role==='gap filler'&&p.width>=30));
  for(const o of j.openings)for(const tier of o.type==='door'?['base','wall','tall']:['wall','tall'])
    assert.ok(!r.placed[tier].some(p=>p.trim&&p.wall===o.wall&&Math.min(p.at+p.width,o.at+o.width)>Math.max(p.at,o.at)));
  assert.ok(r.placed.tall.filter(p=>p.tallVisiblePanel).every(p=>p.width===25));
  for(const p of plan.tiers.W2.wall.filter(p=>p.label==='gap filler'))assert.equal(p.kind,'filler');
});

test('sink fillers render visibly with their width and a plain-language log note',()=>{
  const html=readFileSync('ui/builder.html','utf8'),start=html.indexOf('function draw2dLegacy()'),end=html.indexOf('function renderLegend()',start);
  const svg={innerHTML:'',querySelectorAll:()=>[]};
  const S={planTier:'base',options:{},walls:[{a:[0,0],b:[3600,0],length:3600}],modules:[],plan:{runs:[{key:'W0',segments:[{kind:'filler',label:'gap filler',width:143,x0:1050},{kind:'filler',label:'gap filler',width:57,x0:2393}]}],tiers:{W0:{wall:[]}}}};
  const ctx=vm.createContext({S,TIER:{counter:'#eee'},TALL_ANCHORS:[],$:()=>svg,refitView:()=>{},tf:()=>({sc:.2,X:x=>x*.2,Y:y=>y*.2}),depthOf:()=>560,inwardSign:()=>1,bounds:()=>({a:{x:0,y:0},b:{x:3600,y:3600}}),labelFits:()=>true,modTitle:i=>`<title>Filler ${S.modules[i].W} mm</title>`,tierColor:()=>'',abbrevFunc:String,highlightSelection:()=>{},renderLegend:()=>{},pushMod:m=>S.modules.push(m)-1});
  vm.runInContext(html.slice(start,end),ctx);ctx.draw2dLegacy();
  assert.match(svg.innerHTML,/#E4C88F/);assert.match(svg.innerHTML,/Filler 143 mm/);assert.match(svg.innerHTML,/>57<\/text>/);
  const note=KitchenRuleLog.explain({rule:'Engine',status:'applied',detail:'2/base: 143mm filler closes the remaining space at 1050; no catalogue cabinet fits this space'});
  assert.equal(note.title,'Empty space closed with a filler');assert.match(note.problem,/143 mm filler/);
});
