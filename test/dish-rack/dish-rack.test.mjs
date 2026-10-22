import test from 'node:test';
import assert from 'node:assert/strict';
import {layout} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';

const catalog=loadCatalog().ok;
const input=(sinkWidth,openings=[])=>({height:'8ft',handle:'CJ',lockAnchors:true,lockZones:true,dishwasher:false,
  walls:[{id:'A',dir:'E',length:6000},{id:'B',dir:'S',length:5000},{id:'C',dir:'W',length:6000},{id:'D',dir:'N',length:5000}],
  anchors:[{item:'sink',wall:'A',at:2400,width:sinkWidth},{item:'hob',wall:'B',at:2000,width:900},{item:'fridge',wall:'C',at:2005,width:600}],
  openings,zones:{base:[{wall:'A',from:0,to:6000},{wall:'B',from:0,to:5000}],wall:[{wall:'A',from:0,to:6000},{wall:'B',from:0,to:5000}],tall:[{wall:'C',from:1500,to:4500}]}});
const rack=r=>r.placed.wall.filter(p=>p.role==='dish rack');

test('dish-rack-above-sink: sized to the sink and placed over it',()=>{
  for(const [sink,w] of [[600,600],[900,900],[1200,900]]){
    const r=layout(input(sink),catalog),[d]=rack(r);
    assert.equal(rack(r).length,1);
    assert.equal(d.width,w);
    assert.match(d.code,/^WC-AC-.*-DSH-/);
    assert.ok(d.at>=2400&&d.at+d.width<=2400+sink,`${sink}mm sink: rack ${d.at}..${d.at+d.width} is over it`);
    assert.doesNotMatch(r.problems.join(),/dish rack/);
  }
});

test('dish-rack-above-sink: a window over the sink moves it beside the window, nearer side',()=>{
  const left=rack(layout(input(900,[{type:'window',wall:'A',at:2450,width:1000,sill:1000}]),catalog))[0];
  assert.equal(left.at+left.width,2450);
  const right=rack(layout(input(900,[{type:'window',wall:'A',at:2250,width:1000,sill:1000}]),catalog))[0];
  assert.equal(right.at,3250);
});

test('dish-rack-above-sink: no room beside the window means no dish rack, only a warning',()=>{
  const j=input(900,[{type:'window',wall:'A',at:2400,width:900,sill:1000}]);
  j.zones.wall=[{wall:'A',from:2000,to:2400},{wall:'A',from:3300,to:3700},{wall:'B',from:0,to:5000}];
  const r=layout(j,catalog);
  assert.equal(rack(r).length,0);
  assert.match(r.warnings.join(),/dish rack omitted/);
  assert.doesNotMatch(r.problems.join(),/dish rack/);
});
