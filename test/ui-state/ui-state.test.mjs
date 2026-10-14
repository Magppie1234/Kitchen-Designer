import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('ui/builder.html','utf8');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const plain=x=>JSON.parse(JSON.stringify(x));
test('all classic browser scripts parse',()=>{
  for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!/type=|src=/.test(m[1]))new vm.Script(m[2]);
});

test('workflow stages stay unlocked after navigating backward',()=>{
  const S={unlockedStages:[0,1,2,3],plan:null,reResult:null,anchors:[],steps:{},walls:[]};
  const ctx=vm.createContext({S,STAGE_META:[{},{},{},{},{}],STAGE_FOR:{dashboard:0,layout:1,editor:2,result:3,quote:4},STAGE_TARGET:['dashboard','layout','editor','result','quote']});
  ctx.go=screen=>{ctx.visited=screen;};
  vm.runInContext(between('function stageUnlocks','/* ---------- app state ----------'),ctx);
  ctx.goStage(2);assert.equal(ctx.visited,'editor');
  assert.ok(ctx.stageUnlocked(3),'Review remains unlocked after returning to Design');
  ctx.goStage(3);assert.equal(ctx.visited,'result');
  assert.ok(!ctx.stageUnlocked(4),'Quote is still locked until it is actually reached');
});

test('design summary distinguishes conflicts, unresolved rules and edited results',()=>{
  const ctx=vm.createContext({esc:String});
  vm.runInContext(between('function correctionsHtml','function fittingFingerprint')+between('function designSummaryHtml','function renderDesignSummary'),ctx);
  const plan={validationVersion:10,planning:{metrics:{cabinets:12},evaluated:8,passing:3},releaseBlocked:true,log:[]};
  assert.doesNotMatch(ctx.designSummaryHtml(plan),/catalogue cabinets placed|combinations checked/);
  plan.log=[{status:'conflict'}];
  assert.match(ctx.designSummaryHtml(plan),/1 placement issues remain/);
  assert.doesNotMatch(ctx.designSummaryHtml(plan),/checks passed/);
  plan.log.push({rule:'Edited layout validation'});
  assert.match(ctx.designSummaryHtml(plan),/Edited layout needs validation/);
  assert.doesNotMatch(ctx.designSummaryHtml(plan),/12 catalogue cabinets/);
});

function fitReview(){
  const S={walls:[],anchors:[{type:'sink',wall:'W0',off:1398,src:'designer'}],zones:[{wall:'W0',tier:'base',s:0,e:1855}],options:{},openings:[],structures:[],hob:{},sink:{},fridge:{}};
  const ctx=vm.createContext({S,structuredClone,showToast:s=>ctx.message=s,dsRevision:()=>{},scheduleAutosave:()=>{},mountResult:()=>{}});
  vm.runInContext(between('function fittingFingerprint','function mountResult'),ctx);
  const original={verdict:'REJECTED',fitting:{proposal:{plan:{validationVersion:10,verdict:'UNRESOLVED',releaseBlocked:true,planning:{metrics:{cabinets:24}},log:[]},
    target:{anchors:[{type:'sink',wall:'W0',off:1380}],zones:[{id:'fit-base-0',wall:'W0',tier:'base',s:0,e:1855}]},changes:[{description:'sink 18 mm left'}]}}};
  S.plan=ctx.withFittingReview(original,ctx.fittingFingerprint(S));return ctx;
}
test('fitting preview leaves inputs unchanged; compare, reload and accept keep geometry and validation aligned',()=>{
  const ctx=fitReview();assert.equal(ctx.S.anchors[0].off,1398);assert.ok(ctx.S.plan.review);
  ctx.keepOriginalFit();assert.equal(ctx.S.plan.verdict,'REJECTED');assert.equal(ctx.S.anchors[0].off,1398);
  ctx.previewFittedProposal();ctx.S.plan=JSON.parse(JSON.stringify(ctx.S.plan));
  ctx.acceptFittedProposal();assert.equal(ctx.S.anchors[0].off,1380);assert.equal(ctx.S.anchors[0].src,'designer');
  assert.equal(ctx.S.plan.review,undefined);assert.equal(ctx.S.plan.releaseBlocked,true);
  assert.equal(ctx.S.plan.planning.adjustments.length,1);
  assert.deepEqual(plain(ctx.S.options.zones),[{wall:'W0',tier:'base',s:0,e:1855}]);
});
test('stale or edited proposals cannot be accepted or silently applied',()=>{
  const old=fitReview();old.S.plan.validationVersion=2;old.acceptFittedProposal();assert.equal(old.S.anchors[0].off,1398);assert.match(old.message,/checks have changed/);
  const ctx=fitReview();ctx.S.anchors[0].off=1500;ctx.acceptFittedProposal();assert.equal(ctx.S.anchors[0].off,1500);assert.ok(ctx.S.plan.review);assert.match(ctx.message,/inputs changed/);
  const edited=fitReview();edited.S.plan.log.push({rule:'Edited layout validation'});edited.acceptFittedProposal();assert.equal(edited.S.anchors[0].off,1398);assert.match(edited.message,/edited/);
});
function editor(list){
  const S={plan:{runs:[],tiers:{W0:{wall:list,loft:[]}}},selModRef:{run:'W0',tier:'wall',idx:0},libData:{entries:[]},editing:true};   // edits run only after Start editing
  const ctx=vm.createContext({S,showToast:msg=>ctx.message=msg,afterEdit:()=>ctx.recalcPositions()});
  vm.runInContext(between('function editableList','// merge consecutive')+between('function normalizeList','function highlightSelection')+between('// The column or beam a cabinet','/*__RELOCATE_CORE_START__*/'),ctx);
  return ctx;
}

