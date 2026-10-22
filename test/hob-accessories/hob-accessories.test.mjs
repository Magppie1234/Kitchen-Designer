import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// hob-side-drawer-accessories, run on the builder's own code.
const html=readFileSync('ui/builder.html','utf8').replace(/\r\n/g,'\n');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function wizard(){
  const c=vm.createContext({S:{hob:{size:900,wizStep:2},anchors:[],steps:{}}});
  for(const n of ['markInProcess','renderStepModal','renderEditorLeft','renderPos','ensureAnchor','closeStep'])c[n]=()=>{};
  vm.runInContext(between('function hobDrawersFor(','/* ---- HOB CABINET LOOKS'),c);
  vm.runInContext(between('function ensureHobSides(','function renderHobWizard('),c);
  vm.runInContext(between('function reconcileHobSideWidths(','function correctionsHtml('),c);
  vm.runInContext(between('const ACC_ZONES=','function renderLibPanelBody('),c);
  return c;
}
const run=(c,js)=>vm.runInContext(js,c);
// pick every accessory the list offers, in list order
const fillAll=c=>{ for(const n of run(c,'hobFlatAccList()')) run(c,`toggleHobAcc(${JSON.stringify(n)})`); return run(c,'hobChosenAccs()'); };

test('each look: side drawers take accessories too, each accessory once',()=>{
  const limits={'3d-900-each':7,'2d-900-each':5,'3d-600-each':5,'3d-grain-right':5};
  for(const [key,limit] of Object.entries(limits)){
    const c=wizard();run(c,`applyHobSidePreset('${key}')`);
    const chosen=fillAll(c);
    assert.equal(chosen.length,limit,key);
    assert.equal(new Set(chosen.map(a=>a.name)).size,chosen.length,`${key}: no accessory twice`);
  }
});

test('a 600 side unit offers the 600 list; the 900 hob keeps its own',()=>{
  const c=wizard();run(c,`applyHobSidePreset('3d-600-each')`);
  const chosen=fillAll(c);
  assert.ok(chosen.filter(a=>a.unit!=='hob').every(a=>a.width===600&&/Small/.test(a.name)));
  assert.ok(chosen.filter(a=>a.unit==='hob').every(a=>a.width===900&&!/Small/.test(a.name)));
  assert.ok(run(c,'hobBOQItems()').every(h=>h.width===(h.drawer>0?900:600)),'priced at the unit width');
});

test('a side generated narrower loses what it cannot take and asks for a reselect',()=>{
  const c=wizard();run(c,`applyHobSidePreset('3d-900-each')`);fillAll(c);
  const leftBefore=run(c,`S.hob.sides.left.drawers.map(d=>d.acc)`);
  const plan={runs:[{segments:[
    {kind:'cabinet',code:'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15',x0:0,x1:600,width:600},
    {kind:'anchor',label:'hob',x0:600,x1:1500,width:900},
    {kind:'cabinet',code:'BC-DW-CJ-ST-XXX-2HB-XXX-900-720-560-15',x0:1500,x1:2400,width:900}]}]};
  c.plan=plan;
  const msgs=run(c,'reconcileHobSideWidths(plan)');
  assert.equal(msgs.length,1);assert.match(msgs[0],/Left of hob is now 600 mm, not the 900 mm its accessories were chosen for/);
  for(const n of leftBefore)assert.ok(msgs[0].includes(n));
  assert.equal(run(c,`JSON.stringify(S.hob.sides.left.drawers.map(d=>d.acc))`),"[null,null]");
  assert.equal(run(c,'S.hob.sides.left.width'),600);assert.equal(run(c,'S.hob.sides.left.resized'),true);
  assert.ok(run(c,'S.hob.sides.right.drawers.every(d=>d.acc)'),'the right side, built as pictured, keeps its picks');
  assert.ok(run(c,'hobFlatAccList()').includes('Pulse Canister Tray (Small)'),'the left now offers the 600 list');
  assert.equal(run(c,"reconcileHobSideWidths(plan).length"),0,'regenerating at the same width says nothing more');
  run(c,'hobDone()');assert.equal(run(c,'S.hob.sides.left.resized'),undefined);
});

