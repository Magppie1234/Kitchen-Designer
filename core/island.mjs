import '../ui/geometry.js';
import '../ui/island-rules.js';
import {outline} from './checkInput.mjs';
import {RULE_PARAMS as P} from './config.mjs';

export const islandRules=P.island;
const role=t=>t==='veggie'?'veggie sink':t;
export function islandContext(input,placed){
  const walls=(outline(input.walls)?.walls||[]).map(w=>({...w,a:[w.x0,w.y0],b:[w.x1,w.y1]}));
  const obstacles=[],add=(wall,at,width,depth,label,clearance=P.island.working_aisle,openDepth=0)=>{
    const w=walls.find(w=>w.id===wall);if(!w)return;
    const box=KitchenGeometry.footprint(w,walls,at,width,depth);
    obstacles.push({...box,label,clearance,...(openDepth?{openBox:KitchenGeometry.footprint(w,walls,at,width,depth+openDepth)}:{})});
  };
  for(const tier of ['base','tall'])for(const z of input.zones?.[tier]||[])
    add(z.wall,z.from,z.to-z.from,Math.max(600,z.depth||0),`${tier} cabinets on ${z.wall}`);
  for(const a of input.anchors||[])if(a.location!=='island')add(a.wall,a.at,a.width,Math.max(600,a.depth||0),a.item,P.island.working_aisle,a.openDepth||P.island.default_open_depth);
  if(placed)for(const tier of ['base','tall'])for(const p of placed[tier]||[])if(!p.blocker)
    add(p.wall,p.at,p.width,Math.max(600,(p.depth||560)+(p.offset||0)),p.role,P.island.working_aisle,p.openDepth||P.island.default_open_depth);
  for(const o of input.openings||[])if(o.type==='door')add(o.wall,o.at,o.width,o.width,'door swing',0);
  for(const c of input.columns||[])add(c.wall,c.at,c.width,c.depth||600,'column',P.island.walkway);
  for(const s of input.structures||[])if(s.z0<(P.counter_height||850))obstacles.push({...s,label:s.type||'structure',clearance:P.island.walkway});
  return {walls,obstacles,ready:input.drawnZones===true&&['hob','sink','fridge'].every(t=>input.anchors?.some(a=>a.item===t))};
}
const pack=(length,units)=>{
  if(!Number.isSafeInteger(length)||length<0||!units.length)return length===0?[]:null;
  const gcd=(a,b)=>b?gcd(b,a%b):a,step=units.reduce((n,u)=>gcd(n,u.width),0),limit=Math.floor(length/step);
  const dp=new Map([[0,{count:0}]]);let best=0;
  for(let x=0;x<=limit;x++)if(dp.has(x)){
    best=x;
    for(const u of units){const to=x+u.width/step,count=dp.get(x).count+1;
      if(to<=limit&&(!dp.has(to)||dp.get(to).count>count))dp.set(to,{count,from:x,unit:u});}
  }
  const pieces=[];for(let x=best;x>0;x=dp.get(x).from)pieces.unshift(dp.get(x).unit);
  const remainder=length-best*step;
  if(remainder)pieces.push({family:'closure',width:remainder,height:720,depth:P.island.cabinet_depth,code:null});
  return pieces;
};
export function assembleIsland(input,cat,{grainElsewhere=true}={}){
  const i=input.island;if(!i)return null;
  const r=P.island,problems=[],unresolved=[],working=[];
  if(!Number.isSafeInteger(i.length)||i.length<r.minimum_length||i.length>Math.max(...input.walls.map(w=>w.length)))
    return {...i,working,problems:['Island length must fit the room and meet the minimum length.'],unresolved,rules:r};
  const units=cat.filter(c=>c.zone==='BC'&&c.handle===input.handle&&c.depth<=600&&c.height===720);
  const plain=units.filter(c=>['SH','DW'].includes(c.family)).sort((a,b)=>b.width-a.width||((a.family==='DW')?-1:1));
  const dedup=plain.filter((u,n)=>plain.findIndex(c=>c.width===u.width)===n);
  const add=(row,at,c,label,extra={})=>{
    if(!c){problems.push(`No eligible island cabinet for ${label}.`);return;}
    if(!Number.isSafeInteger(at)||at<0||at+c.width>i.length||working.some(m=>m.row===row&&Math.min(m.at+m.width,at+c.width)>Math.max(m.at,at))){problems.push(`${label} does not fit its island row at ${at} mm.`);return;}
    working.push({kind:c.family==='closure'?'filler':['hob','sink','veggie sink'].includes(label)?'anchor':'cabinet',label,role:label,at,x0:at,row,width:c.width,height:c.height,depth:c.depth,code:c.code,...extra});
  };
  const free=(row,at,w)=>at>=0&&at+w<=i.length&&!working.some(m=>m.row===row&&Math.min(m.at+m.width,at+w)>Math.max(m.at,at));
  const fixtures=i.fixtures||[];
  if(!Array.isArray(fixtures))return {problems:['Island fixtures must be a list.'],unresolved,working:[]};
  if(fixtures.some(f=>!f||typeof f!=='object'))return {problems:['Island fixtures must be valid objects.'],unresolved,working:[]};
  if(fixtures.length>3||new Set(fixtures.map(f=>f.type)).size!==fixtures.length)problems.push('Choose at most one of each island fixture.');
  for(const f of fixtures){
    if(!['hob','sink','veggie'].includes(f.type)||!Number.isInteger(f.row)||f.row<0||f.row>=i.rows){problems.push('Invalid island fixture type or storage row.');continue;}
    const anchor=input.anchors.find(a=>a.item===f.type&&a.location==='island');
    if(!anchor){problems.push(`The ${f.type} must be explicitly assigned to the island.`);continue;}
    const c=units.find(c=>c.family===(f.type==='hob'?'HO':'SK')&&c.width===f.width&&(!anchor.design||c.spec.join('+')===anchor.design));
    add(f.row,f.at,c,role(f.type));
  }
  const hob=fixtures.find(f=>f.type==='hob');
  if(hob){
    const a=input.anchors.find(a=>a.item==='hob'),flanks=a?.flanks||{};
    for(const side of ['left','right'])if(flanks[side]){
      const [family,spec]=flanks[side].split(':');
      const offered=units.filter(c=>c.family===family&&c.spec.join('+')===spec).sort((a,b)=>b.width-a.width);
      const c=offered.find(c=>free(hob.row,side==='left'?hob.at-c.width:hob.at+hob.width,c.width));
      const label=family==='GD'?'grain trolley':family==='AC'&&spec==='BPO'?'bottle pullout':'drawers';
      add(hob.row,side==='left'?hob.at-(c?.width||0):hob.at+hob.width,c,label,{designerChoice:true});
    }
    // Try storage combinations against the remaining module gaps before committing.
    // A narrow pullout that strands an unfillable gap must not hide a buildable choice.
    const unique=items=>items.filter((c,n)=>items.findIndex(x=>x.width===c.width)===n);
    const packed=new Map(),canPack=n=>{if(!packed.has(n))packed.set(n,!!pack(n,dedup));return packed.get(n);};
    const complete=()=>{
      for(let row=0;row<i.rows;row++){
        let end=0;
        for(const m of [...working.filter(m=>m.row===row).sort((a,b)=>a.at-b.at),{at:i.length,width:0}]){
          if(m.at>end&&!canPack(m.at-end))return false;
          end=Math.max(end,m.at+m.width);
        }
      }
      return true;
    };
    const adjacent=working.filter(m=>m.row===hob.row&&(m.at+m.width===hob.at||m.at===hob.at+hob.width));
    const ends=[hob.at,hob.at+hob.width,...adjacent.flatMap(m=>[m.at,m.at+m.width])];
    const needBottle=!working.some(m=>m.label==='bottle pullout'),needGrain=!grainElsewhere&&!working.some(m=>m.label==='grain trolley');
    const bottles=needBottle?unique(units.filter(c=>c.family==='AC'&&c.spec.includes('BPO')).sort((a,b)=>a.width-b.width))
      .flatMap(c=>[...new Set(ends.flatMap(e=>[e-c.width,e]))].map(at=>({c,row:hob.row,at,label:'bottle pullout'}))):[null];
    const grains=needGrain?unique(units.filter(c=>c.family==='GD').sort((a,b)=>a.width-b.width)):[null];
    const initial=working.length;let selected=null;
    for(const bottle of bottles){
      working.length=initial;
      if(bottle){if(!free(bottle.row,bottle.at,bottle.c.width))continue;add(bottle.row,bottle.at,bottle.c,bottle.label);}
      const afterBottle=working.length;
      if(!needGrain&&complete()){selected={bottle,grain:null};break;}
      if(needGrain)for(const c of grains){
        for(let row=0;row<i.rows&&!selected;row++)for(let at=0;at+c.width<=i.length&&!selected;at+=150){
          working.length=afterBottle;if(!free(row,at,c.width))continue;add(row,at,c,'grain trolley');
          if(complete())selected={bottle,grain:{c,row,at}};
        }
        if(selected)break;
      }
      if(selected)break;
    }
    working.length=initial;
    if(selected){
      if(selected.bottle){const b=selected.bottle;add(b.row,b.at,b.c,b.label);}
      if(selected.grain){const g=selected.grain;add(g.row,g.at,g.c,'grain trolley');}
    }else if(needBottle||needGrain)problems.push('Required hob storage and the remaining island gaps cannot be packed with eligible modules. Adjust the hob offset, island length or cabinet arrangement.');
    const h=i.hobInstallation||{};
    if(h.confirmed){
      if(!['left','right','rear','cutoutDepth'].every(k=>Number.isFinite(h[k])&&h[k]>=0)||!h.extraction)
        unresolved.push('Enter verified hob side/rear clearances, cutout depth and extraction arrangement.');
      else{
        const b=IslandRules.shape(i,r);
        if(hob.at-b.left<h.left||b.right-hob.at-hob.width<h.right)problems.push('Island hob side landing areas do not meet its verified installation requirements.');
        const behind=i.rows*r.cabinet_depth-h.cutoutDepth+(hob.row===0?b.bottom-i.rows*r.cabinet_depth:-b.top);
        if(h.cutoutDepth>r.cabinet_depth||behind<h.rear)problems.push('Island depth does not provide the verified hob cutout and rear clearance.');
      }
    }
  }
  for(const f of fixtures.filter(f=>f.type==='sink'||f.type==='veggie')){
    if(hob){const gap=Math.hypot(Math.max(f.at-hob.at-hob.width,hob.at-f.at-f.width,0),Math.max(0,Math.abs(f.row-hob.row)-1)*r.cabinet_depth);
      if(gap<r.hob_sink_gap)problems.push(`Island hob and ${f.type} need ${r.hob_sink_gap} mm separation; found ${gap} mm.`);}
    if(!i.prepConfirmed)unresolved.push('Confirm usable preparation and landing space beside the island sink.');
  }
  for(let row=0;row<i.rows;row++){
    const fixed=working.filter(m=>m.row===row).sort((a,b)=>a.at-b.at);let cursor=0;
    for(const m of [...fixed,{at:i.length,width:0}]){
      if(m.at>cursor){const pieces=pack(m.at-cursor,dedup);
        if(!pieces)problems.push(`The ${m.at-cursor} mm island gap cannot be filled with eligible cabinet modules.`);
        else for(const c of pieces){add(row,cursor,c,c.family==='closure'?'closure panel':c.family==='DW'?'drawers':'shutter');cursor+=c.width;}}
      cursor=Math.max(cursor,m.at+m.width);
    }
  }
  const footprint=IslandRules.shape(i,r);
  if(i.rows===1&&(i.backPanel||0)+Math.max(0,...working.map(m=>m.kind==='filler'?0:m.depth))>r.cabinet_depth)
    problems.push('The cabinet and back panel must stay inside the fixed 600 mm storage depth.');
  return {...structuredClone(i),footprint,total:footprint.length,depth:footprint.depth,working:working.sort((a,b)=>a.row-b.row||a.at-b.at),
    finishedBacks:i.rows>0,finishedEnds:true,seatingOnly:i.rows===0,problems:[...new Set(problems)],unresolved:[...new Set(unresolved)],rules:r};
}
export function validateIsland(input,cat,placed){
  if(!input.island)return null;
  const validation=IslandRules.check(islandContext(input,placed),input.island,P.island);
  if(!validation.footprint)return {...input.island,working:[],rules:P.island,...validation};
  const built=assembleIsland(input,cat,{grainElsewhere:!placed||!!placed.base?.some(m=>m.role==='grain trolley'&&!m.blocker)});
  return {...built,validation,problems:[...validation.problems,...built.problems],unresolved:[...validation.unresolved,...built.unresolved]};
}
export function suggestIslands(input,cat,template={}){
  const context=islandContext(input),max=Math.max(...input.walls.map(w=>w.length),0)-2*P.island.walkway;
  // These are starting suggestions, not length restrictions. A typed length is
  // checked directly against the room and assembled with cut-to-size closures.
  const lengths=[...new Set([1200,1800,2400,template.length])].filter(n=>Number.isSafeInteger(n)&&n>=P.island.minimum_length&&n<=max).sort((a,b)=>a-b);
  const draft={seatSides:[],fixtures:[],...template};
  const validDraft=Array.isArray(draft.fixtures)&&draft.fixtures.every(f=>f&&typeof f==='object')&&Array.isArray(draft.seatSides);
  const candidates=validDraft?IslandRules.candidates(context,draft,P.island,lengths):[];
  const options=[];
  for(const c of candidates){const built=assembleIsland({...input,island:c},cat);if(!built.problems.length)options.push({...c,working:built.working});}
  const selected=input.island?validateIsland(input,cat):null;
  return {rules:P.island,context,options,selected,ready:context.ready,
    reason:!context.ready?'Draw cabinet zones and place the core fixtures first.':!options.length?'No buildable island fits the current zones, openings and selected features.':null};
}