test('saved corner markers are preserved as occupied gaps and their panel is read-only',()=>{
  const c=editor([]),marker={kind:'cabinet',func:'perpendicular cabinet footprint',width:380,x0:0,x1:380,kept:true};
  const real={kind:'cabinet',code:'REAL',width:600,x0:380,x1:980};
  c.S.plan.runs=[{key:'W0',segments:[marker,real]}];
  c.S.selModRef={run:'W0',tier:'base',idx:0};
  let thumbnails=0,libraryLoads=0;
  const box={innerHTML:''};c.$=id=>id==='libBody'?box:null;
  c.fillThumb=()=>thumbnails++;c.loadLibrary=()=>libraryLoads++;
  vm.runInContext(between('function renderLibPanelBody()','function toggleLibCross'),c);
  c.renderLibPanelBody();
  assert.match(box.innerHTML,/Corner space occupied by adjoining cabinet/);
  assert.doesNotMatch(box.innerHTML,/<img|<button|<select|onclick|libList/);
  assert.equal(thumbnails,0);assert.equal(libraryLoads,0);
  c.editReplacePick('replacement',380,720,false);
  assert.equal(marker.kind,'cabinet');assert.equal(c.S.plan.runs[0].segments[0],marker);
  c.normalizeReservedSpaces(c.S.plan);
  assert.equal(marker.kind,'gap');assert.equal(marker.kept,undefined);
  assert.deepEqual([marker.width,marker.x0,marker.x1],[380,0,380]);
  assert.equal(real.kind,'cabinet');assert.equal(real.code,'REAL');
  const upper={kind:'wallSolid',label:'perpendicular cabinet footprint',width:300,x0:100,x1:400};
  c.S.plan.tiers.W0.wall=[upper];c.normalizeReservedSpaces(c.S.plan);
  assert.equal(upper.kind,'gap');assert.equal(upper.x0,100);
});
test('editing sparse wall rows preserves the window gap',()=>{
  const c=editor([{kind:'wallSolid',width:600,x0:25},{kind:'wallSolid',width:600,x0:2025}]);
  c.recalcPositions();assert.deepEqual(plain(c.S.plan.tiers.W0.wall.map(s=>s.x0)),[25,2025]);
  c.editReplacePick('replacement',450,725,false);
  assert.deepEqual(plain(c.S.plan.tiers.W0.wall.map(s=>[s.kind,s.width,s.x0])),[['wallSolid',450,25],['filler',150,475],['wallSolid',600,2025]]);
});
test('wall replacement consumes adjacent filler first, then pushes the units after it',()=>{
  const c=editor([{kind:'filler',width:50,x0:25},{kind:'wallSolid',width:600,x0:75,height:725,z:1415,depth:336},{kind:'filler',width:50,x0:675},{kind:'wallSolid',width:600,x0:1725}]);
  c.S.selModRef.idx=1;c.editReplacePick('wider',700,725,false);
  assert.deepEqual(plain(c.S.plan.tiers.W0.wall.map(s=>[s.kind,s.width,s.x0])),[['wallSolid',700,25],['wallSolid',600,1725]]);
  assert.equal(c.S.plan.tiers.W0.wall[0].z,1415);
  const d=editor([{kind:'wallSolid',width:600,x0:25},{kind:'filler',width:100,x0:2025}]);
  d.editReplacePick('too wide',650,725,false);assert.match(d.message,/50mm wider than the free space here/);
  assert.deepEqual(plain(d.S.plan.tiers.W0.wall.map(s=>[s.kind,s.width,s.x0])),[['wallSolid',650,25],['filler',100,2075]]);
});
function generator(){
  const S={walls:[{a:[0,0],b:[4000,0]}],anchors:[{type:'hob',wall:'W0',off:1000}],openings:[],structures:[],zones:[],options:{lookName:'test',handles:{}},handle:'C & J',steps:{acc:[]},hob:{sides:{}},sink:{},fridge:{}};
  const owner={id:'a',seriesId:'signature-classic',design:S};const pending=[],failures=[],requests=[];
  const ctx=vm.createContext({S,currentRoom:owner,API:'',structuredClone,Date,JSON,failures,pending,requests,
    activeRoom:()=>ctx.currentRoom,fetch:(url,options)=>{requests.push(JSON.parse(options.body));return new Promise(resolve=>pending.push(resolve));},alert:()=>{throw Error("Native build alerts must not be used");},
    setTimeout:()=>{},sinkWidth:()=>900,fxWidthMm:()=>600,coerceFinishToSeries:()=>false,seriesById:id=>id?{id}:null});
  for(const n of ['ensureHobDefaults','ensureSinkDefaults','ensureFridgeDefaults','reconcileZones','ensureHobSides','runRuleEngine','go','syncKeepsFromPlan','dsRevision','scheduleAutosave','showToast','selectHandleType'])ctx[n]=()=>{};
  ctx.renderChrome=()=>{};ctx.openRuleLog=()=>ctx.failures.push(ctx.S.generationFailure.log.map(e=>e.detail).join('\n'));
  vm.runInContext(between('function showGenerationFailure(','function openRuleLog('),ctx);
  vm.runInContext(between('async function generate(','function mountResult'),ctx);
  return {ctx,owner,pending};
}
const response=(tag,ok=true)=>({ok,status:ok?200:500,json:async()=>ok?{tag,runs:[],price:{},log:[]}:{error:'server failed'}});

