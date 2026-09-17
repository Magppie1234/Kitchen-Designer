import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const request=JSON.parse(readFileSync('verification/corner-log-request.json','utf8'));
const signatures=[];
for(let n=0;n<2;n++){
  const response=await fetch('http://localhost:5055/api/build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
  const plan=await response.json();
  writeFileSync(`verification/corner-log-api-${n+1}.json`,JSON.stringify(plan,null,2));
  assert.equal(response.status,200);assert.equal(plan.verdict,'FEASIBLE');
  assert.equal(plan.log.filter(e=>e.status==='conflict').length,0);
  const signature=JSON.stringify([plan.runs,plan.tiers,plan.anchorAdjustments]);signatures.push(signature);
  console.log(JSON.stringify({attempt:n+1,verdict:plan.verdict,conflicts:0,modules:Object.values(plan.bom).reduce((a,b)=>a+b,0),adjustments:plan.anchorAdjustments}));
}
assert.equal(signatures[0],signatures[1]);console.log('Repeated live requests produce identical cabinet placements and adjustments.');
