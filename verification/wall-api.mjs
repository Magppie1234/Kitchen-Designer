import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const saved=JSON.parse(readFileSync('verification/wall-live-result.json','utf8'));
const resp=await fetch('http://localhost:5055/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(saved.request)});
assert.equal(resp.status,200);const response=await resp.json(),proposal=response.fitting.proposal;
assert.ok(proposal);assert.equal(proposal.plan.validationVersion,8);
assert.equal(proposal.plan.log.filter(e=>e.status==='conflict').length,0);
for(const [wall,row] of Object.entries(proposal.plan.tiers))for(const hood of row.wall.filter(u=>u.kind==='chimney')){
  const left=row.wall.find(u=>u.code&&u.x1===hood.x0),right=row.wall.find(u=>u.code&&u.x0===hood.x1);
  assert.ok(left&&right);assert.equal(left.width,right.width);
  const base=proposal.plan.runs.find(r=>r.key===wall).segments,hob=base.find(u=>u.label==='hob');
  const flanks=base.filter(u=>u.code&&(u.x1===hob.x0||u.x0===hob.x1));
  const expected={450:450,600:550,900:850}[Math.max(...flanks.map(u=>u.width).filter(w=>[450,600,900].includes(w)))];
  assert.equal(left.width,expected);
}
const html=await (await fetch('http://localhost:5055/builder.html')).text();assert.ok(html.includes('Wall + tall')&&html.includes('Cabinet tier view'));
writeFileSync('verification/wall-live-result.json',JSON.stringify({request:saved.request,response},null,2));
console.log(JSON.stringify({cabinets:proposal.plan.planning.metrics.cabinets,changes:proposal.changes,wallCabinets:Object.values(proposal.plan.tiers).flatMap(t=>t.wall).filter(u=>u.code).length,validation:'wall symmetry, catalogue-derived widths, placement checks and live tier selector pass'}));
