import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('ui/builder.html','utf8').replace(/\r\n/g,'\n');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const plain=x=>JSON.parse(JSON.stringify(x));

// The open room is rooms[0]; the others are rooms of the same plan, each with { walls corners, ...design }.
function plan(open,...others){
  const S={walls:[],openings:[],anchors:[],structures:[],planGroup:'p1'};
  const c=vm.createContext({S,WALL_MM:230});
  for(const n of ['pushUndo','reconcileZones','renderPos','renderLayoutPanel','refresh3DIfLive','scheduleAutosave','updateBeamFullSpan','showToast','dsSaveRoomRecord'])c[n]=()=>{};
  c.$=()=>({}); c.fmtWH=()=>''; c.fmtLen=String; c.snapColumnToWall=()=>null;
  c.bounds=()=>{ const p=S.walls.flatMap(w=>[w.a,w.b]); return {a:{x:Math.min(...p.map(q=>q[0])),y:Math.min(...p.map(q=>q[1]))},b:{x:Math.max(...p.map(q=>q[0])),y:Math.max(...p.map(q=>q[1]))}}; };
  // each room keeps its own copy of the room fields; withRoom swaps them into S
  const keys=['walls','openings','anchors','structures','planGroup','traceCal','wallLocks','scaleWall','room','dims'];
  c.withRoom=(rec,fn)=>{ const save={}; for(const k of keys){ save[k]=S[k]; S[k]=rec.design[k]; }
    try{ return fn(); } finally{ for(const k of keys){ rec.design[k]=S[k]; S[k]=save[k]; } } };
  vm.runInContext(between('const loopArea=','\n'),c);
  vm.runInContext(between('function rebuildWalls(','\n}\n')+'\n}',c);
  vm.runInContext(between('function remapRoom(','// Model answer'),c);
  vm.runInContext(between('function scaleRoomToWall(','const isPlanRoom'),c);
  vm.runInContext(between('function doorFlip(','\n'),c);
  vm.runInContext(between('function dropCorners(','\n/* ---------- step popup'),c);
  c.showToast=m=>{ c.toast=m; };
  const me={design:{}}, rooms=others.map((o,i)=>({id:'r'+i,design:{planGroup:'p1',openings:[],anchors:[],structures:[],...o.design}}));
  c.S.rooms=[me,...rooms]; c.activeRoom=()=>me; c.planNeighbours=()=>rooms;
  c.rebuildWalls(open);
  others.forEach((o,i)=>c.withRoom(rooms[i],()=>c.rebuildWalls(o.corners)));
  return {c,S,rooms,corners:r=>plain(r.design.walls.map(w=>w.a))};
}

// rules.json: plan-rooms-follow-measured-walls, plan-rooms-share-walls
test('every wall length typed in a plan room moves the plan\'s other rooms with it, one wall apart',()=>{
  const {c,S,rooms:[store,utility],corners}=plan(rect(0,0,4000,3000),
    {corners:rect(0,-2000,4000,0)}, {corners:rect(4000,0,6000,3000),design:{openings:[{type:'door',wall:'W3',off:1500,width:800}]}});
  c.scaleRoomToWall(0,4800,false);   // top wall: the first measurement, a uniform x1.2
  c.scaleRoomToWall(1,3300,false);   // right wall: a later measurement, height only
  assert.deepEqual(plain(S.walls.map(w=>w.a)),rect(0,0,4800,3300));
  assert.deepEqual(corners(store),rect(0,-2430,4800,-230));   // one wall above the top wall
  assert.deepEqual(corners(utility),rect(5030,0,7230,3300));  // one wall right of the right wall, full height; its width scales with the plan too
  assert.equal(utility.design.openings[0].off,1650);          // door stays at the wall's middle
});

