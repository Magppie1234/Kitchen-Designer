import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fill,layout,geometryProblems} from '../../engine.mjs';
import {fitKitchen} from '../../fitting.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {measuredVolumes,collisions} from '../../verification/fixtures.mjs';
const catalog=loadCatalog().ok;
const fixture=()=>JSON.parse(readFileSync('verification/tall-storage-input.json'));
const tall=r=>r.placed.tall.filter(p=>!p.blocker&&p.wall==='4');
const filler=r=>tall(r).filter(p=>p.role==='gap filler').reduce((n,p)=>n+p.width,0);

test('replace 900 plus 190mm filler with 600 plus 450 and a legal 40mm filler',()=>{
  const widths=[...new Set(catalog.filter(c=>c.zone==='TC'&&c.family==='SH'&&c.height===2400).map(c=>c.width))];
  const packed=fill(1090,widths,30,449,true);
  assert.deepEqual(packed.cabinets.sort((a,b)=>a-b),[450,600]);assert.equal(packed.slack,40);
});

test('compare both tall-bank sides and cabinet combinations instead of accepting the first fit',()=>{
  const j=fixture();j.anchors.find(a=>a.item==='fridge').at=2363;
  const r=layout({...j,lockAnchors:true,lockZones:true},catalog,{fast:true});
  assert.deepEqual(r.problems,[]);assert.equal(filler(r),113);
  const row=tall(r),fridge=row.find(p=>p.role==='refrigerator'),pantry=row.find(p=>p.role==='tandem pantry');
  assert.ok(row.some(p=>p.role==='microwave + oven'));
  assert.equal(pantry.at+pantry.width,fridge.at,'the pantry remains immediately beside the fridge on the left');
  assert.deepEqual(row.filter(p=>p.role==='tall shelf').map(p=>p.width).sort((a,b)=>a-b),[450,450,600,600,900]);
  assert.deepEqual(collisions(measuredVolumes(j,r.placed)),[]);
});

test('storage optimization cannot reclaim space by omitting an exposed tall side panel',()=>{
  const j=fixture(),fridge=j.anchors.find(a=>a.item==='fridge');
  j.zones.tall=[{wall:'4',from:fridge.at,to:4993}];
  const r=layout({...j,lockAnchors:true,lockZones:true},catalog,{fast:true});
  assert.ok(r.problems.some(p=>/needs a 25mm visible panel/.test(p)));
});

test('the actual kitchen reclaims 150mm, preserves appliances and stays within original anchor allowances',async()=>{
  const j=fixture(),before=JSON.stringify(j),fitted=await fitKitchen(j,catalog,{proposals:false});
  assert.equal(JSON.stringify(j),before);assert.deepEqual(fitted.result.problems,[]);
  assert.deepEqual(fitted.input.zones,j.zones);assert.deepEqual(fitted.input.openings,j.openings);
  assert.equal(filler(fitted.result),113);
  assert.equal(tall(fitted.result).filter(p=>p.role==='gap filler').length,1,'equal filler area should use fewer separate pieces');
  const widths=tall(fitted.result).filter(p=>p.role==='tall shelf').map(p=>p.width);
  assert.equal(widths.reduce((a,b)=>a+b,0),3000,'150mm more cabinet width than the saved 2850mm');
  // 4993 - two required 40mm wall fillers - 1800mm appliances = 3113mm.
  // With catalogue storage widths in 150mm increments, 3000mm is the best fit.
  assert.equal(4993-80-1800-Math.floor((4993-80-1800)/150)*150,113);
  for(const role of ['refrigerator','tandem pantry','microwave + oven'])assert.equal(tall(fitted.result).filter(p=>p.role===role).length,1);
  assert.ok(tall(fitted.result).filter(p=>p.role==='wall filler').every(p=>p.width===40));
  for(const [i,a] of fitted.input.anchors.entries()){
    assert.equal(a.wall,j.anchors[i].wall);assert.equal(a.width,j.anchors[i].width);
    assert.ok(Math.abs(a.at-j.anchors[i].at)<=100);
  }
  assert.deepEqual(geometryProblems(fitted.input,fitted.result.placed,catalog),[]);
  assert.deepEqual(collisions(measuredVolumes(fitted.input,fitted.result.placed)),[]);
});
