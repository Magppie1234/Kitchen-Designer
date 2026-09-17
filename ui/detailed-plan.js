/* Dimensioned plan presentation. Reads solved positions; never re-packs cabinets. */
(function(root){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const red='#a54139', blue='#444fbc', ink='#35332f';
  const rect=(x,y,w,h,attrs='')=>`<rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${Math.max(0,h)}" ${attrs}/>`;
  const line=(x1,y1,x2,y2,attrs='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
  function wrapLabel(lines,width,fontSize,maxLines){
    const capacity=Math.max(3,Math.floor(width/(fontSize*.54))),out=[];
    for(const source of lines){
      let row='';
      for(const word of source.split(/\s+/)){
        if(row&&(row+' '+word).length>capacity){out.push(row);row='';}
        row+=(row?' ':'')+word;
      }
      if(row)out.push(row);
    }
    const visible=out.slice(0,maxLines).map(l=>l.length>capacity?l.slice(0,capacity-1)+'…':l);
    if(out.length>maxLines&&visible.length)visible[visible.length-1]=visible.at(-1).slice(0,capacity-1)+'…';
    return visible;
  }
  function dimension(a,b,y,from,label,small=false,flip=false){
    if(b-a<.5)return '';
    const attr=`stroke="${red}" stroke-width=".55" vector-effect="non-scaling-stroke"`;
    return `<g class="plan-dimension" pointer-events="none">${line(a,from,a,y+2,attr)}${line(b,from,b,y+2,attr)}${line(a,y,b,y,attr)}${line(a-1,y+1.5,a+1,y-1.5,attr)}${line(b-1,y+1.5,b+1,y-1.5,attr)}<text transform="rotate(${flip?180:0} ${(a+b)/2} ${y-3.5})" x="${(a+b)/2}" y="${y-2}" text-anchor="middle" font-size="${small?3.7:5.2}" fill="${red}" paint-order="stroke" stroke="#fff" stroke-width="1">${esc(label)}</text></g>`;
  }
  function description(seg,tier){
    const p=(seg.code||'').split('-');
    const prefix=tier==='tall'?'Tall':tier==='wall'?'Wall':'Base';
    let name=seg.kind==='corner'||seg.kind==='wallBlind'?`${prefix} blind cabinet`
      :seg.kind==='chimney'?'Chimney'
      :seg.kind==='filler'||seg.kind==='inset'?(seg.label||'Filler')
      :seg.kind==='panel'?'Visible panel'
      :seg.label==='hob'?'Hob cabinet':seg.label==='sink'?'Sink cabinet'
      :seg.label==='fridge'?'Fridge tower':seg.label==='oven'?'Oven / microwave'
      :seg.label==='pantry'?'Tandem pantry':seg.label==='crockery'?'Crockery cabinet'
      :`${prefix} cabinet`;
    if(seg.kind==='tallBank')name=({fridge:'Fridge tower',pantry:'Tandem pantry',appliance:'Oven / microwave',shelves:'Tall shelf cabinet',glass:'Tall glass cabinet'})[seg.units?.[0]?.type]||seg.label||name;
    const specs=p.slice(4,7).map(s=>{
      const m=/^(\d+)(SX|SG|HB|LB|HS|BL)$/.exec(s); if(!m)return null;
      const what={SX:'shelf',SG:'glass shelf',HB:'deep drawer',LB:'shallow drawer',HS:'shutter',BL:'internal drawer'}[m[2]];
      return `${m[1]} ${what}${+m[1]>1?'s':''}`;
    }).filter(Boolean);
    return [name,...(specs.length?specs:[seg.func||seg.label||'']).filter(v=>v&&v.toLowerCase()!==name.toLowerCase())].slice(0,3);
  }
  function render(state,t,openingSymbol=()=>'',push=()=>0){
    const {walls,plan}=state;
    if(!plan||!walls?.length)return '';
    const mode=state.planTier||'overlay';
    const winding=Math.sign(walls.reduce((a,w)=>a+w.a[0]*w.b[1]-w.b[0]*w.a[1],0))||1;
    const points=walls.map(w=>`${t.X(w.a[0])},${t.Y(w.a[1])}`).join(' ');
    let s=`<defs><filter id="planGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .12"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter><pattern id="planStone" width="95" height="85" patternUnits="userSpaceOnUse"><rect width="95" height="85" fill="#e7e4df"/><path d="M0 68 Q28 58 40 32 T95 2 M0 76 Q35 57 49 37 T95 14" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width=".3"/><path d="M8 0 Q28 28 7 49 M62 85 Q57 64 95 51" fill="none" stroke="#ccc8c2" stroke-opacity=".12" stroke-width=".3"/></pattern><pattern id="planFiller" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#ebe6dc"/><path d="M0 0V3" stroke="#938b7c" stroke-width=".55"/></pattern></defs><g font-family="Arial,sans-serif"><rect width="680" height="520" fill="white"/><polygon points="${points}" fill="url(#planStone)"/><polygon points="${points}" filter="url(#planGrain)"/>`;
    const groups=[],annotations=[];
    for(const [wi,w] of walls.entries()){
      const key='W'+wi,L=w.length||Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
      const angle=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0])*180/Math.PI;
      const transform=`translate(${t.X(w.a[0])},${t.Y(w.a[1])}) rotate(${angle})`;
      const wallWidth=125*t.sc,sign=winding;
      const openings=(plan.openings||state.openings||[]).filter(o=>o.wall===key);
      let g=(state.openWalls||[]).includes(wi)?line(0,0,L*t.sc,0,'stroke="#aaa" stroke-dasharray="4 3" stroke-width=".6"')
        :rect(0,sign>0?-wallWidth:0,L*t.sc,wallWidth,'fill="#111"');
      for(const o of openings){const a=Math.max(0,o.off-o.width/2),b=Math.min(L,o.off+o.width/2);
        g+=rect(a*t.sc,-wallWidth-1,(b-a)*t.sc,wallWidth*2+2,'fill="white"');}
      const run=(plan.runs||[]).find(r=>r.key===key);
      let cursor=0, dimensions=[],notes=[];
      const base=(run?.segments||[]).map((seg,index)=>{const x=seg.x0??cursor;cursor=x+seg.width;return {seg,index,x};});
      cursor=0;
      const upper=(plan.tiers?.[key]?.wall||[]).map((seg,index)=>{const x=seg.x0??cursor;cursor=x+seg.width;return {seg,index,x};});
      const draw=(seg,index,x,tier,segTier)=>{
        const width=seg.width*t.sc,dep=(seg.depth??(tier==='wall'?336:560))*t.sc,offset=(seg.offset||0)*t.sc;
        const xp=x*t.sc,yp=sign>0?offset:-dep-offset;
        const hatch=['panel','filler','inset'].includes(seg.kind);
        const upperOverlay=tier==='wall'&&mode==='overlay';
        const m={tier,label:description(seg,tier).join(' · '),W:seg.width,H:seg.height??(tier==='wall'?725:tier==='tall'?2400:720),D:dep/t.sc,code:seg.code||null,run:key,segTier,seg:index};
        const id=push(m);
        g+=`<g class="plan-cabinet" data-tier="${tier}" font-weight="400"><rect class="mod" data-mod="${id}" x="${xp}" y="${yp}" width="${width}" height="${dep}" fill="${upperOverlay?'none':hatch?'url(#planFiller)':tier==='tall'?'#e1ded7':'#f7f6f2'}" stroke="${tier==='wall'?blue:ink}" stroke-width=".75" vector-effect="non-scaling-stroke" ${upperOverlay?'stroke-dasharray="3 2"':''}><title>${esc(m.label)} · ${seg.width} × ${m.H} × ${m.D} mm\n${esc(seg.code||'Custom finishing piece')}</title></rect>`;
        // Door/front line, kept inside the actual cabinet footprint.
        if(!hatch&&!upperOverlay){g+=line(xp+1,sign>0?yp+dep-2:yp+2,xp+width-1,sign>0?yp+dep-2:yp+2,`stroke="${ink}" stroke-width=".55" vector-effect="non-scaling-stroke"`);}
        if(seg.shutter)g+=line(seg.shutter.x0*t.sc,sign*(dep+offset),seg.shutter.x1*t.sc,sign*(dep+offset),'stroke="#75654b" stroke-width=".85" vector-effect="non-scaling-stroke" data-blind-shutter="true"');
        if(!hatch&&width>15){
          const lines=description(seg,tier),flipped=angle>90||angle<-90;
          const overBase=mode==='overlay'&&tier==='base'&&upper.some(u=>u.x<x+seg.width&&u.x+u.seg.width>x);
          const cy=upperOverlay?yp+dep/2:overBase?sign*(offset+dep*.83):yp+dep/2;
          const labelWidth=seg.shutter?(seg.shutter.x1-seg.shutter.x0)*t.sc:width;
          const fs=overBase?3.7:4.5;
          const maxLines=Math.max(1,Math.min(4,Math.floor((overBase?dep*.32:dep-4)/(fs+1))));
          const visibleLines=wrapLabel(lines,Math.max(8,labelWidth-4),fs,maxLines);
          // A blind cabinet's label belongs on its accessible front, clear of the return.
          const labelX=seg.shutter?(seg.shutter.x0+seg.shutter.x1)/2*t.sc:xp+width/2;
          notes.push(`<g pointer-events="none" transform="rotate(${flipped?180:0} ${labelX} ${cy})" fill="${ink}">${visibleLines.map((l,j)=>`<text x="${labelX}" y="${cy+(j-(visibleLines.length-1)/2)*(fs+1)+fs*.32}" text-anchor="middle" font-size="${fs}">${esc(l)}</text>`).join('')}</g>`);
        }
        // Hob and sink symbols have priority over the cabinet description.
        if(tier==='base'&&['hob','sink'].includes(seg.label)&&width>20){
          const cx=xp+width/2,cy=sign>0?yp+dep*(mode==='overlay'?.65:.28):yp+dep*(mode==='overlay'?.35:.72);
          if(seg.label==='hob')for(const dx of [-5,5])g+=`<circle cx="${cx+dx}" cy="${cy}" r="3.2" fill="none" stroke="#555" stroke-width=".55"/>`;
          else g+=rect(cx-8,cy-4,16,8,'rx="2" fill="none" stroke="#555" stroke-width=".55"');
        }
        g+='</g>';
        if(!upperOverlay)dimensions.push({a:xp,b:xp+width,dep:dep+offset,width:seg.width});
      };
      for(const {seg,index,x} of base){
        const tier=seg.tier==='tall'||seg.kind==='tallBank'||['fridge','oven','pantry','crockery'].includes(seg.label)?'tall':'base';
        if(mode==='wall'&&tier!=='tall')continue;
        if(!['cabinet','anchor','corner','tallBank','filler','panel','inset'].includes(seg.kind))continue;
        draw(seg,index,x,tier,'base');
      }
      if(mode!=='base')for(const {seg,index,x} of upper){
        if(!['wallSolid','wallGlass','wallBlind','chimney','filler','panel'].includes(seg.kind))continue;
        draw(seg,index,x,'wall','wall');
      }
      // All cabinet widths are retained in the dimension chain, including narrow fillers.
      // Crowded values use a second row and leader so they remain readable.
      const front=Math.max(560*t.sc,...dimensions.map(d=>d.dep)),dy=sign*(front+10);
      const laneEnds=[];
      for(const d of dimensions.sort((a,b)=>a.a-b.a)){
        const cx=(d.a+d.b)/2,half=String(Math.round(d.width)).length*1.1+1;
        let lane=0;while(laneEnds[lane]!=null&&cx-half<laneEnds[lane])lane++;
        laneEnds[lane]=cx+half+2;
        annotations.push(`<g transform="${transform}">${dimension(d.a,d.b,dy+sign*lane*7,sign*d.dep,Math.round(d.width),true,angle>90||angle<-90)}</g>`);
      }
      for(const {seg,x} of base.filter(({seg})=>['hob','sink'].includes(seg.label))){
        const cx=(x+seg.width/2)*t.sc,cy=sign*(front+30+laneEnds.length*3),flip=angle>90||angle<-90;
        annotations.push(`<g transform="${transform}"><text transform="rotate(${flip?180:0} ${cx} ${cy})" x="${cx}" y="${cy}" text-anchor="middle" font-size="4.5" fill="${red}">${seg.label==='hob'?'COOKING ZONE':'WASHING ZONE'}</text></g>`);
      }
      const overallY=-sign*(wallWidth+22);
      const overall=dimension(0,L*t.sc,overallY,-sign*wallWidth,Math.round(L),false,angle>90||angle<-90);
      annotations.push(`<g transform="${transform}">${overall}</g>`);
      groups.push(`<g transform="${transform}">${g}${notes.join('')}</g>`);
    }
    s+=groups.join('')+annotations.join('');
    for(const o of (plan.openings||state.openings||[])){const w=walls[+o.wall.slice(1)];if(w)s+=openingSymbol(w,o,t);}
    const xs=walls.flatMap(w=>[w.a[0],w.b[0]]),ys=walls.flatMap(w=>[w.a[1],w.b[1]]);
    const cx=t.X((Math.min(...xs)+Math.max(...xs))/2),cy=t.Y((Math.min(...ys)+Math.max(...ys))/2);
    if(plan.island?.working?.length){
      const island=plan.island,d=900*t.sc,total=island.total||island.working.reduce((n,m)=>n+m.width,0);let x=cx-total*t.sc/2;
      for(const seg of island.working){const w=seg.width*t.sc;
        s+=rect(x,cy-d/2,w,d,`fill="#f5f4ef" stroke="${ink}" stroke-width=".6"`);x+=w;}
      s+=`<text x="${cx}" y="${cy+2}" text-anchor="middle" font-size="6" fill="${ink}">ISLAND</text>`;
    }else{
      const label=(state.roomName&&state.roomName!=='Unnamed'?state.roomName:'KITCHEN').toUpperCase(),tw=Math.max(44,label.length*4.1+8);
      s+=rect(cx-tw/2,cy-7,tw,12,`fill="#ffffffbb" stroke="${red}" stroke-width=".6"`)+`<text x="${cx}" y="${cy+1.5}" text-anchor="middle" fill="${ink}" font-size="6.5">${esc(label)}</text>`;
    }
    s+=`<text x="24" y="496" font-size="5.5" fill="${ink}">DIMENSIONED FLOOR PLAN</text><text x="656" y="496" text-anchor="end" font-size="5" fill="${red}">ALL DIMENSIONS IN mm · USE WRITTEN DIMENSIONS</text></g>`;
    return s;
  }
  root.DetailedPlan={render,description,wrapLabel};
})(globalThis);
