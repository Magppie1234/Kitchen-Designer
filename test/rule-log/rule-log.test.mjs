import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../../ui/rule-log.js';
const {explain,groups}=globalThis.KitchenRuleLog;
test('overlapping storage units are reported as collisions, not missing storage',()=>{
  for(const role of ['bottle pullout','grain trolley']){
    const e=explain({rule:'Hard constraint',status:'conflict',detail:`physical overlap: 2/base "drawers" and 3/base "${role}"`});
    assert.equal(e.title,'Cabinets are using the same space');assert.match(e.problem,/wall W3/);
    assert.doesNotMatch(e.action,/Add a|Make room for a/);
  }
});
test('packing and corner issues tell designers where the problem is and what to change',()=>{
  const e=explain({rule:'Hard constraint',status:'conflict',detail:'2/wall: 250mm gap at 3040 — nothing fits — the narrowest module in this tier is 300mm'});
  assert.equal(e.location,'Wall W2 · Wall cabinets');assert.match(e.problem,/250 mm space/);assert.match(e.action,/cabinet sizes/);
  const c=explain({rule:'Hard constraint',status:'conflict',detail:'corner 0/1: base blind cabinet is on wall 0, but wall blind cabinet is on wall 1. Place both on wall 0.'});
  assert.equal(c.location,'Corner between walls W0 and W1');assert.match(c.action,/wall W0/);assert.match(c.problem,/wall W1/);
});
test('failed alternatives and unresolved decisions are kept out of current placement problems',()=>{
  const log=[{rule:'Candidate',status:'skipped',detail:'Alternative: collision'},
    {rule:'Edited layout validation',status:'assumed',detail:'Cabinets edited'},
    {rule:'Hard constraint',status:'conflict',detail:'A/base: 250mm gap at 1000'}];
  const g=groups([...log,log[2]]);assert.equal(g.problems.length,1);assert.equal(g.alternatives.length,1);assert.equal(g.review.length,1);assert.equal(g.defaults.length,0);
  assert.match(g.review[0].action,/Generate Design again/);
  const removed=explain({rule:'Unresolved',status:'assumed',detail:'vegetable basket required but not placed: its host cabinet is unspecified'});
  assert.equal(removed.group,'done');assert.match(removed.title,/removed/);
});
test('design checks modal renders problems first, escapes messages, and hides technical alternatives',()=>{
  const html=readFileSync('ui/builder.html','utf8'),modal={style:{},innerHTML:''};
  const ctx=vm.createContext({KitchenRuleLog:globalThis.KitchenRuleLog,S:{plan:{validationVersion:9,log:[
    {rule:'Candidate',status:'skipped',detail:'discarded <script>bad()</script>'},
    {rule:'Hard constraint',status:'conflict',detail:'0/base: 250mm gap at 1000'},
    {rule:'Unresolved',status:'assumed',detail:'dish rack required but not placed: no placement rule exists'}]}},
    $:()=>modal,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
  vm.runInContext(html.slice(html.indexOf('function openRuleLog()'),html.indexOf('function closeRuleLog()')),ctx);
  ctx.openRuleLog();assert.match(modal.innerHTML,/1 layout problem needs attention/);assert.match(modal.innerHTML,/What’s wrong/);assert.match(modal.innerHTML,/What to change/);
  assert.ok(modal.innerHTML.indexOf('Problems to fix')<modal.innerHTML.indexOf('Other layouts tried'));
  assert.doesNotMatch(modal.innerHTML,/<script>/);assert.match(modal.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(modal.innerHTML,/<details open/);
  ctx.S.plan.validationVersion=4;ctx.openRuleLog();assert.match(modal.innerHTML,/latest rules/);
  ctx.S.generationFailure={log:[{rule:'Hard constraint',status:'conflict',detail:'corner 2/3/base: no corner unit and 560mm return plus filler fit clear of anchors/openings'}]};
  ctx.openRuleLog();assert.match(modal.innerHTML,/Last generation checks/);assert.match(modal.innerHTML,/previous layout has been kept/);
  assert.match(modal.innerHTML,/walls W2 and W3/);assert.doesNotMatch(modal.innerHTML,/discarded &lt;script&gt;|latest rules/);
});
