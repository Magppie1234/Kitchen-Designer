import test from 'node:test';
import assert from 'node:assert/strict';
import {layout} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {correctKitchen} from '../../core/correct.mjs';
import {prepareAnchorInput} from '../../core/fitting.mjs';
import {toEngineInput} from '../../server.mjs';
const catalog=loadCatalog().ok;

// The 4763 x 3200 designer room that left 223mm and 230mm dead space on the right-hand wall.
const W=4763,H=3200;
const room=()=>toEngineInput([
  {type:'hob',wall:'W1',off:1190},{type:'sink',wall:'W2',off:2885,elevation:'B'},{type:'fridge',wall:'W3',off:1610},
],{handles:'CJ',kitchenHeightMm:2500,fridgeWidth:600,
  walls:[[[0,0],[W,0]],[[W,0],[W,H]],[[W,H],[0,H]],[[0,H],[0,0]]].map(([a,b])=>({a,b})),
  openings:[{type:'door',wall:'W2',off:1755,width:900},{type:'door',wall:'W0',off:900,width:1800}],
  zones:[{wall:'W0',tier:'base',s:2630,e:W},{wall:'W1',tier:'base',s:0,e:H},{wall:'W0',tier:'wall',s:2630,e:W},
    {wall:'W1',tier:'wall',s:0,e:H},{wall:'W2',tier:'base',s:2255,e:W},{wall:'W3',tier:'base',s:0,e:1090},{wall:'W3',tier:'tall',s:1090,e:2650}]}).input;

test('run-end-against-wall: a base run reaching a solid wall closes against it, never open wall',()=>{
  const r=layout({...room(),lockZones:true},catalog);
  const end=r.placed.base.filter(p=>p.wall==='1').sort((a,b)=>b.at-a.at)[0];
  assert.equal(end.at+end.width,H);
  assert.ok(end.code||end.role==='gap filler',`run ends in "${end.role}"`);
  assert.ok(!r.placed.base.some(p=>p.wall==='1'&&(p.role==='open wall'||/^countertop return/.test(p.role))));
});

test('band-edge-at-wall-end-fixed: correction never pulls a drawn band out of its corner',async()=>{
  const input=room(),c=await correctKitchen(prepareAnchorInput(input),catalog,{original:input,budgetMs:3000});
  for(const tier of ['base','wall'])for(const [wall,end,at] of [['0','to',W],['1','from',0],['1','to',H]])
    assert.ok(c.input.zones[tier].some(z=>z.wall===wall&&z[end]===at),`${tier} band on wall ${wall} left its wall end`);
  assert.ok(c.result.placed.base.some(p=>p.wall==='0'&&p.corner&&p.at+p.width===W),'top-right corner cabinet');
});

test('hob-flank-clear-of-corner: the hob flanks leave the corner return free, so the corner keeps its cabinet',()=>{
  // the designer's later setup: no uppers on the top wall, hob 940mm from the top-right corner
  const {input}=toEngineInput([{type:'hob',wall:'W1',off:1390},{type:'sink',wall:'W2',off:2885,elevation:'B'},{type:'fridge',wall:'W3',off:1610}],
    {handles:'CJ',kitchenHeightMm:2500,fridgeWidth:600,
      walls:[[[0,0],[W,0]],[[W,0],[W,H]],[[W,H],[0,H]],[[0,H],[0,0]]].map(([a,b])=>({a,b})),
      openings:[{type:'door',wall:'W2',off:1755,width:900},{type:'door',wall:'W0',off:900,width:1800}],
      zones:[{wall:'W0',tier:'base',s:2120,e:W},{wall:'W1',tier:'base',s:0,e:H},{wall:'W1',tier:'wall',s:0,e:H},
        {wall:'W2',tier:'base',s:2255,e:W},{wall:'W3',tier:'base',s:0,e:1100},{wall:'W3',tier:'tall',s:1110,e:2630}]});
  const r=layout({...input,lockAnchors:true},catalog);
  assert.ok(!r.problems.some(p=>/corner 0\/1\/base/.test(p)),r.problems.join('; '));
  assert.ok(r.placed.base.some(p=>p.corner?.id==='0:1'),'top-right corner cabinet');
  assert.ok(!r.placed.base.some(p=>p.wall==='1'&&!p.blocker&&p.code&&p.at<600),'nothing in the right wall corner return');
});
