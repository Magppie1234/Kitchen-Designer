import test from 'node:test';
import assert from 'node:assert/strict';
import {blindCornerProblems,layout,gate} from '../../engine.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {cornerArrangements} from '../../planner.mjs';
const walls=[{id:'A',dir:'E',length:4000},{id:'B',dir:'S',length:4000},{id:'C',dir:'W',length:4000},{id:'D',dir:'N',length:4000}];
const base=(wall,at,role='blind corner')=>({wall,at,width:1150,role});
const upper=(wall,at)=>({wall,at,width:900,role:'wall blind corner'});

test('a complete L layout fits with synchronized corners and rejects a window blocking the matching upper',()=>{
  const input={height:'8ft',handle:'CJ',lockAnchors:true,lockZones:true,dishwasher:false,
    walls:[{id:'A',dir:'E',length:6000},{id:'B',dir:'S',length:5000},{id:'C',dir:'W',length:6000},{id:'D',dir:'N',length:5000}],
    anchors:[{item:'sink',wall:'A',at:1100,width:900},{item:'hob',wall:'B',at:2000,width:900},{item:'fridge',wall:'C',at:2005,width:600}],
    openings:[],zones:{base:[{wall:'A',from:0,to:6000},{wall:'B',from:0,to:5000}],wall:[{wall:'A',from:0,to:6000},{wall:'B',from:0,to:5000}],tall:[{wall:'C',from:1500,to:4500}]}};
  const catalog=loadCatalog().ok,result=layout(input,catalog);
  assert.deepEqual(result.problems,[]);
  assert.equal(result.placed.base.find(p=>p.role==='LeMans corner').wall,'A');
  assert.equal(result.placed.wall.find(p=>p.role==='wall blind corner').wall,'A');
  const singleUpper=structuredClone(input);
  singleUpper.zones.wall=singleUpper.zones.wall.filter(z=>z.wall==='A');
  const singleResult=layout(singleUpper,catalog);
  assert.equal(singleResult.placed.wall.find(p=>p.role==='wall blind corner').wall,'A');
  assert.deepEqual(blindCornerProblems(singleUpper,singleResult.placed),[]);
  input.openings=[{type:'window',wall:'A',at:5100,width:900,sill:900}];
  const blocked=layout(input,catalog);
  assert.match(blocked.problems.join(),/matching wall blind cabinet is missing/);
  assert.ok(!blocked.placed.wall.some(p=>p.role==='wall blind corner'&&p.wall==='B'));
  input.openings=[];input.zones.wall=[];
  assert.match(layout(input,catalog).problems.join(),/matching wall blind cabinet is missing/);
});

test('blind corners match on either wall, including LeMans and reversed room winding',()=>{
  for(const reversed of [false,true])for(const side of ['A','B'])for(const role of ['blind corner','LeMans corner']){
    const input={walls:structuredClone(walls)};
    if(reversed)for(const w of input.walls)w.dir=({E:'W',W:'E',N:'N',S:'S'})[w.dir];
    const placed={base:[base(side,side==='A'?2850:0,role)],wall:[upper(side,side==='A'?3100:0)]};
    assert.deepEqual(blindCornerProblems(input,placed),[]);
    placed.wall=[upper(side==='A'?'B':'A',side==='A'?0:3100)];
    assert.match(blindCornerProblems(input,placed).join(),/Place both on wall/);
    placed.wall=[];
    assert.match(blindCornerProblems(input,placed).join(),/matching wall blind cabinet is missing/);
    assert.equal(gate({problems:blindCornerProblems(input,placed)}).verdict,'REJECTED');
  }
});

test('each corner is checked separately and a second blind on the adjacent wall is rejected',()=>{
  const placed={base:[base('B',0),base('B',2850)],wall:[upper('B',0)]};
  assert.equal(blindCornerProblems({walls},placed).length,1);
  placed.wall.push(upper('B',3100));assert.deepEqual(blindCornerProblems({walls},placed),[]);
  placed.wall.push(upper('A',3100));assert.match(blindCornerProblems({walls},placed)[0],/wall A/);
  assert.deepEqual(blindCornerProblems({walls},{base:[],wall:[]}),[]);
});