test('generation sends pictured hob shapes without obsolete fixed-width side presets',async()=>{
  const {ctx,pending}=generator();
  ctx.S.hob.shape='2HB';ctx.S.hob.flankShape={left:'DW:2LB+1HB',right:'DW:2LB+1HB'};
  ctx.S.options.hobSides={left:{mode:'cabinet',cabinet:{code:'BC2EH',w:600}}};
  const work=ctx.generate();pending[0](response('pictured'));await work;
  const options=ctx.requests[0].options;
  assert.equal(options.hobDesign,'2HB');
  assert.deepEqual(plain(options.hobFlanks),{left:'DW:2LB+1HB',right:'DW:2LB+1HB'});
  assert.equal(options.hobSides,undefined);
});

test('generation response belongs to its originating room',async()=>{
  const {ctx,owner,pending}=generator(),p=ctx.generate();
  ctx.currentRoom={id:'b',design:{}};ctx.S={...structuredClone(ctx.S),plan:{tag:'other'}};
  pending[0](response('origin'));await p;
  assert.equal(ctx.S.plan.tag,'other');assert.equal(owner.design.plan.tag,'origin');
});
test('generation discards changed inputs, out-of-order requests and HTTP errors',async()=>{
  let {ctx,pending}=generator();let p=ctx.generate();ctx.S.anchors[0].off=2000;pending[0](response('stale'));await p;assert.equal(ctx.S.plan,undefined);
  ({ctx,pending}=generator());const first=ctx.generate(),last=ctx.generate();pending[1](response('new'));await last;pending[0](response('old'));await first;assert.equal(ctx.S.plan.tag,'new');
  ({ctx,pending}=generator());p=ctx.generate();pending[0](response('bad',false));await p;assert.equal(ctx.S.plan,undefined);assert.match(ctx.failures[0],/server failed/);
});

test('a corrected layout always replaces the displayed plan and moves the appliances to match',async()=>{
  const {ctx,pending}=generator();ctx.S.plan={tag:'previous'};
  const work=ctx.generate();
  pending[0]({ok:true,status:200,json:async()=>({tag:'corrected',runs:[{key:'W0',segments:[]}],price:{},verdict:'PASS',log:[],
    corrections:[{kind:'appliance',item:'hob',description:'Hob moved from wall W0 to wall W2, centred at 1450 mm.'}],
    corrected:{anchors:[{type:'hob',wall:'W2',off:1450}],zones:null}})});
  await work;
  assert.equal(ctx.S.plan.tag,'corrected');assert.equal(ctx.failures.length,0);assert.equal(ctx.S.generationFailure,null);
  assert.deepEqual({wall:ctx.S.anchors[0].wall,off:ctx.S.anchors[0].off},{wall:'W2',off:1450});
});
test('an error from stale input does not replace current generation checks',async()=>{
  const {ctx,pending}=generator(),p=ctx.generate();ctx.S.anchors[0].off=2000;
  pending[0](response('old failure',false));await p;
  assert.equal(ctx.failures.length,0);assert.equal(ctx.S.generationFailure,undefined);
});
test('only a missing designer input is still reported instead of a plan',async()=>{
  const {ctx,pending}=generator();ctx.S.plan={tag:'previous'};
  const p=ctx.generate();pending[0]({ok:true,json:async()=>({runs:[],price:{},verdict:'REJECTED',inputRejected:true,
    inputIssues:['Choose a Handle Type in Design → Extras before generating.'],log:[]})});
  await p;assert.equal(ctx.S.plan.tag,'previous');assert.match(ctx.failures[0],/Handle Type/);
});

