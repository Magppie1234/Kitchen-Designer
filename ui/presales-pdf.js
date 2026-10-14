// ui/presales-pdf.js — the pre-sales presentation deck ("Pre-sales PDF" on the quote step).
// Follows the PG-2 template (16:9, drawn at 960×540): brand pages 1–9 and the closing page are
// images cut from that PDF (assets/presales/pgNN); the client page, 2D layout, elevations and
// perspective views (each a full landscape page) and the QR page are drawn from the active room.
// No prices — the estimate is its own PDF.
(function(root){
  const PW=960, PH=540, CREAM=[241,237,226], GREEN=[26,59,46], MUTED=[85,98,90];
  const QR_URL='https://magppie.com';   // "Explore Our Kitchen Designs" page
  const asset=p=>(root.API||'')+'/assets/'+p;
  const load=src=>new Promise(r=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>r(i); i.onerror=()=>r(null); i.src=src; });
  const url=u=>u?((root.API?root.API+'/':'')+u):null;
  // any image (SVG string, URL) → JPEG data URL on a white sheet (jsPDF can't take SVG)
  const toJpeg=(i,w,h)=>{ if(!i) return null; const c=document.createElement('canvas'); c.width=w||i.naturalWidth; c.height=h||i.naturalHeight;
    const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(i,0,0,c.width,c.height); return c.toDataURL('image/jpeg',0.9); };
  const svgPng=(svg,w,h)=>load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)).then(i=>toJpeg(i,w,h));
  const swatch=u=>u?load(u).then(i=>{ if(!i) return null; const k=Math.min(1,200/Math.max(i.naturalWidth,i.naturalHeight));
    return toJpeg(i,Math.round(i.naturalWidth*k),Math.round(i.naturalHeight*k)); }):null;

  // asks for the people on the deck's client page; remembered on the project
  function askDetails(revision){
    const p=S.project, d=document.createElement('dialog');
    d.style.cssText='border:none;border-radius:16px;padding:24px 26px;width:360px;font-family:inherit;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)';
    const f=(k,l,v)=>`<label style="display:block;font-size:12px;font-weight:600;color:#6B675E;margin-top:12px">${l}<input name="${k}" class="tf" style="margin-top:6px" value="${esc(v||'')}"></label>`;
    d.innerHTML=`<div style="font-size:18px;font-weight:500">Pre-sales PDF</div>
      ${f('relationship','Relationship Person',p.relationship)}${f('designer','Designer',p.designer||p.architect)}
      <div style="font-size:12px;font-weight:600;color:#6B675E;margin-top:12px">Revision <span style="margin-left:6px;color:#1C1B18">${String(revision).padStart(2,'0')}</span></div>
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
    const revision=root.presalesRevNumber?presalesRevNumber():1;
    if(!await askDetails(revision)) return;
    showToast('Building the pre-sales PDF…');
    const P=S.project, now=new Date(), rev=String(revision).padStart(2,'0');
    const date=[now.getDate(),now.getMonth()+1,now.getFullYear()].map(n=>String(n).padStart(2,'0')).join('-');
    const client=P.client||'Client';

    // Material & Finishes rows: [label, value, swatch image URL]
    const finish=root.currentFinishEntry?currentFinishEntry():null, handle=root.handleCode?handleCode(S.handle):S.handle;
    const counterImg=S.options.counterImg||(finish&&finish.countertop&&finish.countertop.img)||(finish&&finish.img);
    const materials=[
      ['Countertop',S.options.counterName||'Matched to finish',url(counterImg)],
      ['Cabinet Fronts',[S.options.lookName,S.options.finish].filter(Boolean).join(', ')||'-',url(finish&&finish.img)],
      ['Backsplash',S.options.backsplashName||S.options.counterName||'Matched to countertop',url(S.options.backsplashImg||counterImg)],
      ['Hardware',handle?`${handle} handles`:'-',null],
    ];

    // everything that has to load or render, in parallel
    draw2d();   // the plan SVG is only filled while the Review tab has drawn it
    const planSvg=$('view2d')&&$('view2d').innerHTML;
    const plan={...S.plan,openings:S.plan.openings||S.openings}, ceil=S.options.ceiling||3100, runs=S.plan.runs||[];
    const [statics,planImg,views,swatches,elevs]=await Promise.all([
      Promise.all(['pg01.jpg','pg02.jpg','pg03.jpg','pg04.jpg','pg05.jpg','pg06.jpg','pg07.jpg','pg08.jpg','pg09.png','pg15.jpg']
        .map(f=>load(asset('presales/'+f)).then(i=>toJpeg(i)))),
      planSvg?svgPng(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 520" width="2040" height="1560">${planSvg}</svg>`,2040,1560):null,
      // rendered at the page's 16:9 so each view fills a landscape page
      S.snapshots&&S.snapshots.length?S.snapshots.map(s=>s.rendered||s.img):(root.renderPerspectives?root.renderPerspectives(scenePlan(),S.walls,{w:1920,h:1080}).catch(()=>[]):[]),
      Promise.all(materials.map(m=>swatch(m[2]))),
      Promise.all(runs.map(r=>root.renderElevation?root.renderElevation(plan,S.walls,r.key,{ceil,px:2400}).catch(()=>null):null)),
    ]);

    const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:[PW,PH]});
    let first=true;
    const page=()=>{ if(!first) doc.addPage([PW,PH],'landscape'); first=false; doc.setFillColor(...CREAM).rect(0,0,PW,PH,'F'); };
    const full=img=>{ page(); if(img) doc.addImage(img,'JPEG',0,0,PW,PH); };
    const font=(size,bold=false,color=GREEN)=>doc.setFont('helvetica',bold?'bold':'normal').setFontSize(size).setTextColor(...color);
    const bar=()=>doc.setFillColor(...GREEN).rect(0,0,PW,12,'F');
    const footer=()=>{ doc.setDrawColor(...GREEN).setLineWidth(.6).line(20,521,812,521); font(15,true); doc.text('MAGPPIE',940,526,{align:'right'}); };
    const heading=(t,sub)=>{ font(34,true); doc.text(t,24,50); if(sub){ font(16,true); doc.text(sub,26,74); } };
    // contain an image inside a box; cover fills the box and crops the overflow evenly
    const fit=async(src,x,y,w,h,cover=false)=>{ const i=typeof src==='string'?await load(src):src; if(!i) return;
      if(cover){ const k=Math.max(w/i.naturalWidth,h/i.naturalHeight), sw=w/k, sh=h/k, c=document.createElement('canvas');
        c.width=Math.round(sw); c.height=Math.round(sh);
        c.getContext('2d').drawImage(i,(i.naturalWidth-sw)/2,(i.naturalHeight-sh)/2,sw,sh,0,0,c.width,c.height);
        doc.addImage(c.toDataURL('image/jpeg',0.9),'JPEG',x,y,w,h); return; }
      const k=Math.min(w/i.naturalWidth,h/i.naturalHeight), iw=i.naturalWidth*k, ih=i.naturalHeight*k;
      doc.addImage(toJpeg(i),'JPEG',x+(w-iw)/2,y+(h-ih)/2,iw,ih); };   // renders may be PNG
    const caption=t=>{ font(9,true); const w=doc.getTextWidth(t)+16; doc.setFillColor(...CREAM).rect(0,PH-22,w,22,'F'); doc.text(t,8,PH-8); };
    const residence=`${client} Residence`;

    statics.slice(0,9).forEach(full);

    // 10 · client page
    page(); bar();
    font(36,true); doc.text('Kitchen Designed Exclusively For',PW/2,150,{align:'center'}); doc.text(client,PW/2,205,{align:'center'});
    font(24);
    [['Date of Design',date],['Relationship Person',P.relationship||'-'],['Designer',P.designer||'-'],['Revised Drawing',rev],['Revised Date',date]]
      .forEach(([k,v],i)=>doc.text(`${k} : ${v}`,29,356+i*33));
    footer();

    // 11 · 2D layout: plan on the left, legend and materials on the right
    page(); bar(); heading('Kitchen Design, 2D Layout',residence);
    doc.setDrawColor(...GREEN).setLineWidth(.8).rect(29,92,915,400);
    if(planImg) await fit(planImg,34,97,696,390);
    const lx=740; doc.setDrawColor(200,196,186).setLineWidth(.5).line(lx-6,104,lx-6,480);
    font(20); doc.text('LEGEND',lx,124);
    const legend=[['Base / tall cabinet',(x,y)=>doc.setDrawColor(40).setLineWidth(.7).setLineDashPattern([],0).rect(x,y,16,10)],
      ['Upper cabinet',(x,y)=>doc.setDrawColor(68,79,188).setLineWidth(.7).setLineDashPattern([2,1.5],0).rect(x,y,16,10)],
      ['Filler / panel',(x,y)=>{ doc.setLineDashPattern([],0).setDrawColor(120).setLineWidth(.5).rect(x,y,16,10); for(let k=3;k<16;k+=4) doc.line(x+k,y+10,x+k+3,y); }],
      ['Dimensions in mm',(x,y)=>{ doc.setLineDashPattern([],0).setDrawColor(165,65,57).setLineWidth(.7).line(x,y+5,x+16,y+5).line(x,y+2,x,y+8).line(x+16,y+2,x+16,y+8); }]];
    legend.forEach(([t,draw],i)=>{ draw(lx,136+i*18); font(11,false,[40,40,40]); doc.text(t,lx+24,145+i*18); });
    doc.setLineDashPattern([],0);
    font(17); doc.text('Material & Finishes',lx,232);
    materials.forEach(([k,v],i)=>{ const y=246+i*58;
      if(swatches[i]) doc.addImage(swatches[i],'JPEG',lx,y,36,36); else doc.setDrawColor(200).setLineWidth(.5).rect(lx,y,36,36);
      font(11,true,[40,40,40]); doc.text(k+':',lx+44,y+11);
      font(9.5,false,MUTED); doc.text(doc.splitTextToSize(v,150).slice(0,3),lx+44,y+24); });
    footer();

    // elevations, one wall to a full landscape page: as large as the wall's proportions allow
    // (never cropped), on the render's own background so the page reads edge to edge
    for(const [i,img] of elevs.entries()){ if(!img) continue;
      page(); doc.setFillColor(248,245,239).rect(0,0,PW,PH,'F'); await fit(img,0,0,PW,PH);
      const a=(runs[i].segments||[]).find(s=>s.kind==='anchor');
      caption(`Elevation · Wall ${runs[i].key}${a?' · '+a.label:''}`); }

    // perspective views, each filling a full landscape page
    for(const v of views){ page(); await fit(v,0,0,PW,PH,true); caption(`Perspective View · ${residence}`); }

    // QR page
    page(); font(34,true); doc.text('Explore Our Kitchen Designs',24,50);
    font(18,false,[60,60,60]); doc.text(['To see the beautiful kitchens designed and executed by Magppie,','scan the QR code and explore various combinations and layouts'],26,82);
    if(root.qrcode){ const q=qrcode(0,'M'); q.addData(QR_URL); q.make(); const n=q.getModuleCount(), s=300/(n+8), x0=PW/2-150, y0=180;
      doc.setFillColor(255,255,255).rect(x0,y0,300,300,'F').setFillColor(0,0,0);
      for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.isDark(r,c)) doc.rect(x0+(c+4)*s,y0+(r+4)*s,s+.15,s+.15,'F');
      font(10,false,MUTED); doc.text(QR_URL.replace(/^https?:\/\//,''),PW/2,500,{align:'center'}); }

    full(statics[9]);
    doc.save(`PreSales_${client.replace(/[^\w]+/g,'_')}_R${rev}_${date}.pdf`);
    if(root.presalesRevIssued) presalesRevIssued();
    return doc;
  }
  root.presalesPdf=presalesPdf;
})(globalThis);
