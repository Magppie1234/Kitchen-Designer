import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {layout,geometryProblems,overlapProblems,gate} from '../../engine.mjs';
import {fitKitchen} from '../../fitting.mjs';
const original=()=>JSON.parse(readFileSync('verification/corner-log-input.json','utf8'));
const cat=loadCatalog().ok;
const quick=j=>layout({...j,lockAnchors:true,lockZones:true},cat,{fast:true});

test('the reported 300mm return is reserved once rather than packed inside the adjoining base cabinets',()=>{
  const j=original(),before=JSON.stringify(j),r=quick(j);
  assert.equal(JSON.stringify(j),before);
  assert.deepEqual(r.problems,[]);
  assert.ok(r.placed.base.some(p=>p.wall==='3'&&p.blocker&&p.width===300&&p.cornerOwner==='2'));
  assert.equal(r.placed.base.filter(p=>p.wall==='3'&&!p.blocker).length,0);
  assert.deepEqual(geometryProblems(j,r.placed,cat),[]);assert.deepEqual(overlapProblems(r.placed),[]);
  assert.match(r.notes.join('\n'),/300mm corner zone.*560mm/);
  assert.deepEqual(quick(j).placed,r.placed,'identical input gives identical placement');
});
test('short returns respect room reflection, both corner ends and tier depth',()=>{
  for(const size of [150,300,560])for(const reflected of [false,true]){
    const j=original();j.zones.base.find(z=>z.wall==='3').to=size;
    if(reflected)for(const w of j.walls)w.dir=({E:'W',W:'E',N:'N',S:'S'})[w.dir];
    const r=quick(j);assert.deepEqual(r.problems,[],JSON.stringify({size,reflected}));
  }
  const j=original();j.zones.base=[{wall:'2',from:0,to:7911},{wall:'1',from:3300,to:3600}];
  j.zones.wall=[];j.zones.tall=[{wall:'1',from:0,to:2380}];
  const r=quick(j);assert.ok(r.placed.base.some(p=>p.wall==='1'&&p.at===3300&&p.width===300&&p.blocker));
  assert.ok(!r.problems.some(p=>/physical overlap/.test(p)));
  const upper=original();upper.zones.wall.push({wall:'3',from:0,to:300});
  const u=quick(upper);assert.ok(u.placed.wall.some(p=>p.wall==='3'&&p.blocker&&p.width===300));
});
test('an obstructed projection remains rejected and does not create a cascade of filler overlaps',()=>{
  const j=original();j.openings.push({wall:'3',type:'door',at:350,width:800});
  const r=quick(j);assert.equal(gate(r).verdict,'REJECTED');
  assert.ok(r.problems.some(p=>/corner 2\/3\/base/.test(p)));
  assert.ok(!r.placed.base.some(p=>p.wall==='3'&&p.cornerOwner));
  assert.ok(!r.problems.some(p=>/physical overlap.*(gap filler|countertop return)/.test(p)));
});
test('the full generation path solves the saved room within authorized anchor movement',async()=>{
  const j=original(),r=await fitKitchen(j,cat);
  assert.equal(gate(r.result).verdict,'FEASIBLE');assert.deepEqual(r.result.problems,[]);
  assert.deepEqual(r.input.zones,j.zones);assert.deepEqual(r.input.openings,j.openings);
  for(const a of r.adjustments||[])assert.ok(Math.abs(a.delta)<=100);
  assert.deepEqual(geometryProblems(r.input,r.result.placed,cat),[]);
});