test('an empty rejected build stays in the editor, explains the issue and preserves the previous plan',async()=>{
  const {ctx,pending}=generator(),screens=[];
  ctx.go=screen=>screens.push(screen);ctx.S.plan={tag:'previous'};
  const p=ctx.generate();
  pending[0]({ok:true,status:200,json:async()=>({runs:[],price:{},verdict:'REJECTED',inputRejected:true,inputIssues:['The fridge is outside its tall-cabinet area. Move it inside and generate again.']})});
  await p;
  assert.equal(ctx.S.plan.tag,'previous');assert.equal(screens.at(-1),'editor');
  assert.ok(!screens.includes('result'));assert.match(ctx.failures[0],/fridge is outside its tall-cabinet area/);
});

test('an empty rejection for an inactive room cannot replace its saved plan or interrupt the active room',async()=>{
  const {ctx,owner,pending}=generator();owner.design.plan={tag:'previous'};
  const p=ctx.generate();ctx.currentRoom={id:'b',design:{}};
  pending[0]({ok:true,status:200,json:async()=>({runs:[],price:{},verdict:'REJECTED',inputRejected:true,inputIssues:['Invalid appliance position']})});
  await p;assert.equal(owner.design.plan.tag,'previous');assert.equal(ctx.failures.length,0);
});
test('out-of-order repricing cannot overwrite newer price or another room',async()=>{
  const owner={id:'a'},plan={runs:[],tiers:{}},pending=[];
  const ctx=vm.createContext({S:{plan,options:{}},API:'',currentRoom:owner,activeRoom:()=>ctx.currentRoom,fetch:()=>new Promise(resolve=>pending.push(resolve)),$:()=>null,renderLibPanelBody:()=>{},console});
  vm.runInContext(between('async function repriceNow','function editDelete'),ctx);
  const a=ctx.repriceNow(),b=ctx.repriceNow();pending[1]({json:async()=>({price:{value:2},bom:{}})});await b;
  pending[0]({json:async()=>({price:{value:1},bom:{}})});await a;assert.equal(plan.price.value,2);
  const c=ctx.repriceNow();ctx.currentRoom={id:'b'};ctx.S.plan={price:{value:99}};
  pending[2]({json:async()=>({price:{value:3},bom:{}})});await c;assert.equal(ctx.S.plan.price.value,99);assert.equal(plan.price.value,3);
});

test('pre-sales revisions: the first PDF is rev 1; the first change after a PDF opens the next; viewing is not a change',()=>{
  const room={id:'r',seriesId:'s',design:{walls:[{length:3000}],options:{finish:'Modern'},plan:{runs:[{segments:[{kind:'cabinet',code:'A',width:600,height:720}]}],tiers:{W0:{wall:[]}}},view:'2d'}};
  const ctx=vm.createContext({S:{},activeRoom:()=>room,stashRoom(){},scheduleAutosave(){},renderChrome(){},JSON,Math});
  vm.runInContext(between('/* ---------- pre-sales revisions','/* ---------- autosave'),ctx);
  const rev=()=>room.design.presalesRev?.n||0;
  room.design.options.finish='Classic';ctx.presalesRevCheck(room);assert.equal(rev(),0,'changes before the first PDF are not revisions');
  assert.equal(ctx.presalesRevNumber(),1);ctx.presalesRevIssued();assert.equal(rev(),1);
  assert.equal(ctx.presalesRevNumber(),1,'a PDF with no change is the same revision');ctx.presalesRevIssued();assert.equal(rev(),1);
  room.design.view='elev';room.design.plan.tiers.W0.loft=[{kind:'filler',open:true,width:600}];
  ctx.presalesRevCheck(room);assert.equal(rev(),1,'switching views or drawing open loft slots is not a change');
  room.design.plan.runs[0].segments[0].code='B';ctx.presalesRevCheck(room);assert.equal(rev(),2,'the first change opens revision 2');
  room.design.options.finish='Modern';ctx.presalesRevCheck(room);assert.equal(rev(),2,'further changes stay in revision 2');
  assert.equal(ctx.presalesRevNumber(),2);ctx.presalesRevIssued();
  room.design.walls[0].length=3100;ctx.presalesRevCheck(room);assert.equal(rev(),3);
});

