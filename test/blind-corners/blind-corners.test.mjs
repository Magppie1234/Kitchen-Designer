import test from 'node:test';
import assert from 'node:assert/strict';
import {blindCornerProblems,layout,gate,arrangeBlindFronts} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {cornerArrangements} from '../../core/planner.mjs';
const walls=[{id:'A',dir:'E',length:4000},{id:'B',dir:'S',length:4000},{id:'C',dir:'W',length:4000},{id:'D',dir:'N',length:4000}];
const base=(wall,at,role='blind corner')=>({wall,at,width:1150,role});
const upper=(wall,at)=>({wall,at,width:900,role:'wall blind corner'});
// every wall carries uppers end to end, so each base blind needs its matching wall blind
const uppersEverywhere={wall:walls.map(w=>({wall:w.id,from:0,to:w.length}))};

test('a complete L layout fits with synchronized corners; a window at the corner leaves it without uppers',()=>{
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
  // window-near-corner: a window reaching the corner means no wall cabinet there on either wall,
  // so the base blind needs no matching upper (and none moves to the adjacent wall)
  input.openings=[{type:'window',wall:'A',at:5100,width:900,sill:900}];
  const blocked=layout(input,catalog);
  assert.doesNotMatch(blocked.problems.join(),/matching wall blind cabinet is missing/);
  assert.ok(!blocked.placed.wall.some(p=>p.role==='wall blind corner'&&p.wall==='B'));
  assert.ok(!blocked.placed.wall.some(p=>p.wall==='B'&&p.code&&p.at<200),'wall B keeps 200mm clear at the corner');
  // relaxed 2026-10-13: no upper zone on the blind's wall, so the base blind stands alone
  input.openings=[];input.zones.wall=[];
  assert.doesNotMatch(layout(input,catalog).problems.join(),/matching wall blind cabinet is missing/);
});

test('blind corners match on either wall, including LeMans and reversed room winding',()=>{
  for(const reversed of [false,true])for(const side of ['A','B'])for(const role of ['blind corner','LeMans corner']){
    const input={walls:structuredClone(walls),zones:uppersEverywhere};
    if(reversed)for(const w of input.walls)w.dir=({E:'W',W:'E',N:'N',S:'S'})[w.dir];
    const placed={base:[base(side,side==='A'?2850:0,role)],wall:[upper(side,side==='A'?3100:0)]};
    assert.deepEqual(blindCornerProblems(input,placed),[]);
    placed.wall=[upper(side==='A'?'B':'A',side==='A'?0:3100)];
    assert.match(blindCornerProblems(input,placed).join(),/Place both on wall/);
    placed.wall=[];
    assert.match(blindCornerProblems(input,placed).join(),/matching wall blind cabinet is missing/);
    assert.equal(gate({problems:blindCornerProblems(input,placed)}).verdict,'REJECTED');
    // the blind's own wall has no upper zone into this corner: nothing to match
    input.zones={wall:uppersEverywhere.wall.filter(z=>z.wall!==side)};
    assert.deepEqual(blindCornerProblems(input,placed),[]);
  }
});

test('each corner is checked separately and a second blind on the adjacent wall is rejected',()=>{
  const placed={base:[base('B',0),base('B',2850)],wall:[upper('B',0)]};
  assert.equal(blindCornerProblems({walls,zones:uppersEverywhere},placed).length,1);
  placed.wall.push(upper('B',3100));assert.deepEqual(blindCornerProblems({walls,zones:uppersEverywhere},placed),[]);
  placed.wall.push(upper('A',3100));assert.match(blindCornerProblems({walls,zones:uppersEverywhere},placed)[0],/wall A/);
  assert.deepEqual(blindCornerProblems({walls,zones:uppersEverywhere},{base:[],wall:[]}),[]);
});

// blind-dead-space-absorbs-filler: 1150 | 500 | 300 | 77 filler | sink on wall A, blind at the 'from' end.
const dead=(...items)=>{
  const placed={base:[{wall:'A',at:0,width:1150,code:'BB',role:'blind corner',
    corner:{id:'D:A',end:'from',adjacentWall:'D',adjacentEnd:'to'}},...items],wall:[],tall:[]};
  arrangeBlindFronts({walls},placed,[],[]);return placed.base;
};
const cab=(at,width,role='shutter')=>({wall:'A',at,width,code:`C${width}`,role});
const gapFiller=(at,width)=>({wall:'A',at,width,role:'gap filler',trim:true,code:null});
const sink=at=>({wall:'A',at,width:600,role:'sink',code:'SK'});

test('a filler past a chain of ordinary cabinets becomes concealed space behind the blind',()=>{
  const out=dead(cab(1150,500),cab(1650,300,'bottle pullout'),gapFiller(1950,77),sink(2027));
  assert.ok(!out.some(p=>p.role==='gap filler'));
  assert.deepEqual(out.filter(p=>p.code).map(p=>[p.code,p.at]),[['BB',77],['C500',1227],['C300',1727],['SK',2027]]);
  assert.equal(out.find(p=>p.hiddenCorner).width,77);
});

test('absorption stops at 100mm and leaves a legal filler; an anchor in the chain blocks it',()=>{
  const big=dead(cab(1150,500),gapFiller(1650,130),sink(1780));
  assert.equal(big.find(p=>p.code==='BB').at,100);
  assert.equal(big.find(p=>p.role==='gap filler').width,30);
  const blocked=dead(cab(1150,500),sink(1650),cab(2250,300),gapFiller(2550,77));
  assert.equal(blocked.find(p=>p.code==='BB').at,0);
  assert.equal(blocked.find(p=>p.role==='gap filler').width,77);
});

test('a column in a corner: the blind cabinets stand against it and the space beside it is concealed',async()=>{
  const {readFileSync}=await import('node:fs');
  const {fitKitchen}=await import('../../core/fitting.mjs');
  const input=JSON.parse(readFileSync('verification/alignment-3600.json')).input, L2=input.walls.find(w=>w.id==='2').length;
  input.columns=[...(input.columns||[]),{wall:'3',at:0,width:250,depth:250},{wall:'2',at:L2-250,width:250,depth:250}];
  const r=(await fitKitchen(input,loadCatalog().ok,{proposals:false})).result;
  assert.deepEqual(r.problems,[]);
  for(const tier of ['base','wall']){
    const blind=r.placed[tier].find(p=>p.corner?.id==='2:3'&&!p.blocker);
    assert.equal(blind.at+blind.width,L2-250,`${tier} blind stands against the column face`);
    assert.equal(blind.corner.column,250);
    assert.ok(r.placed[tier].some(p=>p.wall==='2'&&p.at===L2-250&&p.width===250&&p.role==='concealed corner space'));
  }
  // a column deeper than the cabinets still blocks the corner as before
  const big=JSON.parse(readFileSync('verification/alignment-3600.json')).input;
  big.columns=[{wall:'3',at:0,width:600,depth:600},{wall:'2',at:L2-600,width:600,depth:600}];
  const rb=(await fitKitchen(big,loadCatalog().ok,{proposals:false}))?.result;
  assert.ok(!rb||!rb.placed.base.some(p=>p.corner?.id==='2:3'&&p.corner.column));
});
