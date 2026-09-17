// Shared by live builds and reference previews. Proposed inputs never mutate the original.
import {planKitchen,planningContext,cornerArrangements,storageMetrics} from './planner.mjs';
import {layout,betterFit,fitQuality} from './engine.mjs';
import {check} from './checkInput.mjs';
import {RULE_PARAMS as P} from './config.mjs';

const clone=structuredClone;
const gcd=(a,b)=>b?gcd(b,a%b):a;
const signature=j=>JSON.stringify([j.anchors,j.zones]);

// A slightly out-of-band appliance must reach the authorized fitting pass.
// Repair only containment errors; malformed rooms, overlaps and other input
// errors still fail validation. The original positions remain the tolerance
// baseline for every subsequent search and for the reported adjustment.
export function prepareAnchorInput(input) {
  const errors=check(input);
  if(!errors.length||errors.some(e=>!/^anchor (hob|sink|fridge): must be fully inside a (base|tall) zone on wall /.test(e)))return input;
  const j=clone(input);
  for(const a of j.anchors){
    const tier=a.item==='fridge'?'tall':'base',zs=j.zones[tier]??[];
    if(zs.some(z=>z.wall===a.wall&&a.at>=z.from&&a.at+a.width<=z.to))continue;
    const panel=a.item==='fridge'?P.panel_width:P.countertop_return;
    const positions=zs.filter(z=>z.wall===a.wall).map(z=>{
      const lo=z.from+panel,hi=z.to-a.width-panel;
      return lo<=hi?Math.max(lo,Math.min(hi,a.at)):null;
    }).filter(at=>at!==null&&Math.abs(at-a.at)<=P.anchor_tolerance)
      .sort((x,y)=>Math.abs(x-a.at)-Math.abs(y-a.at)||x-y);
    if(!positions.length)return input;
    a.at=positions[0];if(a.center!=null)a.center=a.at+a.width/2;
  }
  return check(j).length?input:j;
}
export function fittingChanges(original,j){
  const out=[];
  for(let i=0;i<original.anchors.length;i++){
    const a=original.anchors[i],b=j.anchors[i];
    if(a.at!==b.at)out.push({kind:'anchor',index:i,item:a.item,wall:a.wall,from:a.at,to:b.at,delta:b.at-a.at});
  }
  for(const [tier,zs] of Object.entries(original.zones))zs.forEach((a,i)=>{
    const b=j.zones[tier][i];
    for(const edge of ['from','to'])if(a[edge]!==b[edge])out.push({kind:'zone',tier,index:i,edge,wall:a.wall,from:a[edge],to:b[edge],delta:b[edge]-a[edge]});
  });
  return out;
}
const movement=(original,j)=>fittingChanges(original,j).reduce((n,c)=>n+Math.abs(c.delta),0);