// cabinet-accessories: the editing page offers a cabinet only what goes in it, by zone.
const slots=(c,code,width,zone)=>JSON.parse(run(c,`JSON.stringify(cabAccSlots(${JSON.stringify({code,width})},'${zone}'))`));
const names=sl=>sl.flatMap(x=>x.options);
test('a cabinet offers only the accessories that go in it, for its width and zone',()=>{
  const c=wizard();
  const dw900=slots(c,'BC-DW-CJ-ST-2LB-1HB-XXX-900-720-560-15',900,'cooking');
  assert.deepEqual(dw900.map(x=>[x.type,x.count]),[['low',2],['high',1]]);
  assert.deepEqual(dw900[0].options,['Cutlery Tray (Large)','Rolling Board & Rolling Pin Tray']);
  assert.equal(dw900[1].options.length,5);
  assert.ok(names(slots(c,'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15',600,'cooking')).every(n=>/Small/.test(n)),'600 drawers: the 600 list');
  assert.deepEqual(slots(c,'BC-DW-CJ-ST-XXX-2HB-XXX-450-720-560-15',450,'cooking'),[],'450 drawers take none');
  assert.deepEqual(slots(c,'BC-DW-CJ-ST-2LB-1HB-XXX-900-720-560-15',900,'washing'),[],'Excel: no drawer accessory on the sink wall');
  assert.deepEqual(slots(c,'BC-DW-CJ-ST-2LB-1HB-XXX-900-720-560-15',900,'other').map(x=>x.type),['high'],'other walls: no cutlery or rolling board');
  assert.deepEqual(names(slots(c,'BC-AC-CJ-ST-BPO-LHS-XXX-150-720-560-15',150,'cooking')),['Bottle Pull-Out – Single']);
  assert.deepEqual(names(slots(c,'BC-AC-CJ-ST-BPO-LHS-XXX-300-720-560-15',300,'cooking')),['Bottle Pull-Out – Double']);
  assert.deepEqual(slots(c,'BC-AC-CJ-ST-BPO-LHS-XXX-300-720-560-15',300,'washing'),[]);
  assert.deepEqual(names(slots(c,'BC-AC-CJ-ST-WBP-1HF-XXX-600-720-560-15',600,'washing')),['Waste Bin Pull-Out']);
  assert.deepEqual(names(slots(c,'BB-AC-CJ-ST-LMC-LHS-XXX-1050-720-560-15',1050,'cooling')),['Lehmans Corner']);
  assert.deepEqual(names(slots(c,'TC-AC-STD-ST-1SX-LHS-TPT-600-2400-560-15',600,'cooling')),['Tandem Pantry']);
  assert.deepEqual(names(slots(c,'WC-SH-NHX-GL-1SG-LHS-XXX-600-725-336-15',600,'other')),['Double Tray']);
  assert.deepEqual(slots(c,'WC-SH-NHX-GL-1SG-LHS-XXX-450-725-336-15',450,'other'),[]);
  assert.deepEqual(slots(c,'BC-SH-CJ-ST-1SX-LHS-XXX-600-720-560-15',600,'cooking'),[],'a plain shutter cabinet takes none');
});

test('the hob and its pictured side units are the HOB step units on the editing page',()=>{
  const c=wizard();run(c,`applyHobSidePreset('3d-900-each')`);
  const row=[{kind:'cabinet',code:'BC-DW-CJ-ST-XXX-2HB-XXX-900-720-560-15',x0:0,x1:900,width:900},
    {kind:'anchor',label:'hob',code:'BC-HO-CJ-ST-2LB-1HB-XXX-900-720-560-15',x0:900,x1:1800,width:900},
    {kind:'cabinet',code:'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15',x0:1800,x1:2400,width:600}];
  c.row=row;c.editableList=()=>row;
  const unit=i=>run(c,`hobUnitForSel({tier:'base'},row[${i}])`);
  assert.equal(unit(1),'hob');assert.equal(unit(0),'left');
  assert.equal(unit(2),null,'a 600 cabinet where the picture has 900 is not the HOB step unit');
});

test('cabinet picks are priced at the cabinet width and follow it on regenerate',()=>{
  const c=wizard();
  const keep={kind:'cabinet',code:'BC-DW-CJ-ST-XXX-2HB-XXX-600-720-560-15',x0:0,x1:600,width:600,accs:[{type:'high',name:'Onion & Potato Basket (Small)'}]};
  const moved={kind:'cabinet',code:'BC-AC-CJ-ST-BPO-LHS-XXX-300-720-560-15',x0:600,x1:900,width:300,accs:[{type:'unit',name:'Bottle Pull-Out – Double'}]};
  c.from={runs:[{key:'W0',segments:[keep,moved]}]};
  c.to={runs:[{key:'W0',segments:[{...keep,accs:undefined},{...moved,accs:undefined,x0:900,x1:1200}]}]};
  assert.equal(run(c,'JSON.stringify(cabAccItems(from))'),JSON.stringify([{name:'Onion & Potato Basket (Small)',width:600,code:keep.code},{name:'Bottle Pull-Out – Double',width:300,code:moved.code}]));
  assert.equal(run(c,'JSON.stringify(carryCabAccs(from,to))'),'["Bottle Pull-Out – Double"]','a moved cabinet loses its pick');
  assert.equal(run(c,'JSON.stringify(to.runs[0].segments.map(g=>g.accs||null))'),JSON.stringify([[{type:'high',name:'Onion & Potato Basket (Small)'}],null]));
});
