// Suggestions choose catalogue configurations; the engine owns all millimetres.
import { layout, gate, betterFit, avoidableTrim } from './engine.mjs';
import { check } from './checkInput.mjs';
import { RULE_PARAMS, RULES } from './config.mjs';

export function planningContext(input, catalog) {
  const H = RULE_PARAMS.heights[input.height];
  const eligible = catalog.filter(c => c.group === 'base' ? c.handle === input.handle
    : c.height === (c.group === 'wall' ? H?.wall : H?.tall));
  const spans = [];
  for (const [tier, zones] of Object.entries(input.zones ?? {})) for (const z of zones) {
    const blocked = [
      ...input.anchors.filter(a => a.wall === z.wall && (a.item === 'fridge' || tier === 'base')),
      ...(input.openings ?? []).filter(o => o.wall === z.wall && (o.type === 'door' || tier !== 'base')),
    ].sort((a,b) => a.at-b.at);
    let cursor = z.from;
    for (const b of blocked) {
      if (b.at >= z.to || b.at+b.width <= cursor) continue;
      if (b.at > cursor) spans.push({tier, wall:z.wall, from:cursor, to:b.at, length:b.at-cursor});
      cursor = Math.max(cursor, Math.min(z.to,b.at+b.width));
    }
    if (cursor < z.to) spans.push({tier,wall:z.wall,from:cursor,to:z.to,length:z.to-cursor});
  }
  const corners = [];
  for (const tier of ['base','wall']) input.walls.forEach((a,i) => {
    const b = input.walls[(i+1)%input.walls.length];
    if (input.zones[tier]?.some(z=>z.wall===a.id&&z.to===a.length)
      && input.zones[tier]?.some(z=>z.wall===b.id&&z.from===0)) corners.push(`${tier}:${a.id}:${b.id}`);
  });
  return {anchors:input.anchors, zones:input.zones, walls:input.walls, spans,
    openings:input.openings??[],columns:input.columns??[],structures:input.structures??[],height:input.height,handle:input.handle,
    designerChoices:{hobDesign:input.hobDesign,hobFlanks:input.hobFlanks,hobSides:input.hobSides},
    rulesVersion:RULES.version,rules:RULES.rules.map(({id,hard,status,statement})=>({id,hard:!!hard,status,statement})),
    parameters:RULE_PARAMS,
    spanNote:'Available before derived hood/flanks and shared corner reservations; exact packing follows.',
    corners, catalog:eligible.map(({code,width,height,depth,family,zone,spec})=>({code,width,height,depth,family,zone,spec}))};
}

export function checkedProposal(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('proposal must be an object');
  if (Object.keys(value).some(k=>!['name','preferredCodes','cornerLegs','preferStorage','lemansCorner','runs'].includes(k)))
    throw Error('proposal may choose cabinets/corner legs only; anchors, zones and dimensions are immutable');
  const codes = new Set(context.catalog.map(c=>c.code));
  if (!Array.isArray(value.preferredCodes) || value.preferredCodes.length > 80
    || value.preferredCodes.some(c=>!codes.has(c))) throw Error('proposal contains an ineligible or unknown catalogue code');
  const legs = value.cornerLegs ?? {};
  if (!legs || typeof legs !== 'object' || Array.isArray(legs)
    || Object.entries(legs).some(([k,v])=>!context.corners.includes(k)||!['a','b'].includes(v)))
    throw Error('proposal contains an invalid corner choice');
  if(value.lemansCorner && (!context.corners.includes(value.lemansCorner)||!value.lemansCorner.startsWith('base:')))throw Error('invalid LeMans corner choice');
  const runs=value.runs??[];
  if(!Array.isArray(runs)||runs.length>40)throw Error('expected at most 40 cabinet sequences');
  const spans=new Map((context.packingSpans??[]).map(s=>[s.spanId,s])),seen=new Set();
  for(const run of runs){
    if(!run||Object.keys(run).some(k=>!['spanId','cabinetCodes'].includes(k))||!spans.has(run.spanId)||seen.has(run.spanId))throw Error('unknown or duplicate packing span');
    seen.add(run.spanId);
    if(!Array.isArray(run.cabinetCodes)||!run.cabinetCodes.length||run.cabinetCodes.length>60
      ||run.cabinetCodes.some(code=>!spans.get(run.spanId).eligibleCodes.includes(code)))throw Error('sequence contains an ineligible cabinet');
  }
  return {name:String(value.name??'Suggested combination').slice(0,100), preferredCodes:value.preferredCodes,lemansCorner:value.lemansCorner,
    cornerLegs:legs, runs:structuredClone(runs),preferStorage:value.preferStorage !== false};
}

export function storageMetrics(result, catalog) {
  const byCode = new Map(catalog.map(c=>[c.code,c]));
  const units = Object.values(result.placed).flat().filter(p=>p.code&&!p.blocker);
  // External carcass volume is a comparison proxy, never usable internal capacity.
  const storage = units.filter(p=>!['hob','sink','refrigerator','microwave + oven'].includes(p.role));
  return {cabinets:units.length, storageCabinets:storage.length,
    drawerCabinets:storage.filter(p=>byCode.get(p.code)?.family==='DW').length,
    avoidableFillerMm:Object.values(result.placed).flat().filter(p=>p.trim&&!p.blocker).reduce((s,p)=>s+avoidableTrim(p),0),
    grossStorageLitres:Math.round(storage.reduce((s,p)=>{const c=byCode.get(p.code);return s+c.width*c.height*c.depth/1e6;},0)),
    fillerMm:Object.values(result.placed).flat().filter(p=>p.trim&&!p.blocker).reduce((s,p)=>s+p.width,0)};
}

