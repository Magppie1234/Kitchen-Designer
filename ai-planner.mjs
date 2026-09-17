import {layout,betterFit} from './engine.mjs';
import {planningContext,checkedProposal,storageMetrics} from './planner.mjs';
import {check} from './checkInput.mjs';

const snapshot=(result,catalog)=>({metrics:storageMetrics(result,catalog),problems:result.problems,
  unresolved:result.unresolved,choice:result.planning?.selectedChoice,
  placed:Object.fromEntries(Object.entries(result.placed).map(([tier,units])=>[tier,units.filter(p=>!p.blocker).map(({code,role,wall,at,width,depth})=>({code,role,wall,at,width,depth}))]))});

// Called ONCE after deterministic fitting, never from its candidate-search loop.
// A pending fitted proposal is improved in place and retains its review requirement.
export async function improveFittedKitchen(fitted,catalog,{propose,maxRounds=3,totalTimeoutMs=120000}={}){
  const target=fitted.proposal??fitted,input=target.input,baseline=target.result;
  const before=storageMetrics(baseline,catalog),attempts=[],requests=[];
  let best=baseline,bestChoice=baseline.planning?.selectedChoice??{preferredCodes:[],cornerLegs:{},preferStorage:true};
  const start=performance.now(),deadline=AbortSignal.timeout(Math.max(1,Math.min(180000,totalTimeoutMs)));
  let status=propose?'unchanged':'unavailable';
  const finish=()=>{
    const ai={status,model:propose?.model??null,before,after:storageMetrics(best,catalog),attempts,requests,
      calls:requests.length,elapsedMs:Math.round(performance.now()-start),
      costUsd:requests.length&&requests.every(r=>r.costUsd!=null)?requests.reduce((n,r)=>n+r.costUsd,0):null};
    const summaries=attempts.filter(a=>a.metrics).map(a=>({name:a.name,source:'AI',problems:a.problems,unresolved:[],...a.metrics}));
    const result={...best,planning:{...baseline.planning,...best.planning,ai,
      evaluated:(baseline.planning?.evaluated??0)+summaries.length,
      passing:(baseline.planning?.passing??0)+summaries.filter(a=>!a.problems.length).length,
      attempts:[...(baseline.planning?.attempts??[]),...summaries]}};
    return fitted.proposal?{...fitted,proposal:{...fitted.proposal,result}}:{...fitted,result};
  };
  if(!propose||check(input).length)return finish();
  const seen=new Set();let stalls=0;
  const spans=new Map((baseline.packingSpans??[]).map(s=>[s.spanId,s]));
  for(let round=0;round<Math.min(3,Math.max(1,maxRounds))&&!deadline.aborted;round++){
    const context={...planningContext(input,catalog),packingSpans:[...spans.values()]};
    let value;const requestStart=performance.now();propose.lastUsage=null;
    try{
      const feedback=attempts.slice(-8).map(({packingSpans,...attempt})=>({...attempt,
        packingSpans:packingSpans?.map(({eligibleCodes,...span})=>span)}));
      value=await propose({context,round:round+1,baseline:snapshot(best,catalog),feedback}, {signal:deadline});
      requests.push(propose.lastUsage??{elapsedMs:Math.round(performance.now()-requestStart),costUsd:null});
      if(!Array.isArray(value?.proposals)||!value.proposals.length||value.proposals.length>4)throw Error('expected 1 to 4 proposals');
    }catch(e){
      if(requests.length<round+1)requests.push({...propose.lastUsage,elapsedMs:Math.round(performance.now()-requestStart),costUsd:propose.lastUsage?.costUsd??null});
      attempts.push({round,error:String(e.message).slice(0,240)});
      if(e.retryable===false||deadline.aborted)break;
      continue;
    }
    let improved=false;
    for(const proposal of value.proposals){
      if(deadline.aborted)break;
      try{
        const choice=checkedProposal(proposal,context);
        choice.cornerLegs={...bestChoice.cornerLegs,...choice.cornerLegs};
        if(!choice.lemansCorner)choice.lemansCorner=bestChoice.lemansCorner;
        const key=JSON.stringify({...choice,name:''});if(seen.has(key))continue;seen.add(key);
        const result=layout({...structuredClone(input),lockAnchors:true,lockZones:true,searchHobSides:true,capturePackingSpans:true,planningChoice:choice},catalog);
        for(const s of result.packingSpans??[])spans.set(s.spanId,s);
        const metrics=storageMetrics(result,catalog);
        attempts.push({round,name:choice.name,choice,problems:result.problems,metrics,packingSpans:result.packingSpans});
        // A partially repaired but invalid candidate must never replace the baseline.
        if(!result.problems.length&&!result.unresolved.length&&betterFit(result,best)){
          best={...result,planning:{...baseline.planning,mode:'AI + catalogue solver',selected:choice.name,selectedChoice:choice,metrics}};
          bestChoice=choice;status='improved';improved=true;
        }
      }catch(e){attempts.push({round,error:String(e.message).slice(0,240)});}
    }
    stalls=improved?0:stalls+1;
    if(stalls>=2)break;
    await new Promise(resolve=>setImmediate(resolve));
  }
  if(status!=='improved'&&!attempts.some(a=>a.metrics))status='error';
  return finish();
}
