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
  vm.runInContext(between('function editableList','// merge consecutive')+between('function normalizeList','function highlightSelection')+between('function editReplacePick','/*__RELOCATE_CORE_START__*/'),ctx);
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
test('wall replacement consumes only adjacent filler and retains geometry',()=>{
  const c=editor([{kind:'filler',width:50,x0:25},{kind:'wallSolid',width:600,x0:75,height:725,z:1415,depth:336},{kind:'filler',width:50,x0:675},{kind:'wallSolid',width:600,x0:1725}]);
  c.S.selModRef.idx=1;c.editReplacePick('wider',700,725,false);
  assert.deepEqual(plain(c.S.plan.tiers.W0.wall.map(s=>[s.kind,s.width,s.x0])),[['wallSolid',700,25],['wallSolid',600,1725]]);
  assert.equal(c.S.plan.tiers.W0.wall[0].z,1415);
  const d=editor([{kind:'wallSolid',width:600,x0:25},{kind:'filler',width:100,x0:2025}]);
  d.editReplacePick('too wide',650,725,false);assert.match(d.message,/Does not fit/);assert.equal(d.S.plan.tiers.W0.wall[0].width,600);
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