// Include mixed corner ownership: different corners may need different walls.
// Enumerate small rooms completely; larger rooms get a deterministic bounded set.
export function cornerArrangements(keys) {
  // Base and upper cabinets share ownership of a physical corner. Search each
  // corner once instead of spending candidates on forbidden cross-tier pairs.
  const corners = [...new Set(keys.map(k => k.replace(/^(base|wall):/, '')))];
  const patterns = new Set();
  const add = s => { if (patterns.size < 16) patterns.add(s); };
  add('a'.repeat(corners.length)); add('b'.repeat(corners.length));
  add(corners.map((_,i)=>i%2?'b':'a').join(''));
  add(corners.map((_,i)=>i%2?'a':'b').join(''));
  for (let i=0;i<corners.length;i++) {
    add(corners.map((_,j)=>j===i?'b':'a').join(''));
    add(corners.map((_,j)=>j===i?'a':'b').join(''));
  }
  for (let n=0;n<2**Math.min(corners.length,4);n++)
    add(corners.map((_,i)=>n & 2**i?'b':'a').join(''));
  return [...patterns].map(s=>Object.fromEntries(keys.map(k=>[k,s[corners.indexOf(k.replace(/^(base|wall):/, ''))]])));
}

export async function planKitchen(input, catalog, {propose, maxRounds=3} = {}) {
  const frozen = structuredClone(input);
  frozen.lockAnchors = true; frozen.lockZones = true;
  frozen.searchHobSides = true;
  frozen.capturePackingSpans = true;
  const invalid = check(frozen);
  if (invalid.length) return {...layout(frozen,catalog), planning:{mode:'input rejected', attempts:[], alternatives:[]}};
  const context = planningContext(frozen,catalog), attempts = [], candidates = [], seen = new Set();
  const evaluate = (proposal, source, searchHobSides=frozen.searchHobSides===true) => {
    const choice = checkedProposal(proposal,context), signature=JSON.stringify([choice.preferredCodes,choice.cornerLegs,choice.preferStorage,searchHobSides,choice.lemansCorner]);
    if (seen.has(signature)) return;
    seen.add(signature);
    const result = layout({...structuredClone(frozen),searchHobSides,planningChoice:choice},catalog);
    const metrics=storageMetrics(result,catalog);
    const summary={name:choice.name,source,problems:result.problems,unresolved:result.unresolved,
      cornerLegs:choice.cornerLegs,lemansCorner:choice.lemansCorner,searchHobSides,verdict:gate(result).verdict,...metrics};
    attempts.push(summary); candidates.push({result,summary,choice});
  };
  for (let round=0;propose && round<Math.min(3,Math.max(1,maxRounds));round++) {
    try {
      const value=await propose(structuredClone({context,round:round+1,feedback:attempts}));
      if (!Array.isArray(value?.proposals) || !value.proposals.length || value.proposals.length>4)
        throw Error('expected 1 to 4 proposals');
      for (const p of value.proposals) {
        try {evaluate(p,'LLM');} catch(e) {attempts.push({source:'LLM',problems:[e.message]});}
      }
      if (candidates.some(c=>!c.result.problems.length)) break;
    } catch(e) {attempts.push({source:'LLM',problems:[e.message]});}
  }
  const drawers=context.catalog.filter(c=>c.zone==='BC'&&c.family==='DW').map(c=>c.code);
  // Always provide a bounded local baseline, also when a provider is unavailable.
  const lemansCorners=context.corners.filter(k=>k.startsWith('base:'));
  for (const [i,cornerLegs] of cornerArrangements(context.corners).entries()) for(const lemansCorner of lemansCorners.length?lemansCorners:[undefined]) for (const style of ['Drawers','Shelves']) evaluate({
    name:`${style} / corner arrangement ${i+1}`,preferredCodes:style==='Drawers'?drawers:[],
    cornerLegs,lemansCorner,preferStorage:true},'Catalogue solver');
  candidates.sort((a,b)=>betterFit(a.result,b.result)?-1:betterFit(b.result,a.result)?1:0);
  return {...candidates[0].result, planning:{mode:propose?'LLM + catalogue solver':'Catalogue solver',
    anchorsFixed:true,zonesFixed:true,
    evaluated:candidates.length,passing:candidates.filter(c=>!c.result.problems.length).length,
    selected:candidates[0].summary.name, selectedChoice:candidates[0].choice, context, attempts,
    alternatives:candidates.map(c=>c.summary), metrics:candidates[0].summary,
    ranking:'Feasibility, physical conflicts, remaining problems, unresolved rules, avoidable filler, gross storage volume, then fewer gap fillers. Complete tall-bank arrangements retain preferred appliances where feasible. Best of evaluated candidates; not a global optimum.'}};
}

export {configuredProposer} from './ai-provider.mjs';
