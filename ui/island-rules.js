// Shared millimetre geometry for browser previews and server validation.
// All numerical policy comes from rules.json, supplied as `rules`.
(function(root){
  const sides=['north','east','south','west'];
  const finite=v=>Number.isFinite(v);
  const presets=r=>[
    {id:'storage',label:'Storage only',width:r.cabinet_depth,rows:1,seatSides:[]},
    {id:'seating',label:'Seating only',width:r.seating_only_depth,rows:0,seatSides:['north','south']},
    {id:'mixed',label:'Seating + storage',width:r.cabinet_depth+r.seating_overhang,rows:1,seatSides:['south']},
    {id:'double',label:'Double storage',width:2*r.cabinet_depth,rows:2,seatSides:[]}
  ];
  const profile=(i,r)=>presets(r).find(p=>p.id===(i.rows===0?'seating':i.rows===2?'double':i.seatSides?.length?'mixed':'storage'));
  function shape(i,r){
    const seats=new Set(i.seatSides||[]),end=i.endPanel||0,front=i.frontProjection??r.countertop_end_overhang??0; // countertop lip past the cabinets at each end
    const left=-end-front,right=i.length+end+front,top=0,bottom=profile(i,r).width;
    const length=right-left,depth=bottom-top,angle=((i.rotation||0)%360+360)%360,turn=angle/90;
    const width=turn%2?depth:length,height=turn%2?length:depth;
    return {left,right,top,bottom,length,depth,width,height,angle,
      x0:i.x-width/2,x1:i.x+width/2,y0:i.y-height/2,y1:i.y+height/2,
      seating:sides.filter(s=>seats.has(s)).map(s=>sides[(sides.indexOf(s)+turn)%4]),
      working:(i.rows===0?[]:i.rows===2?['north','south']:['north']).map(s=>sides[(sides.indexOf(s)+turn)%4])};
  }
  function point(i,r,x,y){
    const b=shape(i,r),a=b.angle*Math.PI/180,dx=x-(b.left+b.right)/2,dy=y-(b.top+b.bottom)/2;
    return [i.x+dx*Math.cos(a)-dy*Math.sin(a),i.y+dx*Math.sin(a)+dy*Math.cos(a)];
  }
  function seatCounts(i,r){
    const b=shape(i,r),chosen=i.seatSides||[],out={};
    for(const side of chosen){
      const horizontal=side==='north'||side==='south';
      // Each perpendicular seated side loses an overhang-width corner at both ends.
      const adjacent=horizontal?['east','west']:['north','south'];
      const usable=(horizontal?b.length:b.depth)-adjacent.filter(s=>chosen.includes(s)).length*r.seating_overhang-(i.seatObstructions?.[side]||0);
      out[side]=Math.max(0,Math.floor(usable/r.seat_width));
    }
    return out;
  }
  function check(context,i,r,{services=true,positionMargin=0}={}){
    const problems=[],unresolved=[],clearances=Object.fromEntries(sides.map(s=>[s,{actual:null,required:r?.walkway??0}]));
    if(!i)return {valid:true,problems,unresolved,clearances,seats:{}};
    if(!r)return {valid:false,problems:['Island rules are not loaded.'],unresolved,clearances,seats:{}};
    if(![i.x,i.y,i.length].every(finite)||!Number.isSafeInteger(i.length)||![0,1,2].includes(i.rows)||![0,90,180,270].includes(i.rotation??0)
      || !Array.isArray(i.seatSides||[]) || (i.seatSides||[]).some(s=>!sides.includes(s))
      || new Set(i.seatSides||[]).size!==(i.seatSides||[]).length
      || ['endPanel','backPanel','frontProjection'].some(k=>i[k]!=null&&(!finite(i[k])||i[k]<0))
      || !Array.isArray(i.fixtures||[]) || (i.fixtures||[]).some(f=>!f||!['hob','sink','veggie'].includes(f.type)||!Number.isSafeInteger(f.at)||f.at<0||!Number.isSafeInteger(f.width)||f.width<=0||!Number.isInteger(f.row)||f.row<0||f.row>=i.rows)
      || Object.values(i.seatObstructions||{}).some(v=>!finite(v)||v<0))
      return {valid:false,problems:['Island dimensions, seating sides and rotation must be valid millimetre values.'],unresolved,clearances,seats:{}};
    const b=shape(i,r);
    // Inflate the whole footprint to certify every centre inside a shaded cell.
    b.x0-=positionMargin;b.x1+=positionMargin;b.y0-=positionMargin;b.y1+=positionMargin;
    if(i.length<r.minimum_length||b.depth<r.minimum_depth)problems.push(`Island must be at least ${r.minimum_length} × ${r.minimum_depth} mm.`);
    if(!context.ready)problems.push('Draw cabinet zones and place the hob, main sink and fridge before confirming an island.');
    if(i.rows>0&&(i.seatSides||[]).some(s=>i.rows===2||s!=='south'))
      problems.push('Choose 600 mm storage only, 976 mm storage with back seating, or 1200 mm double storage. Use 900 mm for seating only.');
    if(i.rows===0&&!(i.seatSides||[]).length)problems.push('Choose at least one seating edge for the 900 mm seating-only island.');
    if(!root.KitchenGeometry.containsRect(b,context.walls))problems.push('Island footprint is outside the room.');
    const minimum={x0:b.x0-r.walkway,x1:b.x1+r.walkway,y0:b.y0-r.walkway,y1:b.y1+r.walkway};
    if(!root.KitchenGeometry.containsRect(minimum,context.walls))problems.push(`Island needs ${r.walkway} mm walking space inside the room on every side.`);
    for(const side of b.working)clearances[side].required=r.working_aisle;
    for(const side of b.seating)clearances[side].required=Math.max(clearances[side].required,r.seating_clearance);
    const obstacles=[...(context.obstacles||[]),...context.walls.map(w=>({x0:Math.min(w.a[0],w.b[0]),x1:Math.max(w.a[0],w.b[0]),y0:Math.min(w.a[1],w.b[1]),y1:Math.max(w.a[1],w.b[1]),kind:'wall',label:'wall',clearance:r.walkway}))];
    for(const o of obstacles){
      const dx=Math.max(o.x0-b.x1,b.x0-o.x1,0),dy=Math.max(o.y0-b.y1,b.y0-o.y1,0),distance=Math.hypot(dx,dy);
      const facing=[];
      if(o.x0>=b.x1)facing.push('east');if(o.x1<=b.x0)facing.push('west');
      if(o.y0>=b.y1)facing.push('south');if(o.y1<=b.y0)facing.push('north');
      // A moving centre can cross an obstacle's corner within one cell. Use
      // every side it could face there, not only the inflated rectangle's sides.
      const possible=[...(o.x0>=b.x1-2*positionMargin?['east']:[]),...(o.x1<=b.x0+2*positionMargin?['west']:[]),
        ...(o.y0>=b.y1-2*positionMargin?['south']:[]),...(o.y1<=b.y0+2*positionMargin?['north']:[])];
      const required=Math.max(o.clearance??r.working_aisle,...possible.map(s=>Math.max(b.seating.includes(s)?r.seating_clearance:0,b.working.includes(s)?r.working_aisle:0)));
      const aligned=facing.filter(s=>(s==='east'||s==='west')?dy===0:dx===0);
      for(const s of aligned){
        const actual=Math.round(s==='east'||s==='west'?dx:dy),c=clearances[s];
        if(c.actual==null||actual<c.actual)c.actual=actual;
        c.required=Math.max(c.required,required);
      }
      if(root.KitchenGeometry.intersects(b,o))problems.push(`Island overlaps ${o.label||o.kind}.`);
      else if(distance+.01<required)problems.push(`${facing.join('/')||'Footprint'}: ${Math.round(distance)} mm clear of ${o.label||o.kind}; ${required} mm required.`);
      if(o.openBox&&root.KitchenGeometry.intersects(b,o.openBox))problems.push(`Island obstructs the opening space of ${o.label}.`);
    }
    const seats=seatCounts(i,r);
    for(const [side,count] of Object.entries(seats))if(!count)problems.push(`${side} seating has less than ${r.seat_width} mm usable width after corner/support exclusions.`);
    if(services){
      // the standard end lip needs no support check; only a longer projection does
      const overhang=Math.max((i.seatSides||[]).length?r.seating_overhang:0,(i.frontProjection??0)>(r.countertop_end_overhang??0)?i.frontProjection:0);
      if(overhang>0&&(!i.support?.confirmed||!String(i.support?.material||'').trim()||!finite(i.support?.approvedOverhang)||i.support.approvedOverhang<overhang))
        unresolved.push(`Verify the countertop material and support for the ${overhang} mm overhang while keeping knee space clear.`);
      if(i.rows===0&&(!i.support?.confirmed||!String(i.support?.material||'').trim()))
        unresolved.push('Verify the seating-only tabletop and its supporting frame or legs; keep the selected seating edges clear.');
      if((i.fixtures||[]).some(f=>f.type==='sink'||f.type==='veggie')&&!i.plumbingConfirmed)
        unresolved.push('Confirm water and drainage routing for the island sink arrangement.');
      if((i.fixtures||[]).some(f=>f.type==='hob')&&!i.hobInstallation?.confirmed)
        unresolved.push('Confirm the selected hob installation clearances and extraction arrangement.');
    }
    return {valid:problems.length===0,problems:[...new Set(problems)],unresolved,clearances,seats,footprint:b};
  }
  function candidates(context,template,r,lengths,rotations=[0,90],variants=presets(r)){
    if(!context.ready||!context.walls.length)return [];
    const xs=context.walls.flatMap(w=>[w.a[0],w.b[0]]),ys=context.walls.flatMap(w=>[w.a[1],w.b[1]]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2,out=[];
    for(const length of lengths)for(const variant of variants)for(const rotation of rotations){
      const {rows,seatSides}=variant;
      if(template.fixtures?.some(f=>f.row>=rows))continue;
      const i={...template,length,rows,seatSides,rotation,x:cx,y:cy},b=shape(i,r),hx=b.width/2,hy=b.height/2;
      const clearance=s=>Math.max(r.walkway,b.working.includes(s)?r.working_aisle:0,b.seating.includes(s)?r.seating_clearance:0);
      const xx=new Set([cx,minX+clearance('west')+hx,maxX-clearance('east')-hx]),yy=new Set([cy,minY+clearance('north')+hy,maxY-clearance('south')-hy]);
      for(const o of context.obstacles||[]){const gap=Math.max(o.clearance??r.working_aisle,r.seating_clearance);
        xx.add(o.x0-gap-hx);xx.add(o.x1+gap+hx);yy.add(o.y0-gap-hy);yy.add(o.y1+gap+hy);
        xx.add(o.x0-r.working_aisle-hx);xx.add(o.x1+r.working_aisle+hx);yy.add(o.y0-r.working_aisle-hy);yy.add(o.y1+r.working_aisle+hy);
      }
      let best=null;
      for(const x of xx)for(const y of yy){
        if(x-hx<minX||x+hx>maxX||y-hy<minY||y+hy>maxY)continue;
        const selected={...i,x:Math.round(x),y:Math.round(y)},v=check(context,selected,r,{services:false});
        if(!v.valid)continue;
        const score=Math.hypot(x-cx,y-cy);
        if(!best||score<best.score)best={...selected,score,validation:v};
      }
      if(best)out.push(best);
    }
    // Keep varied sizes; recommend a useful prep/storage footprint, not the maximum area.
    return out.sort((a,b)=>Math.abs(a.length-1800)+Math.abs(a.rows*600-1200)-Math.abs(b.length-1800)-Math.abs(b.rows*600-1200)||a.score-b.score);
  }
  function placementArea(context,i,r){
    if(!context.ready||!context.walls.length)return {cells:[],points:[]};
    const xs=context.walls.flatMap(w=>[w.a[0],w.b[0]]),ys=context.walls.flatMap(w=>[w.a[1],w.b[1]]);
    const b=shape(i,r),x0=Math.min(...xs)+b.width/2+r.walkway,x1=Math.max(...xs)-b.width/2-r.walkway;
    const y0=Math.min(...ys)+b.height/2+r.walkway,y1=Math.max(...ys)-b.height/2-r.walkway;
    const step=Math.max(25,Math.ceil(Math.max(x1-x0,y1-y0)/90)),cells=[],points=[];
    for(let y=y0;y+step<=y1;y+=step){let run=null;
      for(let x=x0;x+step<=x1;x+=step){
        const valid=check(context,{...i,x:x+step/2,y:y+step/2},r,{services:false,positionMargin:step/2}).valid;
        if(valid){if(run)run.x1=x+step;else run={x0:x,x1:x+step,y0:y,y1:y+step};}
        else if(run){cells.push(run);run=null;}
      }
      if(run)cells.push(run);
    }
    // Exact-fit rooms can have an allowed line or point, with no full cell.
    for(const p of [i,...candidates(context,i,r,[i.length],[i.rotation||0],[i])])
      if(check(context,p,r,{services:false}).valid)points.push({x:p.x,y:p.y});
    return {cells,points};
  }
  function moveWithin(context,i,r,target){
    const ok=p=>check(context,p,r,{services:false}).valid, at=(x,y)=>({...i,x:Math.round(x),y:Math.round(y)});
    const requested=at(target.x,target.y),validation=check(context,requested,r,{services:false});
    if(validation.valid)return {position:requested,blocked:false,validation};
    if(!ok(i))return {position:i,blocked:true,validation};
    // Advance until the first boundary, then bisect onto it, keeping the last legal position.
    const walk=(from,to)=>{
      let accepted=from;
      const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/40));
      for(let n=1;n<=steps;n++){
        const p=at(from.x+(to.x-from.x)*n/steps,from.y+(to.y-from.y)*n/steps);
        if(!ok(p)){
          let lo=0,hi=1;const start=accepted;
          for(let k=0;k<12;k++){const f=(lo+hi)/2,q=at(start.x+(p.x-start.x)*f,start.y+(p.y-start.y)*f);
            if(ok(q)){accepted=q;lo=f;}else hi=f;}
          return accepted;
        }
        accepted=p;
      }
      return accepted;
    };
    // Straight at the target first, then each axis alone: a diagonal drag into a wall
    // slides along it instead of stopping dead the moment the direct path is blocked.
    let accepted=walk(i,requested);
    accepted=walk(accepted,at(target.x,accepted.y));
    accepted=walk(accepted,at(accepted.x,target.y));
    return {position:accepted,blocked:true,validation};
  }
  function recommendations(options,r,rotation=0,length=1800){
    const groups=new Map();
    for(const [index,o]of options.entries()){
      const key=[o.length,o.rows,[...(o.seatSides||[])].sort().join(',')].join(':');
      const prev=groups.get(key),rank=x=>(x.rotation===rotation?0:1)+(x.score||0)/1e6;
      if(!prev||rank(o)<rank(prev.option))groups.set(key,{option:o,index});
    }
    const out=[];
    for(const preset of presets(r)){
      const offered=[...groups.values()].filter(v=>profile(v.option,r).id===preset.id).sort((a,b)=>Math.abs(a.option.length-length)-Math.abs(b.option.length-length));
      if(!offered.length)continue;
      out.push({...offered[0],label:preset.label});
    }
    return out;
  }
  function stools(i,r){
    const b=shape(i,r),out=[];
    for(const [side,count] of Object.entries(seatCounts(i,r)))for(let k=0;k<count;k++){
      const horizontal=side==='north'||side==='south',along=(k-(count-1)/2)*r.seat_width;
      // The seat centre lies on the finished edge: exactly half is under the top.
      out.push({side,width:320,depth:320,
        x:horizontal?(b.left+b.right)/2+along:side==='west'?b.left:b.right,
        y:horizontal?(side==='north'?b.top:b.bottom):(b.top+b.bottom)/2+along});
    }
    return out;
  }
  function svg(i,r,t,{invalid=false,interactive=false,labels=true,modules:showModules=true}={}){
    if(!i||!r||![i.x,i.y,i.length].every(finite))return '';
    // modules:false — the Design screen: the island's type and size only. Cabinet modules,
    // their widths and even indicative seams stay hidden until Generate Design picks them.
    if(!showModules)i={...i,working:[]};
    const b=shape(i,r),sc=t.sc,a=b.angle;
    let g=`<g transform="translate(${t.X(i.x)},${t.Y(i.y)}) rotate(${a})" ${interactive?'data-island="true" style="cursor:move"':''}>`;
    const lx=x=>(x-(b.left+b.right)/2)*sc,ly=y=>(y-(b.top+b.bottom)/2)*sc;
    // Seats are behind the opaque countertop, so only their outer halves show.
    for(const seat of stools(i,r)){
      const x=lx(seat.x)-seat.width*sc/2,y=ly(seat.y)-seat.depth*sc/2,w=seat.width*sc,h=seat.depth*sc;
      g+=`<g data-island-stool="${seat.side}"><rect x="${x+.7}" y="${y+1.2}" width="${w}" height="${h}" rx="${65*sc}" fill="#392e23" opacity=".12"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${65*sc}" fill="#bfa58a" stroke="#806d59" stroke-width=".65"/><rect x="${x+25*sc}" y="${y+25*sc}" width="${w-50*sc}" height="${h-50*sc}" rx="${45*sc}" fill="#d0b99e" stroke="#e2cfb7" stroke-width=".35"/></g>`;
    }
    // Drawn in the same language as the wall runs: pale carcass, dark outline, front line on the
    // opening side, plan cabinet descriptions and red dimensions. The countertop is one square
    // slab over everything, so overhangs and seating edges read as countertop, not cabinet.
    const ink='#35332f',red='#a54139',hair='stroke-width=".75" vector-effect="non-scaling-stroke"';
    const left=lx(b.left),top=ly(b.top),w=b.length*sc,h=b.depth*sc;
    const slab=`x="${left}" y="${top}" width="${w}" height="${h}"`;
    g+=`<rect data-island-countertop="true" ${slab} fill="${invalid?'#fbe3df':'#fbfaf7'}" stroke="none"/>`;
    // Text stays upright when the island is turned upside down (same rule as the wall runs).
    const upright=(x,y)=>a===180?` transform="rotate(180 ${x} ${y})"`:'';
    const txt=(x,y,s,size,fill,extra='')=>`<text x="${x}" y="${y+size*.35}" text-anchor="middle" font-size="${size}" fill="${fill}" pointer-events="none"${upright(x,y)} ${extra}>${s}</text>`;
    const describe=m=>root.DetailedPlan?.description?root.DetailedPlan.description({...m,veggie:m.label==='veggie sink'},'base'):[m.label];
    const wrap=(lines,wd,fs,max)=>root.DetailedPlan?.wrapLabel?root.DetailedPlan.wrapLabel(lines,wd,fs,max):lines.slice(0,max);
    const dims=[];
    for(let row=0;row<i.rows;row++){
      const modules=(i.working||[]).filter(m=>m.row===row),open=row===0?-1:1; // row 0 opens north, row 1 south
      // rows sit back to back on the island's centre line; the countertop overhangs each front
      const back=ly(r.cabinet_depth);
      if(!modules.length){ // preview before assembly: one carcass band with indicative 600 mm seams
        const d=560*sc,y=open<0?back-d:back;
        g+=`<rect data-island-storage="true" x="${lx(0)}" y="${y}" width="${i.length*sc}" height="${d}" fill="#f7f6f2" stroke="${ink}" ${hair}/>`;
        if(showModules)for(let at=600;at<i.length;at+=600)g+=`<line x1="${lx(at)}" x2="${lx(at)}" y1="${y}" y2="${y+d}" stroke="${ink}" stroke-width=".4" stroke-dasharray="2 2"/>`;
        continue;
      }
      for(const m of modules){
        const x=lx(m.at),mw=m.width*sc,d=(m.depth||560)*sc,y=open<0?back-d:back,filler=m.kind==='filler';
        g+=`<rect class="island-mod" data-island-module="${m.row}:${m.at}" x="${x}" y="${y}" width="${mw}" height="${d}" fill="${filler?'#ebe6dc':'#f7f6f2'}" stroke="${ink}" ${hair} ${filler?'stroke-dasharray="2 1.5"':''}><title>${describe(m).join(' · ')} · ${m.width} × ${m.height||720} × ${m.depth||560} mm\n${m.code||'Custom finishing piece'}</title></rect>`;
        if(filler)continue;
        const fy=open<0?y+2:y+d-2;
        g+=`<line x1="${x+1}" x2="${x+mw-1}" y1="${fy}" y2="${fy}" stroke="${ink}" stroke-width=".55" vector-effect="non-scaling-stroke"/>`;
        const cx=x+mw/2;
        if(['hob','sink','veggie sink'].includes(m.label)&&mw>20){ // same symbols as the wall runs
          const sy=y+d*(open<0?.72:.28);
          g+=m.label==='hob'?[-5,5].map(dx=>`<circle cx="${cx+dx}" cy="${sy}" r="3.2" fill="none" stroke="#555" stroke-width=".55"/>`).join('')
            :`<rect x="${cx-8}" y="${sy-4}" width="16" height="8" rx="2" fill="none" stroke="#555" stroke-width=".55"/>`;
        }
        if(mw>15){
          const fs=4.5,cy=['hob','sink','veggie sink'].includes(m.label)?y+d*(open<0?.35:.65):y+d/2;
          const lines=wrap(describe(m),Math.max(8,mw-4),fs,Math.max(1,Math.min(3,Math.floor((d-4)/(fs+1)))));
          lines.forEach((l,j)=>g+=txt(cx,cy+(j-(lines.length-1)/2)*(fs+1),l,fs,ink));
        }
      }
      dims.push({y:open<0?ly(b.top)-8:ly(b.bottom)+8,dir:open,from:open<0?ly(b.top):ly(b.bottom),modules});
    }
    // full countertop edge on top of the cabinets
    g+=`<rect ${slab} fill="none" stroke="${invalid?'#b4533a':ink}" ${hair}/>`;
    const red_=`stroke="${red}" stroke-width=".55" vector-effect="non-scaling-stroke"`;
    const dim=(x0,x1,y,from,label,dir,lane=0)=>`<g class="plan-dimension" pointer-events="none"><line x1="${x0}" x2="${x0}" y1="${from}" y2="${y-dir*2}" ${red_}/><line x1="${x1}" x2="${x1}" y1="${from}" y2="${y-dir*2}" ${red_}/><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" ${red_}/>`
      +[x0,x1].map(x=>`<line x1="${x-1}" x2="${x+1}" y1="${y+1.5}" y2="${y-1.5}" ${red_}/>`).join('')
      +txt((x0+x1)/2,y+dir*(3+lane*5),label,lane?3.7:4.2,red,'paint-order="stroke" stroke="#fff" stroke-width="1"')+'</g>';
    // countertop overhang past each end of the cabinet row, shown and hoverable like a module
    const lip=-b.left,ends=lip>0?[{at:-lip,width:lip,label:'Countertop overhang'},{at:i.length,width:b.right-i.length,label:'Countertop overhang'}]:[];
    for(const e of ends)g+=`<rect data-island-overhang="true" x="${lx(e.at)}" y="${top}" width="${e.width*sc}" height="${h}" fill="transparent"><title>${e.label} · ${e.width} mm past the cabinets</title></rect>`;
    for(const d of dims){
      let lastEnd=-Infinity,lane=0;
      for(const m of [ends[0],...d.modules,ends[1]].filter(Boolean)){
        const x0=lx(m.at),x1=lx(m.at+m.width),label=String(m.width),half=label.length*1.2+1,cx=(x0+x1)/2;
        // narrow modules (fillers) step out to a second lane so values never overlap
        lane=cx-half<lastEnd?lane+1:0; lastEnd=cx+half;
        g+=dim(x0,x1,d.y,d.from,label,d.dir,lane);
      }
    }
    if(dims.length){ // overall island length, one lane further out from the first chain
      const d=dims[0];
      g+=dim(lx(b.left),lx(b.right),d.y+d.dir*16,d.from,`ISLAND ${b.length} × ${b.depth} mm`,d.dir);
    }
    if(labels&&!dims.length)g+=txt(0,-4,'ISLAND',6,ink)+txt(0,5,`${b.length} × ${b.depth} mm`,5,ink);
    g+='</g>';
    return g;
  }
  root.IslandRules={presets,profile,shape,point,seatCounts,stools,check,candidates,placementArea,moveWithin,recommendations,svg,sides};
})(globalThis);