test('edit-mode undo/redo restores the cabinet plan and paste keeps tiers apart',()=>{
  const S={plan:{runs:[{key:'W0',segments:[{kind:'cabinet',code:'A',width:600,height:720}]}],tiers:{}},selModRef:{run:'W0',tier:'base',idx:0}};
  const ctx=vm.createContext({S,recalcPositions(){},closeLibPanel(){},renderDesignSummary(){},scheduleAutosave(){},repriceNow(){},
    showToast:m=>ctx.message=m,selSeg:()=>S.plan.runs[0].segments[S.selModRef.idx],isReservedSpace:()=>false,
    editReplacePick:(...a)=>ctx.pasted=a});
  vm.runInContext(between('let _planUndo','// Global keyboard handler'),ctx);
  const run=c=>vm.runInContext(c,ctx), code=()=>S.plan.runs[0].segments[0].code;
  ctx.startPlanHistory();
  S.plan.runs[0].segments[0].code='B';ctx.recordPlanEdit();
  S.plan.runs[0].segments[0].code='C';ctx.recordPlanEdit();
  run("stepPlan(_planUndo,_planRedo,'undo')");assert.equal(code(),'B');
  run("stepPlan(_planUndo,_planRedo,'undo')");assert.equal(code(),'A');
  run("stepPlan(_planUndo,_planRedo,'undo')");assert.match(ctx.message,/Nothing to undo/);
  run("stepPlan(_planRedo,_planUndo,'redo')");assert.equal(code(),'B');
  S.plan.runs[0].segments[0].code='D';ctx.recordPlanEdit();
  run("stepPlan(_planRedo,_planUndo,'redo')");assert.match(ctx.message,/Nothing to redo/,'a new edit clears redo');
  assert.ok(ctx.copyCabinet());ctx.pasteCabinet();assert.deepEqual(plain(ctx.pasted.slice(0,3)),['D',600,720]);
  S.selModRef.tier='wall';ctx.pasted=null;ctx.pasteCabinet();
  assert.equal(ctx.pasted,null);assert.match(ctx.message,/only be pasted into the base tier/);
});

test('editing places any cabinet type anywhere, but never into a column or under a beam',()=>{
  const walls=[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}];
  const fresh=()=>({walls,editing:true,options:{ceiling:3100},structures:[],selModRef:{run:'W0',tier:'base',idx:1},
    plan:{runs:[{key:'W0',segments:[{kind:'gap',width:1000,x0:0},{kind:'cabinet',code:'BASE',width:600,x0:1000,depth:560},{kind:'gap',width:2400,x0:1600}]}],
      tiers:{W0:{wall:[{kind:'wallSolid',code:'WALL',width:600,x0:1000,z:1415,height:725,depth:336}],loft:[]}}}});
  const ctx=vm.createContext({showToast:m=>ctx.message=m,afterEdit:()=>{}});
  vm.runInContext(readFileSync('ui/geometry.js','utf8'),ctx);
  vm.runInContext(between('function editableList','// Older saved layouts')+between('function isReservedSpace','function normalizeReservedSpaces')
    +between('function normalizeList','function highlightSelection')+between('function absorbIntoEmpty','/*__RELOCATE_CORE_START__*/'),ctx);
  const tallPick=['TALL-600',600,2400,false,{category:'tall2400',d:560}], basePick=['BASE-600',600,720,false,{category:'base',d:560}];
  const seg=()=>ctx.S.plan.runs[0].segments[1];
  ctx.S=fresh();ctx.editReplacePick(...tallPick);
  assert.equal(seg().kind,'tallBank','a tall picked in a base slot is a tall unit');
  assert.equal(ctx.S.plan.tiers.W0.wall.length,0,'the wall cabinet above it gives way');
  ctx.editReplacePick(...basePick);assert.equal(seg().kind,'cabinet','a base picked in a tall slot is a base cabinet');
  ctx.S=fresh();ctx.S.structures=[{type:'column',x:1300,y:200,w:300,d:400}];ctx.editReplacePick(...basePick);
  assert.equal(seg().code,'BASE','refused: the column stands there');assert.match(ctx.message,/run into the column/);
  ctx.S=fresh();ctx.S.structures=[{type:'beam',x:2000,y:280,w:4000,d:300,h:800}];   // beam bottom at 2300
  ctx.editReplacePick(...basePick);assert.equal(seg().code,'BASE-600','a base cabinet clears the beam');
  ctx.editReplacePick(...tallPick);assert.equal(seg().code,'BASE-600');assert.match(ctx.message,/beam comes down to 2300mm/);
  ctx.S=fresh();ctx.S.selModRef={run:'W0',tier:'wall',idx:0};ctx.editReplacePick(...tallPick);
  assert.equal(ctx.S.plan.tiers.W0.wall[0].code,'WALL');assert.match(ctx.message,/stands on the floor/);
});