function junctions(j){
  const out=[];
  for(const [i,t] of j.zones.tall.entries())for(const edge of ['from','to']){
    const other=edge==='from'?'to':'from';
    const b=j.zones.base.findIndex(z=>z.wall===t.wall&&z[other]===t[edge]);
    if(b<0)continue;
    const w=j.zones.wall.findIndex(z=>z.wall===t.wall&&Math.abs(z[other]-t[edge])<=P.zone_boundary_tolerance);
    out.push({wall:t.wall,at:t[edge],members:[['tall',i,edge],['base',b,other],...(w<0?[]:[['wall',w,other]])]});
  }
  return out;
}
function* neighbours(original,current,catalog,result){
  const tol=P.anchor_tolerance,ztol=P.zone_boundary_tolerance;
  const grid=catalog.filter(c=>c.group==='base'&&['SH','DW','AC'].includes(c.family)).reduce((n,c)=>gcd(n,c.width),0)||50;
  const anchors=[];
  for(const [i,a] of original.anchors.entries()){
    const wall=original.walls.find(w=>w.id===a.wall),values=new Set([a.at]);
    // Catalogue increments aligned to either end of the wall and the shared panel.
    for(const origin of [0,wall.length,P.tall_visible_panel_width,wall.length-P.tall_visible_panel_width])
      for(let n=Math.ceil((a.at-tol-origin)/grid);n<=Math.floor((a.at+tol-origin)/grid);n++)values.add(origin+n*grid);
    for(const tier of ['base','tall'])for(const z of original.zones[tier].filter(z=>z.wall===a.wall))
      for(const trim of [P.countertop_return,P.wall_filler_width,P.countertop_return+P.gap_filler_min,P.wall_filler_width+P.gap_filler_min,P.filler_max]){
        values.add(z.to-a.width-trim);values.add(z.from+trim);
        for(const origin of [z.from+trim,z.to-a.width-trim])
          for(let n=Math.ceil((a.at-tol-origin)/grid);n<=Math.floor((a.at+tol-origin)/grid);n++)values.add(origin+n*grid);
      }
    if(a.item==='hob')for(const z of original.zones.wall.filter(z=>z.wall===a.wall))for(const width of [850,550,450]){
      values.add(z.from+P.panel_width+width+P.chimney_wider_than_hob_by/2);
      values.add(z.to-P.panel_width-width-P.chimney_wider_than_hob_by/2-a.width);
    }
    anchors.push([...values].filter(at=>Number.isInteger(at)&&Math.abs(at-a.at)<=tol&&at>=0&&at+a.width<=wall.length).sort((x,y)=>Math.abs(x-a.at)-Math.abs(y-a.at)||x-y));
    for(const at of anchors[i]){
      if(at===current.anchors[i].at)continue;
      const j=clone(current);j.anchors[i].at=at;
      if(j.anchors[i].center!=null)j.anchors[i].center=at+a.width/2;
      yield j;
    }
  }
  for(const b of junctions(original)){
    const apply=(j,at)=>{
      if(b.members.some(([tier,i,edge])=>Math.abs(at-original.zones[tier][i][edge])>ztol))return false;
      for(const [tier,i,edge] of b.members)j.zones[tier][i][edge]=at;
      return true;
    };
    const wall=original.walls.find(w=>w.id===b.wall);
    const values=new Set([b.at]);
    for(const origin of [0,wall.length])for(let n=Math.ceil((b.at-ztol-origin)/grid);n<=Math.floor((b.at+ztol-origin)/grid);n++)values.add(origin+n*grid);
    for(const at of values){const j=clone(current);if(apply(j,at))yield j;}
    // A fridge and its adjacent tier junction are coupled: solve both sides of
    // the tall run together, using achievable tall-cabinet totals.
    const widths=[...new Set(catalog.filter(c=>c.zone==='TC'&&c.family==='SH'&&c.height===P.heights[original.height].tall).map(c=>c.width))];
    const max=wall.length,totals=new Set([0]);
    for(let x=0;x<=max;x++)if(totals.has(x))for(const w of widths)if(x+w<=max)totals.add(x+w);
    for(const [i,a] of original.anchors.entries())if(a.item==='fridge'&&a.wall===b.wall){
      for(const at of anchors[i])for(const total of totals){
        const boundary=b.at>a.at ? at+a.width+total+P.tall_visible_panel_width : at-total-P.tall_visible_panel_width;
        if(Math.abs(boundary-b.at)>ztol)continue;
        const j=clone(current);j.anchors[i].at=at;
        if(apply(j,boundary))yield j;
      }
    }
  }
  // A window cannot move to accommodate an upper cabinet and its end panel.
  // Offer a shorter upper run when its final empty slot cannot be packed. This
  // is an explicit new zone for designer review, not an automatic tolerance
  // repair; it never grows a zone into an opening or another keep-clear area.
  for(const [i,z] of current.zones.wall.entries())for(const edge of ['from','to']){
    const o=(original.openings??[]).find(o=>o.wall===z.wall&&o.type==='window'
      && original.zones.wall[i][edge]===(edge==='to'?o.at:o.at+o.width));
    if(!o)continue;
    const units=result.placed.wall.filter(p=>p.wall===z.wall&&!p.blocker&&!p.trim&&p.at>=z.from&&p.at+p.width<=z.to);
    if(!units.length)continue;
    const at=edge==='to'?Math.max(...units.map(p=>p.at+p.width))+P.panel_width
      :Math.min(...units.map(p=>p.at))-P.panel_width;
    if(at<=z.from||at>=z.to)continue;
    const j=clone(current);j.zones.wall[i][edge]=at;yield j;
  }
}

