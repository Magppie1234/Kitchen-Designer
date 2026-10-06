import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,baseTallInterfaces,runEndProblems,gate} from '../../core/engine.mjs';
import {loadCatalog} from '../../core/loadCatalog.mjs';
import {RULE_PARAMS} from '../../core/config.mjs';
import {toPlan} from '../../server.mjs';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
const catalog=loadCatalog().ok;

for(const reverse of [false,true])test(`base/tall junction uses one full-height 25mm panel (${reverse?'tall first':'base first'})`,()=>{
 const j=runEndFixture();
 if(reverse){for(const a of j.anchors)a.at=11970-a.at-a.width;
  for(const zs of Object.values(j.zones))for(const z of zs){const from=z.from;z.from=11970-z.to;z.to=11970-from;}}
 const r=layout(j,catalog);assert.deepEqual(r.problems,[]);
 const junction=baseTallInterfaces(j)[0],panels=r.placed.tall.filter(p=>p.tallVisiblePanel);
 assert.equal(panels.length,1);assert.equal(panels[0].width,25);
 assert.equal(panels[0].height,2400);assert.equal(panels[0].z,0);assert.ok(panels[0].trim);
 // visible-panel-handing: base run on the tall cabinet's low-offset side = left panel, high-offset = right
 assert.equal(panels[0].side,reverse?'right':'left');
 assert.ok(!r.placed.base.some(p=>!p.blocker&&/^countertop return/.test(p.role)
  && (reverse?p.at===junction.edge:p.at+p.width===junction.edge)));
 const exposed=reverse?11970:0;
 assert.ok(r.placed.base.some(p=>/^countertop return/.test(p.role)&&(reverse?p.at+p.width===exposed:p.at===exposed)));
 const plan=toPlan(r,j,[],{}),pieces=plan.runs.flatMap(run=>run.segments).filter(p=>/tall visible/.test(p.label));
 assert.equal(pieces.length,1);assert.equal(pieces[0].width,25);assert.equal(pieces[0].height,2400);assert.equal(pieces[0].tier,'tall');
 assert.equal(pieces[0].side,reverse?'right':'left');
});

test('touching base zones are continuous; a separated tall zone leaves the base end exposed',()=>{
 const j=runEndFixture();j.zones.base=[{wall:'A',from:0,to:3000},{wall:'A',from:3000,to:9000}];
 const r=layout(j,catalog);assert.deepEqual(r.problems,[]);
 assert.ok(!r.placed.base.some(p=>p.trim&&(p.at===3000||p.at+p.width===3000)));
 const separate=runEndFixture();separate.zones.tall[0].from+=1;
 assert.deepEqual(baseTallInterfaces(separate),[]);
 const out=layout(separate,catalog);
 // Free end: dropdown sits on the last cabinet; leftover wall stays open, never a sliver.
 for(const tier of ['base','wall']){
  const open=out.placed[tier].find(p=>p.role==='open wall'&&p.at+p.width===9000);
  const end=open?open.at:9000;
  assert.ok(!open||open.width>=RULE_PARAMS.open_wall_min);
  assert.ok(out.placed[tier].some(p=>p.trim&&/^(countertop return|panel)/.test(p.role)&&p.at+p.width===end));
  assert.ok(!out.placed[tier].some(p=>p.role==='gap filler'&&p.at+p.width===end-25));
 }
});

test('fixed panel width cannot be inflated and a dropdown at the junction is rejected',()=>{
 const j=runEndFixture(),r=layout(j,catalog),bad=structuredClone(r.placed);
 bad.tall.find(p=>p.tallVisiblePanel).width=80;
 assert.ok(runEndProblems(j,bad).some(p=>/25mm tall visible panel/.test(p)));
 const wrongHand=structuredClone(r.placed);
 wrongHand.tall.find(p=>p.tallVisiblePanel).side='right';
 assert.ok(runEndProblems(j,wrongHand).some(p=>/needs a left visible panel/.test(p)));
 const duplicate=structuredClone(r.placed);
 duplicate.base.push({wall:'A',at:8975,width:25,role:'countertop return',trim:true});
 assert.ok(runEndProblems(j,duplicate).some(p=>/dropdown is not allowed/.test(p)));
 const exposed=structuredClone(r.placed);
 exposed.base=exposed.base.filter(p=>!/^countertop return/.test(p.role));
 assert.ok(runEndProblems(j,exposed).some(p=>/requires a countertop dropdown/.test(p)));
 assert.equal(RULE_PARAMS.panel_width,25,'wall/exposed end panel default remains independent');
 const blocked=runEndFixture();blocked.anchors.find(a=>a.item==='fridge').at=9000;
 const noRoom=layout(blocked,catalog);
 assert.equal(gate(noRoom).verdict,'REJECTED');
 assert.ok(noRoom.problems.some(p=>/tall visible panel.*conflicts/.test(p)));
 assert.equal(noRoom.placed.tall.find(p=>p.role==='refrigerator').at,9000,'locked anchor cannot slide to hide the panel');
});
