// Island editing uses the same geometry and catalogue validation as generation.
(function(){
  let data=null,stamp='',pending='',sequence=0,opened=false,error='',timer,drag=null;
  const panel=()=>document.getElementById('islandSidebar');
  const config=()=>S.options.islandConfig;
  const assigned=type=>!!(S.options.island&&config()?.fixtures?.some(f=>f.type===type));
  const fresh=()=>!!data&&!error&&stamp===JSON.stringify(request());
  const SIDE={south:'Back',east:'Right end',west:'Left end',north:'Front'};
  const FIXTURE={hob:'Hob',sink:'Main sink',veggie:'Veggie sink'};
  function setWidth(width){
    const preset=data&&IslandRules.presets(data.rules).find(p=>p.width===Number(width));if(!preset||!config())return;
    const next={...config(),rows:preset.rows,seatSides:[...preset.seatSides]};
    if(!allowPosition(next)){draw();return;}
    pushUndo();config().rows=next.rows;config().seatSides=next.seatSides;changed();
  }
  function allowPosition(next){
    if(!fresh()){showToast('Checking the current room. Try again when the island options update.');refresh(true);return false;}
    const v=IslandRules.check(data.context,next,data.rules,{services:false});
    if(!v.valid){showToast('Position blocked. '+v.problems[0]);return false;}
    return true;
  }
  function request(){
    return {anchors:S.anchors.map(a=>({...a,width:a.type==='sink'?sinkWidth():fxWidthMm(a)})),options:{...S.options,
      seriesId:activeRoom().seriesId,walls:S.walls,dims:S.dims,openings:S.openings,structures:S.structures,
      zones:S.zones||[],roomMode:S.roomMode,openWalls:S.openWalls||[],handles:typeof S.options.handles==='object'?S.options.handles:(S.handle||S.options.handles),hobDesign:S.hob.shape||null,hobFlanks:S.hob.flankShape||{},fridgeWidth:S.fridge.width}};
  }
  // One stylesheet instead of an inline style on every node, so the panel reads as part of the
  // app rather than as a raw form. Every colour and font here is the builder's own token.
  const CSS=[
    "#islandSidebar{position:fixed;right:0;top:64px;bottom:0;width:404px;max-width:92vw;z-index:120;display:none;background:var(--paper);border-left:1px solid var(--line);box-shadow:-8px 0 32px #0000001a;overflow:auto;padding:0 0 28px;font-size:13px;color:var(--ink);line-height:1.55}",
    "#islandSidebar .isl-top{position:sticky;top:0;z-index:2;background:var(--paper);border-bottom:1px solid var(--line);padding:18px 22px 14px;display:flex;align-items:flex-start;gap:12px}",
    "#islandSidebar h2{font-family:'Spectral',Georgia,serif;font-size:21px;margin:0;font-weight:500}",
    "#islandSidebar .isl-sub{color:var(--muted);font-size:12px;margin:3px 0 0}",
    "#islandSidebar .isl-x{border:1px solid var(--line);background:#fff;border-radius:9px;width:30px;height:30px;font-size:14px;color:var(--muted);cursor:pointer;line-height:1;flex:none}",
    "#islandSidebar .isl-x:hover{border-color:var(--accent);color:var(--accent)}",
    "#islandSidebar section{padding:18px 22px;border-bottom:1px solid var(--line)}",
    "#islandSidebar h3{font-family:'Spectral',Georgia,serif;font-size:14.5px;margin:0 0 3px;font-weight:500}",
    "#islandSidebar .isl-hint{color:var(--muted);font-size:11.5px;margin:0 0 12px}",
    "#islandSidebar .isl-rowlabel{font-size:10.5px;letter-spacing:.7px;text-transform:uppercase;color:var(--muted2);font-weight:700;margin:15px 0 8px}",
    "#islandSidebar .isl-rowlabel:first-of-type{margin-top:0}",
    "#islandSidebar .isl-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
    "#islandSidebar .isl-card{text-align:left;padding:10px;border:1.5px solid var(--line);border-radius:14px;background:#fff;cursor:pointer;color:var(--ink);font:inherit;display:block;box-shadow:0 2px 5px #342d2410;transition:border-color .15s,box-shadow .15s}",
    "#islandSidebar .isl-card:hover:not(:disabled){border-color:var(--sage);box-shadow:0 3px 10px #342d241a}",
    "#islandSidebar .isl-card[aria-pressed=\"true\"]{border-color:var(--accent);background:#FBF1EC}",
    "#islandSidebar .isl-card:disabled{opacity:.5;cursor:wait}",
    "#islandSidebar .isl-card b{display:block;font-size:13px;font-weight:600;margin-top:7px}",
    "#islandSidebar .isl-card span{display:block;font-size:11px;color:var(--muted)}",
    "#islandSidebar .isl-card em{display:block;font-style:normal;font-size:10.5px;color:var(--accent);font-weight:600;margin-top:3px}",
    "#islandSidebar .isl-chips{display:flex;flex-wrap:wrap;gap:7px}",
    "#islandSidebar .isl-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border:1.5px solid var(--line);border-radius:999px;background:#fff;cursor:pointer;font-size:12.5px;user-select:none}",
    "#islandSidebar .isl-chip input{position:absolute;opacity:0;width:0;height:0}",
    "#islandSidebar .isl-chip:has(input:checked){border-color:var(--accent);background:#FBF1EC;color:var(--accent);font-weight:600}",
    "#islandSidebar .isl-chip:has(input:focus-visible){outline:2px solid var(--sage);outline-offset:2px}",
    "#islandSidebar .isl-stat{display:flex;gap:9px;margin:0 0 12px}",
    "#islandSidebar .isl-stat div{flex:1;background:#fff;border:1px solid var(--line);border-radius:11px;padding:9px 11px}",
    "#islandSidebar .isl-stat b{display:block;font-size:15px;font-weight:600}",
    "#islandSidebar .isl-stat span{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted2);font-weight:700}",
    "#islandSidebar label.isl-f{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:12.5px}",
    "#islandSidebar label.isl-f>span{flex:1;color:var(--muted)}",
    "#islandSidebar input[type=number],#islandSidebar input[type=text],#islandSidebar select{padding:8px 10px;font:inherit;font-size:12.5px;border:1.5px solid var(--line);border-radius:9px;background:#fff;color:var(--ink)}",
    "#islandSidebar input[type=number]{width:104px;text-align:right}",
    "#islandSidebar input[type=text]{width:100%}",
    "#islandSidebar label.isl-f select{width:150px}",
    "#islandSidebar input:focus-visible,#islandSidebar select:focus-visible{outline:none;border-color:var(--sage);box-shadow:0 3px 10px #342d241a}",
    "#islandSidebar .isl-fx{border:1px solid var(--line);border-radius:12px;background:#fff;padding:11px 14px;margin:9px 0}",
    "#islandSidebar .isl-fx .isl-chip{border:none;background:none;padding:0;font-weight:600;font-size:13px;color:var(--ink)}",
    "#islandSidebar .isl-fx .isl-chip:has(input:checked){color:var(--accent)}",
    "#islandSidebar .isl-box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;margin:9px 0}",
    "#islandSidebar .isl-issues{margin:0;padding-left:18px}",
    "#islandSidebar .isl-issues li{margin:4px 0}",
    "#islandSidebar .isl-ok{color:var(--sage);font-size:12.5px;margin:0}",
    "#islandSidebar .isl-warn{border-left:3px solid var(--accent);background:#FBF1EC;border-radius:0 11px 11px 0;padding:11px 13px;margin:0}",
    "#islandSidebar .isl-warn h4{margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:var(--accent)}",
    "#islandSidebar .isl-clear{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:5px 0;border-bottom:1px solid var(--line)}",
    "#islandSidebar .isl-clear:last-child{border:none}",
    "#islandSidebar details{border:1px solid var(--line);border-radius:12px;background:#fff;margin:9px 0;overflow:hidden}",
    "#islandSidebar summary{cursor:pointer;padding:11px 14px;font-size:12.5px;font-weight:600;list-style:none}",
    "#islandSidebar summary::-webkit-details-marker{display:none}",
    "#islandSidebar summary::after{content:'+';float:right;color:var(--muted);font-weight:400}",
    "#islandSidebar details[open] summary{border-bottom:1px solid var(--line)}",
    "#islandSidebar details[open] summary::after{content:'-'}",
    "#islandSidebar details>*:not(summary){margin-left:14px;margin-right:14px}",
    "#islandSidebar details>*:last-child{margin-bottom:12px}",
    "#islandSidebar .isl-remove{width:100%;padding:11px;border:1.5px solid var(--line);border-radius:11px;background:#fff;color:var(--accent);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}",
    "#islandSidebar .isl-remove:hover{border-color:var(--accent);background:#FBF1EC}",
    "#islandSidebar .isl-status{margin:0;color:var(--muted);font-size:12px}"
  ].join('\n');
  function ensure(){
    if(panel())return;
    if(!document.getElementById('islandSidebarCss')){
      const st=document.createElement('style');st.id='islandSidebarCss';st.textContent=CSS;document.head.append(st);
    }
    const p=document.createElement('aside');p.id='islandSidebar';p.setAttribute('aria-label','Island');
    document.body.append(p);
    p.addEventListener('click',e=>{
      const b=e.target.closest('[data-island-action]');if(!b)return;
      const a=b.dataset.islandAction;
      if(a==='close'){close();return;}
      if(a==='remove'){pushUndo();S.options.island=false;S.steps.island=null;changed();return;}
      if(a==='choose'){const chosen=data?.options[+b.dataset.index];if(chosen&&allowPosition(chosen)){pushUndo();S.options.islandConfig=clean(chosen);S.options.island=true;S.steps.island='Storage';changed();}return;}
      if(a==='refresh')refresh(true);
    });
    p.addEventListener('change',e=>{
      const key=e.target.dataset.field;if(!key||!config())return;
      if(key==='standardWidth'){setWidth(e.target.value);return;}
      const i=config(),el=e.target,value=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
      if(['x','y','rotation','length'].includes(key)&&!allowPosition({...i,[key]:Number(value)})){draw();return;}
      pushUndo();
      if(key.startsWith('seat.')){const side=key.slice(5);i.seatSides=(i.seatSides||[]).filter(s=>s!==side);if(value)i.seatSides.push(side);}
      else if(key.startsWith('fixture.')){
        const type=key.slice(8);i.fixtures=(i.fixtures||[]).filter(f=>f.type!==type);
        if(value){const a=S.anchors.find(a=>a.type===type);if(!a){showToast('Place this fixture first, then assign it to the island.');draw();return;}
          i.fixtures.push({type,row:0,at:0,width:type==='sink'?sinkWidth():fxWidthMm(a)});}
      }else if(key.startsWith('unit.')){const [,type,field]=key.split('.');const f=(i.fixtures||[]).find(f=>f.type===type);if(f)f[field]=el.tagName==='SELECT'?Number(el.value):value;}
      else if(key.includes('.')){const [group,field]=key.split('.');(i[group]??={})[field]=value;}
      else i[key]=value;
      changed();
    });
  }
  function clean(i){const out={};for(const k of ['x','y','length','rows','rotation','seatSides','fixtures','endPanel','backPanel','frontProjection','seatObstructions','support','plumbingConfirmed','prepConfirmed','hobInstallation'])if(i[k]!=null)out[k]=structuredClone(i[k]);return out;}
  function changed(){stamp='';markInProcess();scheduleAutosave();renderEditorLeft();renderPos();refresh(true);}
  async function refresh(force=false){
    if(drag)return;
    if(!opened&&!S.options.island)return;
    const body=request(),key=JSON.stringify(body);
    if(!force&&(stamp===key||pending===key))return;
    pending=key;const ticket=++sequence;error='';
    try{
      const res=await fetch(API+'/api/island-options',{method:'POST',headers:{'content-type':'application/json'},body:key});
      const result=await res.json();if(ticket!==sequence||key!==JSON.stringify(request()))return;
      if(!res.ok)throw new Error(result.error||'Unable to check the island.');
      data=result;stamp=key;
    }catch(e){if(ticket===sequence){error=e.message;stamp=key;}}
    finally{if(ticket===sequence){pending='';draw();renderPos();}}
  }
  const number=(name,key,value,min=0)=>`<label class="isl-f"><span>${name}</span><input data-field="${key}" type="number" min="${min}" step="1" value="${value??0}"></label>`;
  const text=(name,key,value)=>`<label class="isl-f"><span>${name}</span><input data-field="${key}" type="text" value="${esc(value||'')}"></label>`;
  const chip=(name,key,value)=>`<label class="isl-chip"><input type="checkbox" data-field="${key}" ${value?'checked':''}>${esc(name)}</label>`;
  const pick=(name,key,value,opts)=>`<label class="isl-f"><span>${name}</span><select data-field="${key}">${opts.map(([v,l])=>`<option value="${v}" ${value===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  // A close-up communicates the island's proportions and tucked-in seating.
  // The small room inset preserves placement context without shrinking the furniture.
  function preview(o){
    const r=data.rules,b=IslandRules.shape(o,r),local={...o,x:0,y:0,rotation:0};
    const seats=IslandRules.seatCounts(o,r),vertical=b.depth+(seats.north?160:0)+(seats.south?160:0);
    const horizontal=b.length+(seats.west?160:0)+(seats.east?160:0);
    const sc=Math.min(132/horizontal,90/vertical),t={sc,X:x=>90+x*sc,Y:y=>55+y*sc};
    let g='<svg viewBox="0 0 180 138" role="img" aria-label="Island layout and room position" style="display:block;width:100%;background:#f4f1eb;border-radius:8px">';
    g+=IslandRules.svg(local,r,t,{labels:false,modules:false});
    g+='<text x="14" y="125" font-size="7" letter-spacing="1.2" fill="#8c8273">TOP VIEW</text>';
    const walls=data.context.walls;
    if(walls.length){
      const xs=walls.flatMap(w=>[w.a[0],w.b[0]]),ys=walls.flatMap(w=>[w.a[1],w.b[1]]);
      const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
      const scale=Math.min(26/(w||1),26/(h||1)),X=x=>148+(26-w*scale)/2+(x-x0)*scale,Y=y=>105+(26-h*scale)/2+(y-y0)*scale;
      g+=`<g data-island-room-inset="true"><polygon points="${walls.map(w=>`${X(w.a[0])},${Y(w.a[1])}`).join(' ')}" fill="#fcfaf6" stroke="#c9c1b4" stroke-width=".65"/>`;
      for(const ob of data.context.obstacles||[])g+=`<rect x="${X(ob.x0)}" y="${Y(ob.y0)}" width="${(ob.x1-ob.x0)*scale}" height="${(ob.y1-ob.y0)*scale}" fill="#dbd4c8"/>`;
      g+=`<rect x="${X(b.x0)}" y="${Y(b.y0)}" width="${b.width*scale}" height="${b.height*scale}" fill="#ae715a"/></g>`;
    }
    return g+'</svg>';
  }
  function choicesMarkup(i){
    if(!data)return '';
    const choices=IslandRules.recommendations(data.options||[],data.rules,i?.rotation||0,i?.length||1800);
    let h='<h3>Standard widths</h3><p class="isl-hint">Choose a use and width, then enter your own length. These starting layouts keep your aisles clear.</p>';
    if(data.reason)h+=`<p class="isl-status">${esc(data.reason)}</p>`;
    const current=fresh();
    if(!current)h+='<p class="isl-status" role="status">Updating sizes for your latest changes…</p>';
    h+='<div class="isl-grid">';
      for(const {option:o,index,label} of choices){
        const b=IslandRules.shape(o,data.rules),seats=Object.values(IslandRules.seatCounts(o,data.rules)).reduce((a,b)=>a+b,0);
        const active=i&&i.length===o.length&&i.rows===o.rows&&JSON.stringify(i.seatSides||[])===JSON.stringify(o.seatSides||[]);
        h+=`<button class="isl-card" data-island-action="choose" data-index="${index}" aria-pressed="${!!active}" ${current?'':'disabled'}>`
          +preview(o)+`<b>${b.depth} mm · ${esc(label)}</b><span>${b.length} × ${b.depth} mm${seats?` · ${seats} seat${seats===1?'':'s'}`:''}</span>`
          +(active?'<em>Selected</em>':'')+'</button>';
      }
    h+='</div>';
    return h;
  }
  function draw(){
    if(!opened)return;ensure();const p=panel(),i=S.options.island?config():null;
    let h='<div class="isl-top"><div style="flex:1"><h2>Island</h2><p class="isl-sub">Every size and position offered here already clears your cabinets, aisles and doors.</p></div>'
      +'<button class="isl-x" data-island-action="close" aria-label="Close island panel">✕</button></div>';
    if(error)h+=`<section><p class="isl-warn" role="alert">${esc(error)}</p></section>`;
    if(!data&&!error)h+='<section><p class="isl-status">Checking room space and eligible cabinets…</p></section>';
    h+='<section>'+choicesMarkup(i)+'</section>';
    if(i){
      const selected=data?.selected,v=selected?.validation||selected,r=data?.rules;
      if(r){
        const b=IslandRules.shape(i,r),seats=Object.values(IslandRules.seatCounts(i,r)).reduce((a,b)=>a+b,0);
        h+='<section><h3>This island</h3><div class="isl-stat">'
          +`<div><span>Finished top</span><b>${b.length} × ${b.depth}</b></div>`
          +`<div><span>Rows</span><b>${i.rows}</b></div>`
          +`<div><span>Seats</span><b>${seats}</b></div></div>`
          +pick('Width and use','standardWidth',IslandRules.profile(i,r).width,IslandRules.presets(r).map(p=>[p.width,`${p.width} mm - ${p.label}`]))
          +number('Length','length',i.length,r.minimum_length)
          +'<p class="isl-hint">Cabinet length. The countertop runs '+(r.countertop_end_overhang||0)+' mm past each end. Any whole-millimetre length from 1200 mm that fits the room. Storage uses catalogue cabinets with cut-to-size closure panels where needed.</p>'
          +pick('Orientation','rotation',i.rotation??0,[0,90,180,270].map(n=>[n,n+'°']))
          +'<p class="isl-hint" style="margin:10px 0 0">Drag the island on the plan. The shaded area is everywhere its centre is allowed to sit.</p></section>';
      }
      h+='<section><h3>Seating</h3><p class="isl-hint">900 mm is seating only. 976 mm includes 600 mm storage and 376 mm of seating space. Allow 650 mm usable length per person.</p><div class="isl-chips">';
      if(i.rows===0)for(const side of ['north','south'])h+=chip(SIDE[side],'seat.'+side,i.seatSides?.includes(side));
      else h+=`<span>${i.seatSides?.includes('south')?'Back seating · 376 mm knee space':'Storage only; choose 976 mm to add back seating.'}</span>`;
      h+='</div></section>';
      h+='<section><h3>Fixtures on the island</h3><p class="isl-hint">Only a fixture you have already placed can move onto the island.</p>';
      if(i.rows===0)h+='<p class="isl-hint">Seating-only islands have no cabinets or fixtures underneath the tabletop.</p>';
      for(const type of i.rows===0?[]:['hob','sink','veggie']){
        const f=i.fixtures?.find(f=>f.type===type);
        h+=`<div class="isl-fx">${chip(FIXTURE[type],'fixture.'+type,!!f)}`;
        // no cabinet width here: the cabinet under a fixture is chosen by Generate Design
        if(f)h+=number('Offset along row','unit.'+type+'.at',f.at)
          +(i.rows>1?pick('Storage row','unit.'+type+'.row',f.row,Array.from({length:i.rows},(_,n)=>[n,'Row '+(n+1)])):'');
        h+='</div>';
      }
      h+='</section>';
      if(selected){
        const issues=[...new Set([...(selected.problems||[]),...(selected.unresolved||[])])];
        h+='<section><h3>Checks</h3>'+(issues.length
          ?`<div class="isl-warn"><h4>Needs attention</h4><ul class="isl-issues">${issues.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`
          :'<p class="isl-ok">✓ This island passes every placement and clearance check.</p>');
        h+='<details><summary>Clearances from finished edges</summary>';
        for(const [s,c] of Object.entries(v?.clearances||{}))
          h+=`<div class="isl-clear"><span>${SIDE[s]||s}</span><span>${c.actual??'—'} mm <span style="color:var(--muted2)">of ${c.required} needed</span></span></div>`;
        // Cabinets are not listed before generation — only the island's type, size and checks.
        h+='</details></section>';
      }
      h+='<section><h3>Fine tuning</h3>';
      h+='<details><summary>Exact position</summary>'
        +number('Centre X','x',i.x,-50000)+number('Centre Y','y',i.y,-50000)+'</details>';
      h+='<details><summary>Panels and top projections</summary>'+number('Each end panel','endPanel',i.endPanel)
        +number('Back panel within storage depth','backPanel',i.backPanel)+number('Top projection at each end','frontProjection',i.frontProjection??r.countertop_end_overhang)
        +'<p class="isl-hint">Finishes stay within the fixed width. End panels and end projections add to the finished length shown above.</p>';
      for(const side of i.seatSides||[])h+=number((SIDE[side]||side)+' unusable seat length','seatObstructions.'+side,i.seatObstructions?.[side]);
      h+='</details>';
      if(i.fixtures?.some(f=>['sink','veggie'].includes(f.type)))
        h+='<details><summary>Sink services</summary>'
          +`<div class="isl-box">${chip('Water and drainage route verified','plumbingConfirmed',i.plumbingConfirmed)}</div>`
          +`<div class="isl-box">${chip('Preparation and landing space verified','prepConfirmed',i.prepConfirmed)}</div></details>`;
      if(i.fixtures?.some(f=>f.type==='hob')){
        h+='<details><summary>Hob installation</summary><p class="isl-hint">Taken from the hob’s own installation sheet.</p>';
        for(const k of ['left','right','rear','cutoutDepth'])
          h+=number({left:'Clearance left',right:'Clearance right',rear:'Clearance rear',cutoutDepth:'Cutout depth'}[k],'hobInstallation.'+k,i.hobInstallation?.[k]);
        h+=text('Extraction arrangement','hobInstallation.extraction',i.hobInstallation?.extraction)
          +`<div class="isl-box">${chip('Installation requirements verified','hobInstallation.confirmed',i.hobInstallation?.confirmed)}</div></details>`;
      }
      h+='<details><summary>Countertop support</summary>'+text('Material','support.material',i.support?.material)
        +number('Verified supported overhang','support.approvedOverhang',i.support?.approvedOverhang)
        +`<div class="isl-box">${chip('Support verified; knee space clear','support.confirmed',i.support?.confirmed)}</div></details>`;
      h+='</section><section style="border:none"><button class="isl-remove" data-island-action="remove">Remove island</button></section>';
    }
    p.innerHTML=h;p.style.display='block';
    // Selects carry numbers; text fields stay strings. Fixture selects go to the delegated
    // listener instead, because they need the fixture lookup rather than a top-level key.
    p.querySelectorAll('select[data-field]').forEach(el=>el.onchange=e=>{
      const key=el.dataset.field;if(key.startsWith('unit.'))return;
      if(key==='standardWidth'){e.stopPropagation();setWidth(el.value);return;}
      e.stopPropagation();const next={...config(),[key]:Number(el.value)};
      if(key==='rotation'&&!allowPosition(next)){draw();return;}
      pushUndo();config()[key]=Number(el.value);changed();});
  }
  function open(){if(S.screen==='result')go('editor');opened=true;ensure();draw();refresh();}
  // The editor is the island's only screen, so leaving it puts the panel away.
  function close(){opened=false;const p=panel();if(p)p.style.display='none';}
  function svg(t){
    if(!S.options.island||!config()||!data?.rules)return '';
    const current=stamp===JSON.stringify(request()),i=drag?{...drag.accepted,working:drag.working}:current&&data.selected?data.selected:config();
    const v=IslandRules.check(data.context,i,data.rules,{services:false});
    let g='';
    if(drag){
      // The island itself never leaves the allowed area, so showing it there is the whole
      // story — a second translucent copy at the raw pointer only competed with the real one.
      g=`<g data-island-placement-area="true" pointer-events="none"><polygon points="${drag.context.walls.map(w=>`${t.X(w.a[0])},${t.Y(w.a[1])}`).join(' ')}" fill="#211F1B" fill-opacity=".26"/>`;
      // Cells are painted back to a light tint, so the allowed area is the bright region and
      // everything the island may not reach stays dimmed. Overlapping edges hide the grid seams.
      for(const c of drag.area.cells)g+=`<rect x="${t.X(c.x0)-.4}" y="${t.Y(c.y0)-.4}" width="${(c.x1-c.x0)*t.sc+.8}" height="${(c.y1-c.y0)*t.sc+.8}" fill="#EDF1E7" fill-opacity=".93"/>`;
      if(!drag.area.cells.length)for(const p of drag.area.points)g+=`<circle cx="${t.X(p.x)}" cy="${t.Y(p.y)}" r="3.5" fill="#EDF1E7"/>`;
      g+='</g>';
    }
    g+=IslandRules.svg(i,data.rules,t,{interactive:true,modules:false,invalid:!v.valid||(!drag&&current&&!!data.selected?.problems?.length)});
    if(drag&&drag.blocked){
      // Anchored under the island, not pinned to a fixed corner of the canvas.
      const b=IslandRules.shape(i,data.rules);
      const y=t.Y(i.y)+b.height*t.sc/2+15,x=t.X(i.x);
      g+=`<g pointer-events="none" data-island-drag-status="true"><rect x="${x-52}" y="${y-9}" width="104" height="13" rx="6.5" fill="#fff" fill-opacity=".92"/><text x="${x}" y="${y}" text-anchor="middle" font-size="8" font-weight="600" fill="#B4533A">Edge of the allowed area</text></g>`;
    }
    return g;
  }
  function bind(svg,t){
    const el=svg.querySelector('[data-island]');if(!el)return;
    el.onmousedown=e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();open();
      if(!fresh()){showToast('Checking placement limits. Drag again once the options update.');refresh(true);return;}
      const start=svgPoint(svg,e),i=config();if(!i||drag)return;const original=structuredClone(i),key=JSON.stringify(request()),roomId=S.activeRoomId;
      drag={accepted:original,pointer:{x:i.x,y:i.y},blocked:false,context:data.context,working:data.selected?.working||[],area:IslandRules.placementArea(data.context,i,data.rules)};
      const unchanged=()=>S.activeRoomId===roomId&&JSON.stringify(request())===key;
      const finish=commit=>{
        const d=drag;drag=null;
        window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',end);window.removeEventListener('keydown',cancelKey);window.removeEventListener('blur',cancel);
        if(commit&&d&&unchanged()&&IslandRules.check(d.context,d.accepted,data.rules,{services:false}).valid&&(d.accepted.x!==original.x||d.accepted.y!==original.y)){
          pushUndo();i.x=d.accepted.x;i.y=d.accepted.y;changed();
        }else{renderPos();refresh();}
      };
      const move=ev=>{
        if(!unchanged()){finish(false);return;}
        const p=svgPoint(svg,ev),target={x:Math.round(original.x+(p.x-start.x)/t.sc),y:Math.round(original.y+(p.y-start.y)/t.sc)};
        const result=IslandRules.moveWithin(drag.context,drag.accepted,data.rules,target);
        drag.accepted=result.position;drag.pointer=target;drag.blocked=result.blocked;drag.reason=result.validation.problems[0];renderPos();
      };
      const end=()=>finish(true),cancel=()=>finish(false),cancelKey=ev=>{if(ev.key==='Escape'){ev.preventDefault();finish(false);}};
      window.addEventListener('mousemove',move);window.addEventListener('mouseup',end);window.addEventListener('keydown',cancelKey);window.addEventListener('blur',cancel);renderPos();
    };
  }
  window.IslandDesigner={open,close,svg,bind,assigned,refresh,info:()=>({fits:!!data?.options?.length,ready:data?.ready})};
  // Detect edits from all existing room, fixture and cabinet controls without changing a selection.
  timer=setInterval(()=>{if(opened||S.options.island)refresh();},1200);
})();
