import test from 'node:test';
import assert from 'node:assert/strict';
import {runEndFixture} from '../../verification/run-end-fixtures.mjs';
import {loadCatalog} from '../../loadCatalog.mjs';
import {planKitchen,planningContext,checkedProposal,storageMetrics} from '../../planner.mjs';
import {layout,geometryProblems,betterFit} from '../../engine.mjs';
import {improveFittedKitchen} from '../../ai-planner.mjs';
import {configuredProposer,aiConfiguration} from '../../ai-provider.mjs';

const input=runEndFixture(),catalog=loadCatalog().ok;
const baseline=await planKitchen(input,catalog);
const fitted={input,result:baseline,adjustments:[{kind:'anchor',delta:25}],search:{evaluated:1},proposal:null};
const context={...planningContext(input,catalog),packingSpans:baseline.packingSpans};
const unitsFor=span=>baseline.placed[span.tier].filter(p=>p.code&&!p.blocker&&p.wall===span.wall&&p.at>=span.from&&p.at+p.width<=span.to).sort((a,b)=>a.at-b.at);
const ordinary=baseline.packingSpans.find(s=>unitsFor(s).length>=2&&unitsFor(s).every(p=>s.eligibleCodes.includes(p.code)));
assert.ok(ordinary);
const choice={...baseline.planning.selectedChoice,name:'Reordered storage',runs:[{spanId:ordinary.spanId,cabinetCodes:unitsFor(ordinary).map(p=>p.code).reverse()}]};

test('ordered catalogue sequences fit actual reserved spans and remain geometrically valid',()=>{
  checkedProposal(choice,context);
  const result=layout({...input,capturePackingSpans:true,searchHobSides:true,planningChoice:choice},catalog);
  assert.deepEqual(result.problems,[]);
  assert.deepEqual(geometryProblems(input,result.placed,catalog),[]);
  const actual=result.placed[ordinary.tier].filter(p=>p.code&&!p.blocker&&p.wall===ordinary.wall&&p.at>=ordinary.from&&p.at+p.width<=ordinary.to).sort((a,b)=>a.at-b.at).map(p=>p.code);
  assert.deepEqual(actual,choice.runs[0].cabinetCodes);
});

test('sequences cannot invent products, target fixed appliances, overfill spans or disappear silently',()=>{
  assert.throws(()=>checkedProposal({...choice,runs:[{spanId:'base:A:1100:2000',cabinetCodes:[catalog[0].code]}]},context),/span/);
  assert.throws(()=>checkedProposal({...choice,runs:[{spanId:ordinary.spanId,cabinetCodes:['FAKE']}]},context),/ineligible/);
  const tooMany={...choice,runs:[{spanId:ordinary.spanId,cabinetCodes:Array(40).fill(unitsFor(ordinary)[0].code)}]};
  const result=layout({...input,capturePackingSpans:true,planningChoice:tooMany},catalog);
  assert.ok(result.problems.some(p=>/requested sequence/.test(p)));
  const stale=layout({...input,capturePackingSpans:true,planningChoice:{...choice,runs:[{spanId:'missing',cabinetCodes:[]}] }},catalog);
  assert.ok(stale.problems.some(p=>/span changed/.test(p)));
});