test('space an adjoining cabinet stands in, or in front of, is occupied — not an extend area',()=>{
  const walls=[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}];
  const ctx=vm.createContext({});vm.runInContext(readFileSync('ui/geometry.js','utf8'),ctx);
  vm.runInContext(between('// Empty base-row space a cabinet','function reservedSpaceHtml'),ctx);
  const run=(top)=>{ ctx.S={walls,selModRef:null};
    const plan={runs:[{key:'W0',segments:[top,{kind:'gap',width:4000-top.width}]},{key:'W3',segments:[{kind:'gap',width:3000}]}]};
    ctx.markOccupiedSpace(plan);return plan; };
  // W3 runs up the left wall, so the top-left corner is its far end (3000)
  let p=run({kind:'tallBank',width:900,depth:560});
  assert.deepEqual(plain(p.runs[1].segments.map(s=>[s.width,s.label||''])),[[1880,''],[1120,'perpendicular cabinet footprint']],
    'the tall unit stands in 560mm of it and its doors need 560mm in front');
  p=run({kind:'corner',width:1150,depth:560,shutter:{x0:600,x1:1150}});
  assert.deepEqual(plain(p.runs[1].segments.map(s=>s.width)),[2440,560],'a blind corner only takes its footprint');
  const plan=run({kind:'tallBank',width:900,depth:560});plan.runs[0].segments[0]={kind:'gap',width:900};
  ctx.markOccupiedSpace(plan);assert.deepEqual(plain(plan.runs[1].segments.map(s=>s.width)),[3000],'freed again once the tall unit goes');
  // a sliver too narrow for a 40mm filler + the narrowest 150mm cabinet joins the occupied part
  ctx.S={walls,selModRef:null};const tight={runs:[{key:'W0',segments:[{kind:'tallBank',width:900,depth:560},{kind:'gap',width:3100}]},{key:'W3',segments:[{kind:'gap',width:1600},{kind:'cabinet',width:150},{kind:'gap',width:1250}]}]};   // 1750..1880 is a 130mm sliver
  ctx.markOccupiedSpace(tight);assert.deepEqual(plain(tight.runs[1].segments.slice(2).map(s=>[s.width,s.label||''])),[[1250,'perpendicular cabinet footprint']]);
});

