// Backsplash: where stone may sit on a wall's elevation, its 8×4 ft cut pieces and its billed area.
// A region is a designer-placed rectangle {x0,x1,z0,z1,orient:'h'|'v',cuts:[x…]} in wall mm
// (x along the wall, z up from the floor), stored on plan.backsplash[wallKey]. Everything else
// here is derived. Stone only ever sits on bare wall; wherever an edge meets a cabinet or the
// countertop it slides TUCK mm behind it, and that is part of the cut size. The chimney slot
// counts as bare wall for its full height, so the stone runs behind the chimney panel too.
(function(root){
  const TUCK=10, FACTOR=1.25, SLAB=[2440,1220], SQFT=92903, MIN=20;
  const RETURN=/corner void|perpendicular cabinet/;
  const overlap=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0);

  // Everything standing in front of wall `key` as elevation rects {x0,x1,z0,z1,tuck}.
  // tuck:true = the stone slides behind it (cabinet, countertop); false = a door or window.
  // G = {baseTop,wallBottom,wallTop,loft,tall,ceil,tallAnchors,openings}.
  function obstacles(plan,key,G){
    const run=(plan&&plan.runs||[]).find(r=>r.key===key); if(!run) return null;
    const out=[], tallA=G.tallAnchors||[];
    const add=(x0,w,z0,z1,tuck)=>{ if(w>0&&z1>z0) out.push({x0,x1:x0+w,z0,z1,tuck}); };
    let x=0;
    for(const s of run.segments||[]){ const x0=s.x0??x, w=s.width||0; x=x0+w;
      if(s.kind==='door'){ add(x0,w,0,2100,false); continue; }
      const tall=s.kind==='tallBank'||s.tier==='tall'||(s.kind==='anchor'&&tallA.includes(s.label));
      const solid=s.hiddenCorner||['cabinet','anchor','corner','tallBank'].includes(s.kind)
        ||((s.kind==='filler'||s.kind==='inset')&&!s.open)||(s.kind==='gap'&&RETURN.test(`${s.label} ${s.func}`));
      // base: floor to countertop top. A tall unit ends level with the wall cabinets: the plan
      // stores only its carcass height (2400), the top filler above it (rules.json top_filler) is not in the plan.
      if(solid) add(x0,w,0,tall?Math.max(G.wallTop,s.height??0):G.baseTop,true);
    }
    const L=run.total||x, t=(plan.tiers||{})[key]||{};
    x=0;
    for(const u of t.wall||[]){ const x0=u.x0??x, w=u.width||0; x=x0+w;
      const z0=u.z??G.wallBottom, z1=z0+(u.height??G.wallTop-G.wallBottom);
      // a chimney slot is bare wall for its full height: the stone runs behind the chimney and its panel
      if(['wallSolid','wallGlass','wallBlind'].includes(u.kind)||((u.kind==='filler'||u.kind==='inset')&&!u.open)) add(x0,w,z0,z1,true);
    }
    x=0;
    for(const u of t.loft||[]){ const x0=u.x0??x, w=u.width||0; x=x0+w; if(u.kind==='loft'){ const z0=u.z??G.wallTop; add(x0,w,z0,z0+(u.height??G.loft??600),true); } }
    for(const o of G.openings||[]) if(o.wall===key&&o.type==='window'){ const full=o.variant==='fulllength', sill=o.sill??(full?50:900);
      add(o.off-o.width/2,o.width,sill,sill+(o.winH??(full?2100:1200)),false); }
    return {obs:out,L};
  }

  // Bare wall as rectangles: horizontal bands between obstacle edges, bands with the same span merged upward.
  function freeRects(obs,L,H){
    const edges=(vals,max)=>[...new Set([0,max,...vals.map(v=>Math.min(max,Math.max(0,v)))])].sort((a,b)=>a-b);
    const xs=edges(obs.flatMap(o=>[o.x0,o.x1]),L), zs=edges(obs.flatMap(o=>[o.z0,o.z1]),H), open=[];
    let prev=[];
    for(let j=0;j<zs.length-1;j++){ const zm=(zs[j]+zs[j+1])/2, row=[]; let cur=null;
      for(let i=0;i<xs.length-1;i++){ const xm=(xs[i]+xs[i+1])/2;
        if(obs.some(o=>xm>o.x0&&xm<o.x1&&zm>o.z0&&zm<o.z1)){ cur=null; continue; }
        if(cur) cur.x1=xs[i+1]; else row.push(cur={x0:xs[i],x1:xs[i+1],z0:zs[j],z1:zs[j+1]}); }
      prev=row.map(r=>{ const up=prev.find(p=>p.x0===r.x0&&p.x1===r.x1&&p.z1===r.z0); if(up){ up.z1=r.z1; return up; } open.push(r); return r; });
    }
    return open.filter(r=>r.x1-r.x0>=MIN&&r.z1-r.z0>=MIN);
  }

  // A region clipped to the bare rectangle holding its centre; null when that spot is no longer bare.
  function fit(g,free){ const cx=(g.x0+g.x1)/2, cz=(g.z0+g.z1)/2;
    const f=free.find(f=>cx>=f.x0&&cx<=f.x1&&cz>=f.z0&&cz<=f.z1); if(!f) return null;
    const r={x0:Math.max(g.x0,f.x0),x1:Math.min(g.x1,f.x1),z0:Math.max(g.z0,f.z0),z1:Math.min(g.z1,f.z1)};
    return r.x1-r.x0>=MIN&&r.z1-r.z0>=MIN?r:null; }

  // TUCK on each edge that meets a cabinet / countertop.
  function tucks(r,obs){ const t={l:0,r:0,b:0,t:0};
    for(const o of obs) if(o.tuck){
      const vz=overlap(r.z0,r.z1,o.z0,o.z1)>0, vx=overlap(r.x0,r.x1,o.x0,o.x1)>0;
      if(vz&&Math.abs(o.x1-r.x0)<1) t.l=TUCK;
      if(vz&&Math.abs(o.x0-r.x1)<1) t.r=TUCK;
      if(vx&&Math.abs(o.z1-r.z0)<1) t.b=TUCK;
      if(vx&&Math.abs(o.z0-r.z1)<1) t.t=TUCK; }
    return t; }

  // Cut pieces of the tucked rectangle. Horizontal = the slab's 2440 side runs along the wall,
  // vertical = its 1220 side does. `cuts` are the designer's own extra joints (wall mm).
  function pieces(r,t,g){ const [A,B]=g.orient==='v'?[SLAB[1],SLAB[0]]:SLAB;
    const split=(a,b,step,extra)=>{ const pts=[a,...(extra||[]).filter(c=>c>a+1&&c<b-1).sort((p,q)=>p-q),b], out=[];
      for(let i=0;i<pts.length-1;i++) for(let p=pts[i];p<pts[i+1]-1;p+=step) out.push([p,Math.min(p+step,pts[i+1])]);
      return out; };
    return split(r.z0-t.b,r.z1+t.t,B).flatMap(([z0,z1])=>split(r.x0-t.l,r.x1+t.r,A,g.cuts).map(([x0,x1])=>({x0,x1,z0,z1}))); }

  // ponytail: strips of one piece height packed first-fit, different heights never share a slab —
  // an upper bound. Billing is by sqft, so this is information only; nest properly if slabs get billed.
  function slabCount(ps,orient){ const [A,B]=orient==='v'?[SLAB[1],SLAB[0]]:SLAB, byH=new Map();
    for(const p of ps){ const h=Math.round(p.z1-p.z0); byH.set(h,[...(byH.get(h)||[]),p.x1-p.x0]); }
    let n=0;
    for(const [h,ws] of byH){ const strips=[];
      for(const w of ws.sort((a,b)=>b-a)){ const i=strips.findIndex(s=>s+w<=A); if(i<0) strips.push(w); else strips[i]+=w; }
      n+=Math.ceil(strips.length/Math.max(1,Math.floor(B/h))); }
    return n; }

  const sqft=mm2=>+(mm2*FACTOR/SQFT).toFixed(1);   // billed: tucked area × FACTOR

  // One wall: its valid regions (visible rect, cut size w×h, pieces, slabs) and the bare
  // rectangles a new region can still be added on.
  function layout(plan,key,G){ const o=obstacles(plan,key,G); if(!o) return null;
    const free=freeRects(o.obs,o.L,G.ceil), regions=[];
    ((plan.backsplash||{})[key]||[]).forEach((region,idx)=>{ const rect=fit(region,free); if(!rect) return;
      const t=tucks(rect,o.obs), ps=pieces(rect,t,region);
      regions.push({idx,region,rect,w:rect.x1-rect.x0+t.l+t.r,h:rect.z1-rect.z0+t.b+t.t,pieces:ps,slabs:slabCount(ps,region.orient)}); });
    return {regions,addable:freeRects([...o.obs,...regions.map(r=>r.rect)],o.L,G.ceil)}; }

  function summary(plan,G){ let mm2=0,n=0,slabs=0;
    for(const key of Object.keys(plan&&plan.backsplash||{})) for(const r of (layout(plan,key,G)||{regions:[]}).regions){ mm2+=r.w*r.h; n+=r.pieces.length; slabs+=r.slabs; }
    return {mm2,sqft:sqft(mm2),pieces:n,slabs}; }

  root.Backsplash={layout,summary,sqft,TUCK,FACTOR,SLAB};
})(globalThis);
