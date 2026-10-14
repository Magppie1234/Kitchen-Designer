import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {layout,geometryProblems,overlapProblems} from '../../core/engine.mjs';
import {fitKitchen} from '../../core/fitting.mjs';
import {RULE_PARAMS} from '../../core/config.mjs';
// no-filler-between-cabinets: a gap filler only ever sits at a run end, never between two cabinets
// and never beside the sink. (Replaces the older rule that put fillers on both sides of the sink.)
const betweenCabinets=r=>['base','wall'].flatMap(tier=>r.placed[tier].filter(p=>p.role==='gap filler').filter(p=>{
  const n=left=>r.placed[tier].find(q=>q.wall===p.wall&&(left?q.at+q.width===p.at:q.at===p.at+p.width));
  const cab=q=>q&&!q.blocker&&!q.trim, a=n(true), b=n(false);
  return (cab(a)&&cab(b))||/sink/.test(a?.role)||/sink/.test(b?.role);
}));
import {toPlan} from '../../server.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import '../../ui/rule-log.js';
const cat=loadCatalog().ok;
const fixture=()=>{const j=JSON.parse(readFileSync('verification/filler-3600-input.json'));j.anchors.find(a=>a.item==='fridge').at+=10;return j;};

test('the screenshot closes beside the sink without a filler: concealed corner space and a small appliance move',async()=>{
  const input=fixture(),before=JSON.stringify(input);
  // locked appliances cannot close the sink run exactly, and a filler there is not allowed: reported, not filled
  const locked=layout({...input,lockAnchors:true},cat);
  assert.match(locked.problems.join(),/no-filler-between-cabinets|cannot close/);assert.deepEqual(betweenCabinets(locked),[]);
  const fit=await fitKitchen(input,cat,{proposals:false}),result=fit.result,plan=toPlan(result,fit.input,[]);
  assert.equal(JSON.stringify(input),before);assert.deepEqual(result.problems,[]);
  assert.deepEqual(betweenCabinets(result),[]);
  for(const a of fit.input.anchors)assert.ok(Math.abs(a.at-input.anchors.find(b=>b.item===a.item).at)<=100,'within the appliance tolerance');
  const row=result.placed.base.filter(p=>p.wall==='2').sort((a,b)=>a.at-b.at);
  let at=0;for(const p of row){assert.equal(p.at,at);at+=p.width;}assert.equal(at,3600);
  const segments=plan.runs.find(r=>r.key==='W2').segments;
  assert.ok(!segments.some(p=>p.kind==='gap'&&!p.hiddenCorner));
  assert.deepEqual(geometryProblems(fit.input,result.placed,cat),[]);assert.deepEqual(overlapProblems(result.placed),[]);
});

test('gap fillers meet the 30mm minimum and only ever sit at a run end',async()=>{
  for(const delta of [-42,6,7]){
    const j=fixture();j.anchors.find(a=>a.item==='sink').at+=delta;
    const r=(await fitKitchen(j,cat,{proposals:false})).result,row=r.placed.base.filter(p=>p.wall==='2').sort((a,b)=>a.at-b.at);
    assert.deepEqual(r.problems,[]);
    let at=0;for(const p of row){assert.equal(p.at,at);at+=p.width;}assert.equal(at,3600);
    assert.ok(row.filter(p=>p.role==='gap filler').every(p=>p.width>=30&&p.width<150));
    assert.deepEqual(betweenCabinets(r),[],`sink ${delta}`);
  }
});

test('upper gaps are filled without filling windows or changing required tall panels',()=>{
  const j=fixture(),r=layout(j,cat),plan=toPlan(r,j,[]);
  assert.ok(r.placed.wall.filter(p=>p.role==='gap filler').every(p=>p.width>=30));
  assert.deepEqual(betweenCabinets(r).filter(p=>r.placed.wall.includes(p)),[],'no upper filler between two wall cabinets');
  for(const o of j.openings)for(const tier of o.type==='door'?['base','wall','tall']:['wall','tall'])
    assert.ok(!r.placed[tier].some(p=>p.trim&&p.wall===o.wall&&Math.min(p.at+p.width,o.at+o.width)>Math.max(p.at,o.at)));
  assert.ok(r.placed.tall.filter(p=>p.tallVisiblePanel).every(p=>p.width===RULE_PARAMS.tall_visible_panel_width));
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