function* anchorCandidates(original,current,catalog,result) {
  for(const j of neighbours(original,current,catalog,result))
    if(JSON.stringify(j.zones)===JSON.stringify(original.zones))yield j;
  // Moving two appliances together can preserve the exact cabinet spacing
  // between them even when moving either alone would create an interior gap.
  const count=original.anchors.length;
  for(let mask=1;mask<(1<<count);mask++){
    if((mask&(mask-1))===0)continue;
    for(const delta of [-25,25,-50,50,-75,75,-100,100]){
      if(Math.abs(delta)>P.anchor_tolerance)continue;
      const j=clone(current);
      for(let i=0;i<count;i++)if(mask&(1<<i)){
        j.anchors[i].at=original.anchors[i].at+delta;
        if(j.anchors[i].center!=null)j.anchors[i].center=original.anchors[i].center+delta;
      }
      yield j;
    }
  }
}

// Anchor-only improvements are already authorized. Candidate coordinates are
// always bounded against the original input, never against the last trial.
export async function optimizeAnchors(original,catalog,result,{limit=180,startInput=original}={}) {
  let current={input:clone(startInput),result},evaluated=0;
  const seen=new Set([signature(startInput)]);
  const context=planningContext(original,catalog);
  const selected=result.planning?.metrics;
  const choice={preferredCodes:context.catalog.filter(c=>c.zone==='BC'&&c.family==='DW').map(c=>c.code),
    cornerLegs:selected?.cornerLegs,lemansCorner:selected?.lemansCorner,preferStorage:true};
  for(let round=0;round<3&&evaluated<limit;round++){
    let next=current;
    for(const proposal of anchorCandidates(original,current.input,catalog,current.result)){
      if(evaluated>=limit)break;
      // Combine improvements as they are found. A fridge candidate must be
      // compared with the best hob/sink fit already found, not a discarded
      // starting layout that would require another full search round.
      const j=clone(next.input);
      proposal.anchors.forEach((a,i)=>{
        if(a.at!==current.input.anchors[i].at)j.anchors[i]=clone(a);
      });
      // Cabinet-zone changes still belong to the separate review flow.
      if(JSON.stringify(j.zones)!==JSON.stringify(original.zones)||check(j).length)continue;
      const key=signature(j);if(seen.has(key))continue;seen.add(key);evaluated++;
      const r=layout({...j,lockAnchors:true,lockZones:true,searchHobSides:true,planningChoice:choice},catalog,{fast:'packing'});
      if(betterFit(r,next.result)||(JSON.stringify(fitQuality(r))===JSON.stringify(fitQuality(next.result))&&movement(original,j)<movement(original,next.input)))next={input:j,result:r};
    }
    if(next===current)break;
    current=next;
    await new Promise(resolve=>setImmediate(resolve));
  }
  if(!current.result.problems.length&&betterFit(current.result,result)){
    const full=await planKitchen(current.input,catalog);
    if(!full.problems.length&&betterFit(full,result)){
      for(const wall of original.walls){
        const gap=r=>r.placed.tall.filter(p=>p.wall===wall.id&&p.role==='gap filler').reduce((n,p)=>n+p.width,0);
        const before=gap(result),after=gap(full);
        if(after<before)full.notes.push(`${wall.id}/tall: compared complete cabinet combinations; gap fillers reduced from ${before}mm to ${after}mm, recovering ${before-after}mm for cabinetry while preserving required panels and clearances`);
      }
      return {input:current.input,result:full,changes:fittingChanges(original,current.input),evaluated};
    }
  }
  return {input:clone(startInput),result,changes:fittingChanges(original,startInput),evaluated};
}

