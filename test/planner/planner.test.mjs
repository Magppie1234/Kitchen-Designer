import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {planKitchen, planningContext, cornerArrangements} from '../../core/planner.mjs';
import {geometryProblems, overlapProblems, gate} from '../../core/engine.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';

const catalog=loadCatalog().ok;
const adjusted=runEndFixture;

test('corner search synchronizes tiers, varies physical corners and stays bounded for large rooms',()=>{
  const keys=['base:A:B','base:B:C','wall:A:B','wall:B:C'];
  const arrangements=cornerArrangements(keys);
  assert.equal(arrangements.length,4);
  assert.ok(arrangements.some(p=>p[keys[0]]==='a'&&p[keys[1]]==='b'&&p[keys[2]]==='a'&&p[keys[3]]==='b'));
  assert.equal(cornerArrangements(Array.from({length:30},(_,i)=>'corner'+i)).length,16);
  assert.deepEqual(cornerArrangements([]),[{}]);
});

test('exact-fit fixture keeps its appliance positions',async()=>{
  const input=adjusted(), before=JSON.stringify(input), strict=await planKitchen(input,catalog);
  assert.deepEqual(strict.problems,[]);
  assert.deepEqual(geometryProblems(input,strict.placed,catalog),[]);
  assert.equal(JSON.stringify(input),before);
  const j=adjusted(),r=await planKitchen(j,catalog);
  assert.deepEqual(r.problems,[]);
  assert.deepEqual(overlapProblems(r.placed),[]);
  assert.deepEqual(geometryProblems(j,r.placed,catalog),[]);
  for (const a of j.anchors) {
    const p=Object.values(r.placed).flat().find(p=>p.role===(a.item==='fridge'?'refrigerator':a.item));
    assert.deepEqual([p.wall,p.at,p.width],[a.wall,a.at,a.width]);
  }
  // Check every mm of every requested zone, including the shared corner reservations.
  for(const [tier,zs] of Object.entries(j.zones)) for(const z of zs){
    const pieces=r.placed[tier].filter(p=>p.wall===z.wall&&p.at<z.to&&p.at+p.width>z.from).sort((a,b)=>a.at-b.at);
    let cursor=z.from;for(const p of pieces){assert.equal(Math.max(p.at,z.from),cursor);cursor=Math.min(z.to,p.at+p.width);}assert.equal(cursor,z.to);
  }
  assert.ok(r.planning.metrics.cabinets>0);
  assert.equal(r.planning.mode,'Catalogue solver');
  assert.equal(r.planning.evaluated,r.planning.alternatives.length);
  assert.ok(r.planning.passing>0);
  assert.equal(gate(r).verdict,'FEASIBLE','cancelled accessory rules no longer block a valid design');
});

test('planning context spans are positive and consistent',()=>{
  assert.ok(planningContext(adjusted(),catalog).spans.every(s=>s.length===s.to-s.from&&s.length>0));
});
