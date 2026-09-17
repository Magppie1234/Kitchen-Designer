import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layout,geometryProblems,overlapProblems,runEndProblems,tallSideAgainstWall} from '../../engine.mjs';
import {check} from '../../checkInput.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
import {measuredVolumes,collisions} from '../../verification/fixtures.mjs';
import {fitKitchen} from '../../fitting.mjs';
const cat=loadCatalog().ok;

test('saved W4/W5 collision: reserve the short return before filling it, independent of zone order',()=>{
  for(const reverse of [false,true]){
    const j=JSON.parse(readFileSync('verification/tall-overlap-input.json'));
    j.lockAnchors=true;j.lockZones=true;if(reverse)j.zones.tall.reverse();
    const r=layout(j,cat,{fast:true});
    assert.deepEqual(r.problems,[]);
    assert.deepEqual(collisions(measuredVolumes(j,r.placed)),[]);
    assert.deepEqual(overlapProblems(r.placed),[]);
    assert.ok(!r.placed.tall.some(p=>p.wall==='5'&&!p.blocker));
    assert.ok(r.placed.tall.some(p=>p.wall==='5'&&p.blocker&&p.at===0&&p.width===410));
    assert.ok(r.placed.tall.filter(p=>p.role==='wall filler').every(p=>p.width===40));
    assert.ok(Object.values(r.placed).flat().filter(p=>p.role?.startsWith('panel')).every(p=>p.width===25));
    const hood=r.placed.wall.find(p=>p.role==='chimney');
    const flanks=r.placed.wall.filter(p=>p.code&&(p.at+p.width===hood.at||p.at===hood.at+hood.width)&&p.wall===hood.wall);
    assert.equal(flanks.length,2);assert.equal(flanks[0].width,flanks[1].width);
  }
});

test('base and wall can coexist; a tall span excludes both',()=>{
  const j=runEndFixture();assert.deepEqual(check(j),[]);
  for(const tier of ['base','wall']){
    const bad=structuredClone(j);bad.zones[tier][0].to=9500;
    assert.ok(check(bad).some(p=>p.includes(`tall zones overlap ${tier}`)));
  }
  const p={wall:'A',at:100,width:600,role:'cabinet'};
  assert.deepEqual(geometryProblems(j,{base:[{...p}],wall:[{...p}],tall:[]},cat),[]);
  assert.ok(geometryProblems(j,{base:[{...p}],wall:[{...p}],tall:[{...p}]},cat).some(p=>/physical overlap/.test(p)));
});

test('usable tall corner uses a tall blind, a 40mm wall filler and a clear return',()=>{
  const j=runEndFixture();Object.assign(j.anchors.find(a=>a.item==='fridge'),{wall:'C',at:2000});
  j.zones.tall=[{wall:'C',from:0,to:11970},{wall:'D',from:0,to:1500}];
  const r=layout(j,cat,{fast:true});assert.deepEqual(r.problems,[]);
  assert.ok(r.placed.tall.some(p=>p.role==='tall blind corner'&&p.code.startsWith('TB-')));
  assert.deepEqual(collisions(measuredVolumes(j,r.placed)),[]);
});

test('exposed tall side gets 25mm, a side against a wall gets 40mm; undersized fillers fail',()=>{
  const j=runEndFixture(),r=layout(j,cat,{fast:true});
  assert.deepEqual(r.problems,[]);
  assert.equal(tallSideAgainstWall(j,'A',9000),false);
  assert.equal(tallSideAgainstWall(j,'A',11970),true);
  assert.equal(tallSideAgainstWall({...j,openWalls:['B']},'A',11970),false,'an open threshold does not conceal the cabinet side');
  assert.ok(r.placed.tall.some(p=>p.at===9000&&p.tallVisiblePanel&&p.width===25));
  assert.ok(r.placed.tall.some(p=>p.at+p.width===11970&&p.role==='wall filler'&&p.width===40));
  const bad=structuredClone(r.placed);bad.base.push({wall:'A',at:0,width:29,role:'gap filler',trim:true});
  assert.match(runEndProblems(j,bad).join(),/at least 30mm/);
});

test('anchor fitting can make a 10mm adjustment to satisfy the new fixed wall filler',async()=>{
  const j=JSON.parse(readFileSync('verification/filler-3600-input.json')),before=JSON.stringify(j);
  const fitted=await fitKitchen(j,cat,{proposals:false});
  assert.equal(JSON.stringify(j),before);assert.deepEqual(fitted.result.problems,[]);
  assert.ok(fitted.adjustments.some(a=>a.item==='fridge'&&a.delta!==0));
  assert.ok(fitted.adjustments.every(a=>Math.abs(a.delta)<=100));
  assert.deepEqual(fitted.input.zones,j.zones);
  assert.deepEqual(collisions(measuredVolumes(fitted.input,fitted.result.placed)),[]);
});