test('a measured kitchen read off-position slides against the utility\'s shared walls, keeping its size',()=>{
  // the utility / servant pantry: a strip with a step where it widens below the kitchen
  const utility=[[0,0],[1935,0],[1935,6211],[3850,6211],[3850,8585],[0,8585]];
  const {c,rooms:[kitchen],corners}=plan(utility,{corners:rect(2300,460,6480,6441),design:{wallLocks:[0,1]}});
  c.snapPlanNeighbours();
  assert.deepEqual(corners(kitchen),rect(2165,0,6345,5981));
});

test('a room more than 600mm away is not pulled in',()=>{
  const {c,rooms:[far],corners}=plan(rect(0,0,4000,3000),{corners:rect(4700,0,7000,3000)});
  c.snapPlanNeighbours();
  assert.deepEqual(corners(far),rect(4700,0,7000,3000));
});

// rules.json: plan-rooms-one-drawing
test('a plan room with its own measured walls keeps them, and scales with the plan elsewhere',()=>{
  const {c,S,rooms:[measured],corners}=plan(rect(0,0,4000,3000),{corners:rect(4230,0,6230,3000),design:{wallLocks:[0]}});
  c.scaleRoomToWall(0,4800,false);
  assert.equal(S.walls[0].length,4800);
  assert.deepEqual(corners(measured),rect(5030,0,7030,3600));   // one wall away, measured 2000 kept, height x1.2 like the kitchen's
});

test('two measured rooms on one wall: a step between their readings of it closes, the wall is one',()=>{
  // Room 2 (measured) on the left; Room 3 open, its left wall read with a 102mm step where Room 2 has none
  const room3=[[2230,0],[5113,0],[5113,2400],[2128,2400],[2128,1500],[2230,1500]];
  const {c,S,rooms:[room2],corners}=plan(room3,{corners:rect(0,0,2000,2400),design:{wallLocks:[0]}});
  S.wallLocks=[0]; S.openings=[{type:'door',wall:'W5',off:700,width:900}];
  c.scaleRoomToWall(1,2396,false);   // Room 3's right wall
  assert.equal(c.toast,undefined);
  assert.deepEqual(plain(S.walls.map(w=>w.a)),[[2230,0],[5113,0],[5113,2396],[2230,2396]]);   // left wall straight
  assert.deepEqual(corners(room2),rect(0,0,2000,2396));   // its measured 2000 kept, one wall from Room 3
  assert.deepEqual(plain(S.openings),[{type:'door',wall:'W3',off:1597,width:899}]);   // the door stays where it was on the wall
});

// rules.json: plan-rooms-share-doors
test("a door on a shared wall is one door: the neighbour's facing wall carries the open room's copy, mirrored",()=>{
  const {c,S,rooms:[store]}=plan(rect(0,0,4000,3000),{corners:rect(0,-2230,4000,-230),
    design:{openings:[{type:'door',wall:'W2',off:2800,width:1200},{type:'door',wall:'W1',off:1000,width:800}]}});
  S.openings=[{type:'door',variant:'single',wall:'W0',off:1000,width:900,flip:0,required:true}];
  c.snapPlanNeighbours();   // plan read / measured: the open room's reading wins
  assert.deepEqual(plain(store.design.openings),[{type:'door',wall:'W1',off:1000,width:800},
    {type:'door',variant:'single',wall:'W2',off:3000,width:900,flip:3}]);   // same hinge jamb, swings out of the store
});

test("only an edit in the open room rewrites the neighbour's shared door; opening a room changes nothing",()=>{
  const {c,S,rooms:[store]}=plan(rect(0,0,4000,3000),{corners:rect(0,-2230,4000,-230),design:{openings:[{type:'door',wall:'W2',off:2800,width:1200}]}});
  S.openings=[{type:'door',wall:'W0',off:1000,width:900}];
  assert.equal(c.syncSharedDoors().length,0);
  assert.equal(store.design.openings[0].off,2800);
  S.openings[0].off=1500;
  assert.equal(c.syncSharedDoors().length,1);
  assert.deepEqual(plain(store.design.openings),[{type:'door',wall:'W2',off:2500,width:900,flip:3}]);
  S.openings=[];
  c.syncSharedDoors();
  assert.deepEqual(plain(store.design.openings),[]);
});
