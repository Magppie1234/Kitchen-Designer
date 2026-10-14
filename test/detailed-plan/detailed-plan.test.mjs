import test from 'node:test';
import assert from 'node:assert/strict';
import '../../ui/detailed-plan.js';
const walls=[{a:[0,0],b:[4000,0],length:4000},{a:[4000,0],b:[4000,3000],length:3000},{a:[4000,3000],b:[0,3000],length:4000},{a:[0,3000],b:[0,0],length:3000}];
const state={walls,roomName:'Kitchen <A>',plan:{runs:[{key:'W0',segments:[{kind:'cabinet',x0:40,width:600,code:'BC-SH-TTS-ST-1SX-LHS-XXX-600-720-560-15'},{kind:'anchor',tier:'tall',label:'fridge',x0:2000,width:600,height:2400}]}],tiers:{W0:{wall:[{kind:'wallSolid',x0:40,width:450,depth:336},{kind:'wallSolid',x0:3040,width:600,depth:336}]}}}};
const tf={sc:.1,X:x=>x*.1+50,Y:y=>y*.1+50};
test('detailed plan preserves solved geometry and selection across tier modes without mutation',()=>{
  const before=JSON.stringify(state),modules=[];
  const svg=DetailedPlan.render(state,tf,()=>'',m=>modules.push(m)-1);
  assert.equal(JSON.stringify(state),before);
  assert.equal(modules.length,4);
  assert.match(svg,/x="304"/,'sparse upper row keeps its offset');
  assert.match(svg,/Kitchen &lt;A&gt;/i);
  assert.match(svg,/plan-dimension/);assert.match(svg,/stroke-dasharray="3 2"/);
  assert.match(svg,/1 shelf/);
  const tall=[];DetailedPlan.render({...state,planTier:'wall'},tf,()=>'',m=>tall.push(m)-1);
  assert.deepEqual(tall.map(m=>m.tier),['tall','wall','wall']);
  assert.deepEqual(tall[2].run,'W0');assert.equal(tall[2].seg,1);
  const base=[];DetailedPlan.render({...state,planTier:'base'},tf,()=>'',m=>base.push(m)-1);
  assert.deepEqual(base.map(m=>m.tier),['base','tall']);
});
test('reflected rooms, open walls, narrow fillers and openings produce finite geometry',()=>{
  const s=structuredClone(state);s.walls=s.walls.map(w=>({...w,a:[-w.a[0],w.a[1]],b:[-w.b[0],w.b[1]]}));
  s.openWalls=[2];s.plan.openings=[{wall:'W3',off:1000,width:800,type:'door'}];
  s.plan.runs[0].segments.push({kind:'filler',width:40,x0:2640});
  let openings=0;
  const svg=DetailedPlan.render(s,tf,()=>{openings++;return '<g data-opening="true"/>';});
  assert.equal(openings,1);assert.doesNotMatch(svg,/NaN|Infinity/);
  assert.match(svg,/planFiller/);assert.match(svg,/>40<\/text>/);
});

test('plan distinguishes the veggie sink and shows both 50mm fridge clearances',()=>{
  const s=structuredClone(state);
  s.plan.runs[0].segments=[{kind:'anchor',label:'veggie sink',veggie:true,x0:40,width:600},
    {kind:'tallBank',x0:2000,width:1000,units:[{type:'fridge',width:1000,applianceWidth:900,sideClearance:50}]}];
  s.plan.tiers.W0.wall=[];
  const svg=DetailedPlan.render(s,tf);
  assert.match(svg,/Veggie sink cabinet/);assert.match(svg,/900 mm fridge/);
  assert.match(svg,/1000 mm opening/);assert.match(svg,/50 mm clearance each side/);
  assert.equal((svg.match(/data-fridge-clearance="true"/g)||[]).length,2);
  assert.match(svg,/x="200"[^>]*width="5"/);
  assert.match(svg,/x="295"[^>]*width="5"/);
});

test('every dimension sits outside the wall, none inside the room',()=>{
  // this room winds positively, so in each wall's own frame the room is +y and outside is -y
  const svg=DetailedPlan.render(state,tf);
  const dims=[...svg.matchAll(/<g class="plan-dimension"[\s\S]*?<\/g>/g)].map(m=>m[0]);
  assert.ok(dims.length>4);
  for(const d of dims)for(const [,y] of d.matchAll(/ y[12]?="(-?[\d.]+)"/g))assert.ok(+y<=0,`dimension inside the room: ${d.slice(0,120)}`);
});

test('doors and windows sit in the wall, not half inside the room',()=>{
  const s=structuredClone(state);s.plan.openings=[{wall:'W0',off:1500,width:900,type:'window'}];
  const calls=[];const svg=DetailedPlan.render(s,tf,(w,o,t,wallPx)=>{calls.push(wallPx);return '<g data-opening="true"/>';});
  const ww=125*tf.sc;
  assert.deepEqual(calls,[ww],'symbol is drawn at the plan wall thickness');
  // W0 runs along +x with the room at +y: the symbol moves out to the wall's centre, -ww/2
  assert.ok(svg.includes(`translate(0,${-ww/2})"><g data-opening`));
  const cut=svg.match(/<rect x="105" y="(-?[\d.]+)" width="90" height="([\d.]+)" fill="white"/);
  assert.ok(cut&&+cut[1]+ +cut[2]<=0.5,'the wall gap does not reach into the room');
});
