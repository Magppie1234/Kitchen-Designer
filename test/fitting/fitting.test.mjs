import test from 'node:test';
import assert from 'node:assert/strict';
import {fitKitchen} from '../../fitting.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {geometryProblems,overlapProblems} from '../../engine.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
import {RULE_PARAMS as P} from '../../config.mjs';
const cat=loadCatalog().ok;
test('authorized anchor adjustment repairs packing without changing the designer input or zones',async()=>{
  const j=runEndFixture();j.anchors.find(a=>a.item==='hob').at+=25;
  const before=JSON.stringify(j),r=await fitKitchen(j,cat);
  assert.equal(JSON.stringify(j),before);
  assert.equal(r.proposal,null);
  assert.deepEqual(r.result.problems,[]);
  for(const [i,a] of r.input.anchors.entries()){
    assert.equal(a.wall,j.anchors[i].wall);assert.equal(a.width,j.anchors[i].width);
    assert.ok(Math.abs(a.at-j.anchors[i].at)<=P.anchor_tolerance);
  }
  assert.deepEqual(geometryProblems(r.input,r.result.placed,cat),[]);
  assert.deepEqual(overlapProblems(r.result.placed),[]);
  for(const c of r.adjustments)assert.ok(c.kind==='anchor'&&Math.abs(c.delta)<=P.anchor_tolerance);
  assert.deepEqual(r.input.openings,j.openings);
  assert.deepEqual(r.input.zones,j.zones);
  assert.deepEqual(r.result.unresolved,[]);
});
test('already fitting, disabled, invalid and exhausted searches do not move input or return partial proposals',async()=>{
  const valid=await fitKitchen(runEndFixture(),cat);assert.equal(valid.proposal,null);assert.equal(valid.search.evaluated,0);
  const j=runEndFixture();
  const disabled=await fitKitchen(j,cat,{proposals:false});assert.equal(disabled.proposal,null);
  j.anchors[0].at=-100;const invalid=await fitKitchen(j,cat);assert.equal(invalid.proposal,null);assert.equal(invalid.search.evaluated,0);
});
