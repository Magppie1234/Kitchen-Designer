import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layout} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {deriveZones} from '../../core/correct.mjs';
const catalog=loadCatalog().ok;

// fridge-look: each photo pick builds exactly the towers it shows, left | fridge | right.
const row=(look,at)=>{
  const j=JSON.parse(readFileSync('verification/tall-storage-input.json'));
  const f=j.anchors.find(a=>a.item==='fridge');f.look=look;if(at!=null)f.at=at;
  j.zones=deriveZones(j.walls,j.anchors,j.openings);
  const r=layout(j,catalog,{fast:true});
  return r.placed.tall.filter(p=>p.wall==='4'&&!p.blocker&&!p.trim).sort((a,b)=>a.at-b.at);
};
const roles=r=>r.map(p=>p.role);

test('glass display shelves: a glass tall on each side of the fridge',()=>{
  const r=row('glass-shelves');
  assert.deepEqual(roles(r),['glass tall','refrigerator','glass tall']);
  assert.ok(r.every(p=>p.role!=='glass tall'||/-GL-/.test(p.code)));
});
test('tandem pantry + oven: pantry one side, oven tower the other',()=>{
  const r=roles(row('pantry-otg'));
  assert.equal(r[1],'refrigerator');
  assert.deepEqual([r[0],r[2]].sort(),['microwave + oven','tandem pantry']);
});
test('free-standing + oven: loose fridge at the wall end, oven tower beside it',()=>{
  const r=row('otg',0);
  assert.deepEqual(roles(r),['refrigerator','microwave + oven']);
  assert.equal(r[0].at,0);assert.equal(r[0].loose,true);
});
test('tall storage: one plain tall shelf beside the fridge, no glass or appliances',()=>{
  const r=row('tall-cabinet');
  assert.equal(r.length,2);assert.ok(roles(r).includes('refrigerator'));
  assert.ok(/^TC-SH-.*-ST-/.test(r.find(p=>p.role==='tall shelf').code));
});
