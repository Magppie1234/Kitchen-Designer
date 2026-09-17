import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toEngineInput,toPlan} from '../../server.mjs';
import {prepareAnchorInput,fitKitchen} from '../../fitting.mjs';
import {check} from '../../checkInput.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {geometryProblems,overlapProblems} from '../../engine.mjs';
const request=()=>JSON.parse(readFileSync('verification/empty-6450-request.json'));
const input=()=>{const r=request();return toEngineInput(r.anchors,r.options).input;};
const catalog=loadCatalog().ok;

test('6450mm room generates cabinets after repairing the 12mm fridge overhang',async()=>{
  const j=input(),before=JSON.stringify(j);
  assert.deepEqual(check(j),['anchor fridge: must be fully inside a tall zone on wall 3']);
  const r=await fitKitchen(j,catalog,{proposals:false}),plan=toPlan(r.result,r.input,[]);
  assert.equal(JSON.stringify(j),before);assert.equal(plan.verdict,'FEASIBLE');
  assert.deepEqual(r.result.problems,[]);assert.deepEqual(check(r.input),[]);
  assert.equal(r.input.anchors.find(a=>a.item==='fridge').at,555);
  assert.ok(Object.values(plan.bom).reduce((a,b)=>a+b,0)>=20);
  assert.deepEqual(r.input.zones,j.zones);assert.deepEqual(r.input.openings,j.openings);
  assert.ok(r.adjustments.some(a=>a.item==='fridge'&&a.from===518&&a.to===555&&a.delta===37));
  for(const a of r.adjustments)assert.ok(Math.abs(a.delta)<=100);
  assert.deepEqual(geometryProblems(r.input,r.result.placed,catalog),[]);
  assert.deepEqual(overlapProblems(r.result.placed),[]);
  const again=await fitKitchen(j,catalog,{proposals:false,optimize:false});
  assert.equal(again.adjustments.find(a=>a.item==='fridge').delta,37);
});

test('input preparation does not bypass other errors or exceed the movement allowance',()=>{
  for(const change of [j=>j.anchors.find(a=>a.item==='fridge').at=400,j=>j.anchors.find(a=>a.item==='fridge').at=-1,j=>j.walls[0].length+=10,j=>j.anchors.pop(),j=>j.openings.push({wall:'3',type:'door',at:530,width:600})]){
    const j=input();change(j);const before=JSON.stringify(j),prepared=prepareAnchorInput(j);
    assert.equal(JSON.stringify(prepared),before);assert.ok(check(prepared).length);
  }
  const j=input(),prepared=prepareAnchorInput(j);
  assert.deepEqual(check(prepared),[]);assert.equal(j.anchors.find(a=>a.item==='fridge').at,518);
});

test('all appliance movements remain relative to the original position after containment repair',async()=>{
  const j=input();j.anchors.find(a=>a.item==='fridge').at=480;
  const r=await fitKitchen(j,catalog,{proposals:false});
  assert.deepEqual(r.result.problems,[]);
  const a=r.adjustments.find(a=>a.item==='fridge');
  assert.equal(a.from,480);assert.ok(a.to>=555&&a.to<=580);assert.ok(a.delta<=100);
});