test('a mid-height wall cabinet stands on the countertop and meets the wall-cabinet top',()=>{
  const md=h=>({code:`MDW-SH-NHX-ST-4SG-LHS-XXX-600-${h}-336-15`,w:600,h,d:336,category:'midht'});
  const c=editor([{kind:'filler',open:true,label:'open space',width:600,x0:0,z:1415,height:1085,depth:336},{kind:'wallSolid',width:600,x0:600,z:1415,height:1085}]);
  c.S.libData.entries=[md(1290),md(1650)];
  c.editReplacePick(md(1290).code,600,1290,false);
  const u=c.S.plan.tiers.W0.wall[0];
  assert.deepEqual([u.kind,u.code,u.z,u.height],['wallSolid',md(1650).code,850,1650],'the 1650 variant reaches the 2500 top');
  const d=editor([{kind:'wallSolid',width:600,x0:0,z:1415,height:725}]);d.S.libData.entries=[md(1650)];
  d.editReplacePick(md(1650).code,600,1650,false);
  assert.equal(d.S.plan.tiers.W0.wall[0].z,850);assert.match(d.message,/wall cabinets end at 2140mm/);
  // a plain wall cabinet in the space a deleted mid cabinet left hangs with the wall cabinets, not on the countertop
  c.S.plan.tiers.W0.wall[0]={kind:'filler',open:true,label:'open space',width:600,x0:0,z:850,height:1650,depth:336};c.S.selModRef.idx=0;
  c.editReplacePick('WALL-600',600,1085,false);
  assert.deepEqual([c.S.plan.tiers.W0.wall[0].code,c.S.plan.tiers.W0.wall[0].z],['WALL-600',1415]);
  const e=editor([{kind:'filler',open:true,width:600,x0:0,z:850,height:1650}]);e.editReplacePick('WALL-600',600,725,false);
  assert.equal(e.S.plan.tiers.W0.wall[0].z,1415,'no other wall cabinet: 565mm above the countertop');
});
test('a blind corner picked from the library only occupies its own footprint on the adjoining wall',()=>{
  const walls=[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}];
  const c=editor([]);vm.runInContext(readFileSync('ui/geometry.js','utf8'),c);
  Object.assign(c.S,{walls,structures:[]});
  c.S.plan.runs=[{key:'W0',segments:[{kind:'filler',open:true,label:'open space',width:1050,depth:560},{kind:'anchor',label:'hob',width:900},{kind:'gap',width:2050}]},
    {key:'W3',segments:[{kind:'cabinet',code:'X',width:1777,depth:560},{kind:'filler',open:true,label:'open space',width:1223}]}];
  c.S.selModRef={run:'W0',tier:'base',idx:0};c.recalcPositions();
  c.editReplacePick('BB-AC-CJ-ST-LMC-LHS-XXX-1050-720-560-15',1050,720,false,{d:560,category:'base'});
  const bb=c.S.plan.runs[0].segments[0];
  assert.deepEqual(plain([bb.kind,bb.corner.end,bb.shutter.x0,bb.shutter.x1]),['corner','from',600,1050],'door starts past the left run front + 40mm');
  assert.deepEqual(plain(c.S.plan.runs[1].segments.map(s=>[s.kind,s.width,s.label??null])),[['cabinet',1777,null],['filler',663,'open space'],['gap',560,'perpendicular cabinet footprint']]);
});
test('the edge between empty pieces drags to resize or merge them; adjoining cabinets still occupy open space',()=>{
  const c=editor([]);vm.runInContext(readFileSync('ui/detailed-plan.js','utf8'),c);c.openLibPanel=()=>{};
  const reserved={kind:'gap',label:'perpendicular cabinet footprint',width:560},open={kind:'filler',open:true,label:'open space',width:790},hob={kind:'anchor',label:'hob',width:900};
  c.S.plan.runs=[{key:'W0',segments:[reserved,open,hob]}];c.recalcPositions();
  c.moveEmptyBoundary('W0',0,200);
  assert.deepEqual(plain(c.S.plan.runs[0].segments.map(s=>[s.kind,s.width,s.x0])),[['gap',200,0],['filler',1150,200],['anchor',900,1350]]);
  c.moveEmptyBoundary('W0',0,-50);
  assert.deepEqual(plain(c.S.plan.runs[0].segments.map(s=>[s.kind,s.width])),[['filler',1350],['anchor',900]],'merged into one open space');
  assert.equal(c.S.selModRef.idx,0,'the merged space is selected');
  assert.equal(c.DetailedPlan.emptyJoint(open,hob),false,'a cabinet edge is not an empty-space edge');
  // a corner cabinet on the adjoining wall turns open space it stands in into occupied space, and gives it back
  const walls=[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}];
  const g=vm.createContext({});vm.runInContext(readFileSync('ui/geometry.js','utf8'),g);vm.runInContext(between('// Empty base-row space a cabinet','function reservedSpaceHtml'),g);
  g.S={walls,selModRef:null};
  const plan={runs:[{key:'W0',segments:[{kind:'corner',width:1150,depth:560,shutter:{x0:600,x1:1150}},{kind:'gap',width:2850}]},{key:'W3',segments:[{kind:'cabinet',width:2440},{kind:'filler',open:true,label:'open space',width:560}]}]};
  g.markOccupiedSpace(plan);
  assert.deepEqual(plain(plan.runs[1].segments.slice(1).map(s=>[s.kind,s.label])),[['gap','perpendicular cabinet footprint']]);
  plan.runs[0].segments[0]={kind:'gap',width:1150};g.markOccupiedSpace(plan);
  assert.deepEqual(plain(plan.runs[1].segments.slice(1).map(s=>[s.kind,s.open,s.width])),[['filler',true,560]]);
});
test('a tall unit can be dragged into the open space beside it',()=>{
  const ctx=vm.createContext({});vm.runInContext(between('function relocateCore','/*__RELOCATE_CORE_END__*/'),ctx);
  const tall={kind:'tallBank',width:900},list=[tall,{kind:'filler',open:true,width:150},{kind:'anchor',label:'sink',width:800},{kind:'tallBank',width:600}];
  const plan=ctx.relocateCore(list,tall,150);
  assert.ok(plan.ok,plan.reason);assert.equal(plan.lo,150);
  ctx.relocateApply(list,tall,plan);assert.deepEqual(plain(list.map(s=>[s.kind,s.width])),[['filler',150],['tallBank',900],['anchor',800],['tallBank',600]]);
  assert.equal(ctx.relocateCore(list,tall,1700).ok,false,'another tall unit is still a barrier');
});