test('AI improves a valid but wasteful arrangement and retains fitted metadata and original inputs',async()=>{
  let wasteful,restore;
  for(const span of baseline.packingSpans){
    const units=unitsFor(span);if(!units.length||units.some(p=>!span.eligibleCodes.includes(p.code)))continue;
    for(let i=0;i<units.length&&!wasteful;i++){
      const old=catalog.find(c=>c.code===units[i].code);
      const small=catalog.find(c=>span.eligibleCodes.includes(c.code)&&c.family===old.family&&c.width===old.width-150);
      if(!small)continue;
      const codes=units.map(p=>p.code);codes[i]=small.code;
      const trialChoice={...baseline.planning.selectedChoice,runs:[{spanId:span.spanId,cabinetCodes:codes}]};
      const trial=layout({...input,capturePackingSpans:true,searchHobSides:true,planningChoice:trialChoice},catalog);
      if(!trial.problems.length&&betterFit(baseline,trial)){
        wasteful={...trial,planning:{...baseline.planning,selectedChoice:trialChoice,metrics:storageMetrics(trial,catalog)}};
        restore={...baseline.planning.selectedChoice,name:'Recover wasted space',runs:[{spanId:span.spanId,cabinetCodes:units.map(p=>p.code)}]};
      }
    }
    if(wasteful)break;
  }
  assert.ok(wasteful,'fixture must contain a valid lower-quality layout');
  const start={...fitted,result:wasteful},original=JSON.stringify(start);let calls=0;
  const result=await improveFittedKitchen(start,catalog,{propose:async payload=>{
    calls++;assert.ok(payload.context.rules.length);assert.ok(payload.context.packingSpans.length);
    return {proposals:[restore]};
  }});
  assert.equal(result.result.planning.ai.status,'improved');
  assert.deepEqual(result.result.problems,[]);assert.ok(betterFit(result.result,wasteful));
  assert.deepEqual(result.adjustments,start.adjustments);assert.equal(JSON.stringify(start),original);
  assert.equal(calls,3,'a valid first result does not stop improvement immediately');
  const reviewed={...fitted,proposal:{input,result:wasteful,changes:[{kind:'zone',delta:20}]}};
  const improved=await improveFittedKitchen(reviewed,catalog,{maxRounds:1,propose:async()=>({proposals:[restore]})});
  assert.deepEqual(improved.result,reviewed.result);assert.deepEqual(improved.proposal.changes,reviewed.proposal.changes);
  assert.equal(improved.proposal.result.planning.ai.status,'improved');
});

test('missing credentials, invalid proposals and provider failures retain baseline within call budget',async()=>{
  const offline=await improveFittedKitchen(fitted,catalog);
  assert.equal(offline.result.planning.ai.status,'unavailable');assert.deepEqual(offline.result.placed,baseline.placed);
  let calls=0;
  const failed=await improveFittedKitchen(fitted,catalog,{maxRounds:100,propose:async()=>{calls++;throw Error('offline');}});
  assert.equal(calls,3);assert.equal(failed.result.planning.ai.status,'error');assert.deepEqual(failed.result.placed,baseline.placed);
  const invalid=await improveFittedKitchen(fitted,catalog,{propose:async()=>({proposals:[{...choice,anchors:[]}]})});
  assert.deepEqual(invalid.result.placed,baseline.placed);assert.ok(invalid.result.planning.ai.attempts.every(a=>/immutable/.test(a.error)));
});

test('provider sends strict schema and bounds; rejects incomplete responses and unexpected fields',async()=>{
  assert.equal(aiConfiguration({}).configured,false);let request;
  const answer={proposals:[{name:'test',preferredCodes:[],cornerChoices:[],lemansCorner:null,runs:[]}]};
  const fetchImpl=async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}})};};
  const propose=configuredProposer({env:{OPENROUTER_API_KEY:'test-key',KITCHEN_AI_MAX_TOKENS:'999999'},fetchImpl});
  const result=await propose({context});
  assert.equal(request.max_tokens,24000);assert.equal(request.provider.require_parameters,true);
  assert.equal(request.response_format.json_schema.strict,true);assert.deepEqual(result.proposals[0].cornerLegs,{});
  assert.equal(propose.lastUsage.costUsd,0.001);
  answer.proposals[0].anchors=[];
  await assert.rejects(propose({context}),/unexpected fields/);
  const truncated=configuredProposer({env:{OPENROUTER_API_KEY:'test-key'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:''}}]})})});
  await assert.rejects(truncated({context}),/incomplete/);
  const denied=configuredProposer({env:{OPENROUTER_API_KEY:'secret'},fetchImpl:async()=>({ok:false,status:401})});
  await assert.rejects(denied({context}),e=>e.retryable===false&&!e.message.includes('secret'));
});
