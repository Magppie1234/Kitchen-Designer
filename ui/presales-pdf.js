// ui/presales-pdf.js — the pre-sales presentation deck ("Pre-sales PDF" on the quote step).
// Laid out like the sales team's PowerPoint deck (960×540 slides): the brand pages are images
// cut from that deck (assets/presales/pNN.jpg); the client page, plan, elevations, renders and
// accessories are drawn from the active room. No prices — the estimate is its own PDF.
(function(root){
  const PW=960, PH=540;
  const asset=p=>(root.API||'')+'/assets/'+p;
  const load=src=>new Promise(r=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>r(i); i.onerror=()=>r(null); i.src=src; });
  // an SVG string → PNG data URL on a white sheet (jsPDF can't take SVG)
  const svgPng=(svg,w,h)=>load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)).then(i=>{ if(!i) return null;
    const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d');
    x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(i,0,0,w,h); return c.toDataURL('image/jpeg',0.92); });
  const dims=s=>typeof s==='string'?load(s):Promise.resolve(s);
  // Generated designs name accessories differently from the Excel master, so match by keyword
  // to its photos (data/accessories-master/media, served at /accessory-media/). First hit wins.
  const MASTER_IMG=[[/glass rolling|rolling shutter/i,'image7.png'],[/chakla|rolling/i,'image19.jpg'],
    [/cutlery.*(small|600)/i,'image12.jpg'],[/cutlery/i,'image23.png'],[/pulse/i,'image17.jpg'],
    [/spice.*(small|600)/i,'image21.jpg'],[/spice|masala/i,'image10.jpg'],[/pot.*pan/i,'image11.jpg'],
    [/divider/i,'image1.jpg'],[/onion|potato/i,'image5.jpg'],[/lehman|le ?mans/i,'image2.jpg'],
    [/waste ?bin/i,'image24.jpg'],[/bottle.*150/i,'image9.jpg'],[/bottle/i,'image4.jpg'],
    [/detergent.*(single|1 basket)/i,'image18.jpg'],[/detergent/i,'image25.jpg'],[/magic/i,'image14.jpg'],
    [/1200.*shelf|shelf.*1200/i,'image22.jpg'],[/stone shelf/i,'image8.jpg'],[/kubos/i,'image13.png'],
    [/tandem|pantry/i,'image6.jpg'],[/5 drawer|five drawer/i,'image15.jpg'],[/tark/i,'image3.jpg'],[/ceiling hanging/i,'image16.jpg']];
  const accImg=n=>{ const own=cfgImg(n)||hobAccImg(n); if(own) return asset(own.replace(/^assets\//,''));
    const m=MASTER_IMG.find(([re])=>re.test(n)); return m?(root.API||'')+'/accessory-media/'+m[1]:null; };

  // asks for the people on the deck's client page; remembered on the project
  function askDetails(){
    const p=S.project, d=document.createElement('dialog');
    d.style.cssText='border:none;border-radius:16px;padding:24px 26px;width:360px;font-family:inherit;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)';
    const f=(k,l,v)=>`<label style="display:block;font-size:12px;font-weight:600;color:#6B675E;margin-top:12px">${l}<input name="${k}" class="tf" style="margin-top:6px" value="${esc(v||'')}"></label>`;
    d.innerHTML=`<div style="font-size:18px;font-weight:500">Pre-sales PDF</div>
      ${f('relationship','Relationship Person',p.relationship)}${f('designer','Designer',p.designer||p.architect)}${f('revision','Revision',p.revision||'00')}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px"><button data-ok="" class="btn ghost" style="padding:10px 16px">Cancel</button><button data-ok="1" class="btn" style="padding:10px 18px">Download</button></div>`;
    document.body.appendChild(d);
    // resolved from the buttons / Esc, not the dialog's close event (not fired in every webview)
    return new Promise(res=>{ const done=ok=>{
        if(ok) for(const el of d.querySelectorAll('input')) S.project[el.name]=el.value.trim();
        d.remove(); res(ok); };
      d.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>done(!!b.dataset.ok));
      d.onkeydown=e=>{ if(e.key==='Escape'){ e.preventDefault(); done(false); } if(e.key==='Enter') done(true); };
      d.showModal(); });
  }

  async function presalesPdf(){
    if(!root.jspdf){ showToast('PDF library did not load — check the internet connection and reload.'); return; }
    if(!S.plan){ showToast('Generate a design first.'); return; }
    if(!await askDetails()) return;
    showToast('Building the pre-sales PDF…');
    const P=S.project, room=activeRoom(), now=new Date();
    const date=[now.getDate(),now.getMonth()+1,now.getFullYear()].map(n=>String(n).padStart(2,'0')).join('-');
    const HH={...((S.rulesCfg&&S.rulesCfg.heights)||{}),...(S.plan.geometry||{})}, height=(HH.wallTop||2500)+'MM';
    const finish=(S.options.lookName||seriesLabel(room.seriesId)||'').toUpperCase(), theme=(S.options.finish||'Modern').toUpperCase();
    const plan={...S.plan,openings:S.plan.openings||S.openings}, ceil=S.options.ceiling||3100;

    // everything that has to load or render, in parallel
    draw2d();   // the plan SVG is only filled while the Review tab has drawn it
    const planSvg=$('view2d')&&$('view2d').innerHTML;
    const accNames=[...new Set([...(S.plan.accessories||[]),...(S.plan.placedAccessories||[])].map(a=>a.name)
      .concat((S.sink&&S.sink.accessories)||[],(S.fridge&&S.fridge.accessories)||[]))];
    const archFile=S.upload&&S.upload.file&&/^image\//.test(S.upload.file.type)?S.upload.file:null;
    const [statics,logo,planImg,elevs,views,accImgs,arch]=await Promise.all([
      Promise.all([1,2,3,4,5,6,7,8,9,20,21].map(n=>load(asset(`presales/p${String(n).padStart(2,'0')}.jpg`)))),
      load(asset('presales/logo.png')),
      planSvg?svgPng(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 520" width="2040" height="1560">${planSvg}</svg>`,2040,1560):null,
      Promise.all((S.plan.runs||[]).map(r=>root.renderElevation?root.renderElevation(plan,S.walls,r.key,{ceil}).catch(()=>null):null)),
      S.snapshots&&S.snapshots.length?S.snapshots.map(s=>s.rendered||s.img):(root.renderPerspectives?root.renderPerspectives(scenePlan(),S.walls).catch(()=>[]):[]),
      // shrunk to 600px on a white tile: the master photos are multi-MB originals
      Promise.all(accNames.map(n=>{ const u=accImg(n); return u?load(u).then(i=>{ if(!i) return null;
        const k=Math.min(1,600/Math.max(i.naturalWidth,i.naturalHeight)), c=document.createElement('canvas'), x=c.getContext('2d');
        c.width=Math.round(i.naturalWidth*k); c.height=Math.round(i.naturalHeight*k);
        x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(i,0,0,c.width,c.height); return c.toDataURL('image/jpeg',0.85); }):null; })),
      archFile?new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.onerror=()=>r(null); fr.readAsDataURL(archFile); }):null,
    ]);
    const deck=Object.fromEntries([1,2,3,4,5,6,7,8,9,20,21].map((n,i)=>[n,statics[i]]));

    const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:[PW,PH]});
    let first=true;
    const page=(dark)=>{ if(!first) doc.addPage([PW,PH],'landscape'); first=false;
      doc.setFillColor(...(dark?[0,0,0]:[255,255,255])).rect(0,0,PW,PH,'F'); };
    const full=img=>{ page(); if(img) doc.addImage(img,'JPEG',0,0,PW,PH); };
    const brand=()=>{ if(logo) doc.addImage(logo,'PNG',866,516,87,17); };
    // spaced capitals like the deck's headings (Goudy → the nearest built-in serif, Times)
    const sp=(t,x,y,size,{c=255,cs=size*0.18,center=true,bold=false}={})=>{
      doc.setFont('times',bold?'bold':'normal').setFontSize(size).setTextColor(c);
      const w=doc.getTextWidth(t)+cs*(t.length-1); doc.text(t,center?x-w/2:x,y,{charSpace:cs}); };
    const title=t=>{ sp(t,14,26,16,{c:0,center:false,bold:true}); doc.setDrawColor(0).setLineWidth(.8).line(14,32,14+t.length*12,32); };
    // contain an image inside a box
    const fit=async(src,x,y,w,h,fmt='JPEG')=>{ const i=await dims(src); if(!i) return;
      const k=Math.min(w/i.naturalWidth,h/i.naturalHeight), iw=i.naturalWidth*k, ih=i.naturalHeight*k;
      doc.addImage(src,fmt,x+(w-iw)/2,y+(h-ih)/2,iw,ih); };

    [1,2,3,4,5,6,7,8,9].forEach(n=>full(deck[n]));

    // client page
    page(true);
    sp('KITCHEN DESIGNED EXCLUSIVELY FOR',PW/2,178,20);
    sp((P.client||'Client').toUpperCase(),PW/2,248,30);
    [['Date of Design : ',date],['Relationship Person : ',P.relationship||'-'],['Designer : ',P.designer||'-'],['Revised Drawing : ',P.revision||'00'],['Revised Date : ',P.revision&&P.revision!=='00'?date:'00']]
      .forEach(([k,v],i)=>sp(k+v,12,388+i*32,14,{center:false,cs:2}));
    brand();

    if(arch){ page(); title('ARCHITECT LAYOUT'); await fit(arch,40,48,880,468,arch.startsWith('data:image/png')?'PNG':'JPEG'); brand(); }

    if(planImg){ page(); title('PROPOSED LAYOUT');
      doc.setFont('times','normal').setFontSize(10).setTextColor(0);
      doc.text(`Kitchen: ${room.name}`,14,48); doc.text(`Kitchen Theme: ${S.options.finish||'Modern'} Style`,14,61); doc.text(`Height Considered: ${HH.wallTop||2500}mm`,14,74);
      await fit(planImg,150,40,660,470); brand(); }

    // elevations, up to four walls a page
    const el=elevs.map((u,i)=>[u,(S.plan.runs[i]||{}).key]).filter(e=>e[0]);
    for(let i=0;i<el.length;i+=4){ page(); title('PROPOSED ELEVATIONS');
      const set=el.slice(i,i+4), cols=set.length>1?2:1, rows=Math.ceil(set.length/cols), cw=(PW-60)/cols, ch=(PH-90)/rows;
      for(let j=0;j<set.length;j++){ const x=30+(j%cols)*cw, y=50+Math.floor(j/cols)*ch;
        await fit(set[j][0],x+6,y,cw-12,ch-18);
        doc.setFont('times','normal').setFontSize(9).setTextColor(60).text(`Wall ${set[j][1]}`,x+cw/2,y+ch-6,{align:'center'}); }
      brand(); }

    // renders
    if(views.length){
      page(true); sp('PROPOSED IMAGES',PW/2,200,30); sp(theme+' THEME',PW/2,268,19); brand();
      for(const v of views){ page(true);
        await fit(v,0,0,PW,PH-26);
        sp('PROPOSED IMAGE',4,PH-17,6,{center:false,cs:1}); sp('FINISHES: '+finish,4,PH-10,5,{center:false,cs:1}); sp('CONSIDERED HEIGHT: '+height,4,PH-3,5,{center:false,cs:1});
        brand(); }
    }

    // accessories, eight to a page
    for(let i=0;i<accNames.length;i+=8){ page(); title('PROPOSED KITCHEN ACCESSORIES');
      for(let j=0;j<8&&i+j<accNames.length;j++){ const x=40+(j%4)*225, y=60+Math.floor(j/4)*235, img=accImgs[i+j];
        doc.setDrawColor(150).setLineWidth(.6).rect(x,y,150,150);
        if(img) await fit(img,x+4,y+4,142,142); else doc.setFont('times','italic').setFontSize(9).setTextColor(150).text('Image not available',x+75,y+78,{align:'center'});
        doc.setFont('times','normal').setFontSize(10).setTextColor(0).text(doc.splitTextToSize(accNames[i+j],170),x+75,y+168,{align:'center'}); }
      brand(); }

    full(deck[20]); full(deck[21]);
    doc.save(`PreSales_${(P.client||'Client').replace(/[^\w]+/g,'_')}_${date}.pdf`);
    return doc;
  }
  root.presalesPdf=presalesPdf;
})(globalThis);