test('a wall-flush column shows and sets the space either side of it, like a door',()=>{
  const S={walls:[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}],
    openings:[],anchors:[],structures:[{type:'column',x:1500,y:200,w:400,d:400},{type:'beam',dir:'h',x:2000,y:150,w:4000,d:300}]};   // beam along the top wall
  const ctx=vm.createContext({S,fxWidthMm:()=>0,structFits:()=>true,structPlacementValid:()=>true,fmtLenU:String,
    renderLayoutPanel(){},renderPos(){},refresh3DIfLive(){},pushUndo(){},updateBeamFullSpan(){}});
  vm.runInContext(between('function computeGapsForWall','function startGapEdit')+between('// Columns and beams within `reach`','// Columns and beams seen on'),ctx);
  const gaps=ctx.computeGapsForWall(0,false);
  assert.deepEqual(plain(gaps.map(g=>[g.g0,g.g1,g.leftObj?.kind??null,g.rightObj?.kind??null])),[[0,1300,null,'struct'],[1700,4000,'struct',null]],'the beam along the whole wall bounds nothing');
  ctx.moveStructByDelta(0,0,-300,1000);assert.equal(S.structures[0].x,1200,'setting the left gap to 1000 slides the column along the wall');
  assert.deepEqual(plain(ctx.computeGapsForWall(3,false).map(g=>[g.g0,g.g1])),[[0,2700]],'on the side wall the end of the beam bounds the space');
});

test('zones may be drawn up to 50mm from a door; structures are capped only by the room',async()=>{
  const S={walls:[{a:[0,0],b:[4000,0],length:4000}],openings:[{wall:'W0',type:'door',off:2000,width:900}],zones:[]};
  const ctx=vm.createContext({S});
  vm.runInContext(between('const DOOR_CLEAR_FALLBACK','function zoneBlockKinds'),ctx);
  assert.deepEqual(plain(ctx.zoneBlockedSpans(0,'base')),[{s:1500,e:2500}],'900mm door + 50mm each side');
  const {RULES}=await import('../../vendor/rules.js');assert.equal(RULES.openings.doorClearEachSide,50);
  const c2=vm.createContext({S:{walls:[{a:[0,0],b:[4500,0]},{a:[4500,0],b:[4500,2960]}]},fmtLenU:String});
  vm.runInContext(html.match(/function bounds\(\)\{[^\n]*/)[0]+'\n'+between('function structMax','function setSelStructW'),c2);
  assert.equal(c2.structMax({type:'column'},'w'),4500);assert.equal(c2.structMax({type:'beam'},'d'),2960);
});

test('draw wall: ends snap onto walls, a wall stops at the first wall it meets, two close off an area',()=>{
  const S={walls:[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}],
    structures:[],options:{ceiling:3100}};
  const ctx=vm.createContext({S,showToast:m=>ctx.message=m,pushUndo(){},renderLayoutPanel(){},renderPos(){},refresh3DIfLive(){},scheduleAutosave(){},fmtLenU:String});
  vm.runInContext(readFileSync('ui/geometry.js','utf8'),ctx);
  vm.runInContext(between('const PARTITION_T','function setStructDim'),ctx);
  const draw=(sx,sy,ex,ey)=>{ const s=ctx.wallDrawStart(sx,sy,50); if(!s) return null; const e=ctx.wallDrawEnd(s.p,ex,ey,50);
    ctx.S._wd={s:s.p,e:e.p}; ctx.commitWallDraw(); return {s,e}; };
  assert.equal(ctx.wallDrawStart(-100,500,50),null,'cannot start outside the room');
  let d=draw(2000,30,2010,3600);   // starts on the top wall, dragged past the bottom one
  assert.deepEqual(plain([d.s.p,d.s.snap,d.e.p,d.e.snap]),[[2000,0],true,[2000,3000],true]);
  assert.deepEqual(plain(S.structures[0]),{type:'partition',x:2000,y:1500,w:115,d:3000,h:3100},'a straight wall from top to bottom');
  d=draw(30,1200,1975,1190);       // from the left wall towards the first drawn wall: snaps onto it
  assert.deepEqual(plain([d.s.p,d.e.p,d.e.snap]),[[0,1200],[2000,1200],true]);
  d=draw(30,2000,2600,2000);       // cannot pass through the drawn wall
  assert.deepEqual(plain(d.e.p),[2000,2000]);
  assert.equal(S.structures.length,3);
  draw(1000,500,1100,500);assert.equal(S.structures.length,3);assert.match(ctx.message,/at least 200mm/);
});
