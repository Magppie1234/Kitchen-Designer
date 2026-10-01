import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {toEngineInput} from '../../server.mjs';
import {layout} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';

const html=readFileSync('ui/builder.html','utf8').replace(/\r\n/g,'\n');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const plain=x=>JSON.parse(JSON.stringify(x));
const cat=loadCatalog().ok;
const picks=[
  ['3d-900-each','2LB+1HB','DW:2HB','DW:2HB',3],
  ['2d-900-each','2HB','DW:2HB','DW:2HB',2],
  ['3d-600-each','2HB','DW:2LB+1HB','DW:2LB+1HB',2],
  ['3d-grain-right','2LB+1HB','DW:2HB','GD:1BL+1HF',3],
];
function wizard(){
  const card={innerHTML:''};
  const c=vm.createContext({S:{hob:{size:900,drawerCount:3,drawers:[],wizStep:2},steps:{},anchors:[]},$:()=>card});
  for(const name of ['ensureAnchor','markInProcess','renderStepModal','renderEditorLeft','renderPos','closeStep'])c[name]=()=>{};
  vm.runInContext(slice('function hobDrawersFor(', '/* ====================================================================\n   SINK guided'),c);
  c.S.hob.drawers=c.hobDrawersFor(3);
  c.card=card;
  return c;
}

for(const [key,design,left,right,count] of picks){
  test(`${key}: one click applies the pictured layout through generation`,()=>{
    const c=wizard();c.applyHobSidePreset(key);c.ensureHobDefaults();
    const H=c.S.hob;
    assert.equal(H.shape,design);assert.equal(H.drawerCount,count);
    assert.deepEqual(plain(H.flankShape),{left,right});
    assert.deepEqual(plain(H.drawers.map(d=>d.type)),count===3?['low','low','high']:['high','high']);
    c.renderHobWizard();
    assert.match(c.card.innerHTML,/Selected cabinet layout/);
    assert.doesNotMatch(c.card.innerHTML,/Choose by shape|<select/);
    const {input}=toEngineInput([{type:'hob',wall:'W0',off:4950}],{hobDesign:H.shape,hobFlanks:plain(H.flankShape)});
    const mapped=input.anchors.find(a=>a.item==='hob');
    assert.equal(mapped.design,design);assert.deepEqual(mapped.flanks,{left,right});
    const fixture=runEndFixture();Object.assign(fixture.anchors.find(a=>a.item==='hob'),{design:mapped.design,flanks:mapped.flanks});
    const result=layout(fixture,cat),base=result.placed.base;
    const hob=base.find(p=>p.role==='hob');
    const l=base.find(p=>p.wall===hob.wall&&p.at+p.width===hob.at);
    const r=base.find(p=>p.wall===hob.wall&&p.at===hob.at+hob.width);
    const shape=p=>cat.find(x=>x.code===p.code);
    assert.equal(shape(hob).spec.join('+'),design);
    for(const [p,wanted] of [[l,left],[r,right]]){
      const [family,spec]=wanted.split(':');assert.equal(shape(p).family,family);assert.equal(shape(p).spec.join('+'),spec);
    }
  });
}

test('switching, clearing and resizing release previous picture constraints',()=>{
  const c=wizard();
  c.applyHobSidePreset(picks[3][0]);c.applyHobSidePreset(picks[2][0]);
  assert.deepEqual(plain(c.S.hob.flankShape),{left:'DW:2LB+1HB',right:'DW:2LB+1HB'});
  c.applyHobSidePreset(picks[2][0]);
  assert.equal(c.S.hob.shape,null);assert.equal(c.S.hob.sidePreset,null);
  assert.deepEqual(plain(c.S.hob.flankShape),{left:null,right:null});
  c.applyHobSidePreset(picks[0][0]);c.setHobSize(600);
  assert.equal(c.S.hob.sidePreset,null);assert.equal(c.S.hob.shape,null);assert.equal(c.S.hob.size,600);
});

test('saved picture selections migrate to shapes and matching accessories survive reopening',()=>{
  const c=wizard();c.S.hob.sidePreset=picks[2][0];
  c.S.hob.sides={left:{mode:'cabinet',cabinet:{code:'BC2EH',w:600}},right:{mode:'cabinet'}};
  c.ensureHobDefaults();
  assert.equal(c.S.hob.drawerCount,2);assert.equal(c.S.hob.shape,'2HB');
  assert.equal(c.S.hob.sides.left.mode,'none');assert.equal(c.S.hob.sides.right.mode,'none');
  const drawers=plain(c.S.hob.drawers);c.renderHobWizard();
  assert.deepEqual(plain(c.S.hob.drawers),drawers);
  c.S.hob.wizStep=3;c.renderHobWizard();assert.match(c.card.innerHTML,/Hob base: 2 HB/);
});