export async function fitKitchen(input,catalog,{maxEvaluations=4500,proposals=true,optimize=true,maxAnchorEvaluations=180}={}){
  const original=clone(input);
  const start=prepareAnchorInput(original);
  const result=await planKitchen(start,catalog);
  const search={version:1,evaluated:0,limit:maxEvaluations,complete:false};
  if(check(start).length)return {input:original,result,proposal:null,search};
  const improved=optimize?await optimizeAnchors(original,catalog,result,{limit:maxAnchorEvaluations,startInput:start}):{input:start,result,changes:fittingChanges(original,start),evaluated:0};
  search.anchorEvaluated=improved.evaluated;
  if(improved.changes.length)return {...improved,adjustments:improved.changes,proposal:null,search};
  if(!proposals||!result.problems.length)return {input:original,result,proposal:null,search};
  const context=planningContext(original,catalog);
  const preferredCodes=context.catalog.filter(c=>c.zone==='BC'&&c.family==='DW').map(c=>c.code);
  let best=null,refineUntil=maxEvaluations;
  const lemansCorners=context.corners.filter(k=>k.startsWith('base:'));
  searchCorners: for(const cornerLegs of cornerArrangements(context.corners))for(const lemansCorner of lemansCorners.length?lemansCorners:[undefined]){
    const choice={preferredCodes,cornerLegs,lemansCorner,preferStorage:true};
    const seen=new Set();
    const score=(j,r)=>[r.problems.length,movement(original,j)];
    const better=(a,b)=>a[0]<b[0]||a[0]===b[0]&&a[1]<b[1];
    const evaluate=j=>{
      if(search.evaluated>=Math.min(maxEvaluations,refineUntil)||check(j).length)return null;
      if(best&&movement(original,j)>movement(original,best.input))return null;
      const key=signature(j);if(seen.has(key))return null;seen.add(key);search.evaluated++;
      const r=layout({...j,lockAnchors:true,lockZones:true,searchHobSides:true,planningChoice:choice},catalog,{fast:'packing'});
      return {input:j,result:r,score:score(j,r)};
    };
    let current=evaluate(clone(original));
    if(!current)break;
    for(let round=0;round<6 && current.result.problems.length;round++){
      let next=current;
      for(const j of neighbours(original,current.input,catalog,current.result)){
        const trial=evaluate(j);if(trial&&better(trial.score,next.score))next=trial;
        if(search.evaluated>=Math.min(maxEvaluations,refineUntil))break;
      }
      if(next===current)break;current=next;
    }
    if(!current.result.problems.length && (!best||movement(original,current.input)<movement(original,best.input)
      || movement(original,current.input)===movement(original,best.input)&&storageMetrics(current.result,catalog).grossStorageLitres>storageMetrics(best.result,catalog).grossStorageLitres))best=current;
    if(best&&refineUntil===maxEvaluations){refineUntil=Math.min(maxEvaluations,search.evaluated+1000);search.termination='passing proposal refined within bounded search';}
    if(search.evaluated>=Math.min(maxEvaluations,refineUntil))break searchCorners;
    // Yield between bounded batches so the HTTP server can serve other requests.
    await new Promise(resolve=>setImmediate(resolve));
  }
  search.complete=!best&&search.evaluated<maxEvaluations;
  if(!best)return {input:original,result,proposal:null,search};
  // Same full search and validation as any live build. The fast search only
  // nominates inputs; it never supplies the returned cabinet layout.
  const fitted=await planKitchen(best.input,catalog);
  if(fitted.problems.length)return {input:original,result,proposal:null,search};
  return {input:original,result,search,proposal:{input:best.input,result:fitted,changes:fittingChanges(original,best.input)}};
}
