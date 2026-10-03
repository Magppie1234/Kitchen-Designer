<<<<<<< HEAD
// ui/quote-pdf.js — the client estimate PDF ("Export Estimate" on the quote step).
=======
// ui/quote-pdf.js — the client estimate PDF ("Download PDF" on the quote step).
>>>>>>> e2774067c0d47d1d418d831311ca2b77e1ec5bec
// Every number comes from the same projectQuote()/quoteMath() the quote screen shows; only the
// text below is fixed. Drawn with jsPDF + autoTable and saved straight to a file — no print page.
(function(root){
  const GREEN=[26,67,56], GOLD=[196,148,48], PALE=[244,248,247], GREY=[236,241,243];
  const CERT_HEAD='Magppie Wellness Cabinetry is fully built in our patented material, SilverStone, which is certified for the following health and safety features';
  const CERTS=['Formaldehyde Safe','Bacteria Safe','Termite Safe','Fungal Safe','Water Proof','Weather Proof','Scratch Resistant','Stain Proof','Heat Proof','Impact Resistant','Fire Safe'];
  const COMPANY='COMPANY NAME : Magppie Silverstone Private Limited\nADDRESS, HO : 352, Sultanpur, MG Road, New Delhi 110030\nADDRESS, FACTORY : Plot No. 68, Sector-3, Manesar, Haryana';
  const TERMS=`1. Price validity for 2 weeks

2. Shifting of goods on 1st or higher floors
- No extra charges if the service lift is available
- Shifting charges are extra if the manual shifting has to be done on 1st floor and above @ Rs 5,000 per floor

3. Site Requirements
- Magppie cabinets require RCC structure and a brick wall with minimum thickness of 5 inches for proper installation; pre-fabricated or hollow block/brick walls or Aerocon type panels cannot be used, and the customer must disclose this in writing before booking the order.

4. No alterations to be made once order is finalised. Any additions & changes will be charged extra as applicable.

5. Order will be deemed confirmed only after the receipt of signed & approved Estimate, drawings, & receipt of advance from the client.

6. The delivery schedule would be applicable only when the site is certified ready at PDI stage.

7. All outstanding amounts of any nature will need to be settled by the client in order to effect delivery.

8. The client has to provide basic amenities i.e. water, electricity & secured storage space in order to execute installation within a stipulated time frame.

9. No civil works of any nature including, but not limited to, masonry, electrical, plumbing, tiling, sewage, flooring, POP, painting, gas piping, Chimney ducting etc. will be undertaken by the seller.

TALK TO MAGPPIE FOUNDERS
If at any stage, you would like to talk to our founders, please drop the WhatsApp message at +91 70650 58143, and we will schedule your call.`;
  const BLOCKS=[
    ['GUARANTEE','A. 25 Years Unconditional Guarantee against Termite and Manufacturing Defects.\nB. 25 Years Guarantee against Termite.\nC. 10 Years on Hardware.\nD. 10 Years on Accessories.\nE. 2 Years on Lights.'],
    ['SERVICE','5 complimentary services, with one service each year for the first five years.'],
    ['PRICE EXCLUDES','A. Appliances\nB. Sink\nC. Faucet\nD. Installation of Appliances\nE. Installation of Counter/Backsplash unless included in the order.'],
    ['PAYMENT TERMS','Stage 1 : 50% advance of the total order value to be deposited at the time of booking the order.\nStage 2 : 30% at the time of Production Drawing Sign off\nStage 3 : 20% 7 Working days prior to the dispatch'],
    ['ORDER BOOKING AND CANCELLATION POLICY','1. Order will be deemed confirmed only after the receipt of advance payment from the client.\n2. Once the order is booked, there is no cancellation and no refund policy.'],
    ['BANK ACCOUNT DETAILS','Magppie Silverstone Private Limited\nA/C No. 50200084846700\nIFS Code - HDFC0004945\nBank Name- HDFC Bank\nMansarover Building, Sultanpur, New Delhi-110030'],
  ];
  // The cabinet spec block: fixed text, with the room's series, finish and handle filled in.
  const cabinetSpec=r=>`Wellness Cabinets Include: ${r.series}

1. Wellness Carcass thickness: 15 mm Silverstone
2. Finish: ${r.finish||'-'}
3. Door Facias thickness: 6 mm Silverstone, fixed in Aluminium frame
4. Door Facias Category: ${r.group||r.series}
5. Glass Facias Finish: Tinted Glass, fixed in Aluminium frame
6. Kitchen Cabinet Height: 2500 MM
7. Skirting Type: Aluminum, 100 MM
8. Built in Lighting: Vertical profile lights inside Wall Cabinets
9. Built in Lighting: Vertical profile lights inside Tall Cabinets
10. Built in Lighting: Horizontal profile lights under Wall Cabinets
11. Built in Lighting: Horizontal profile lights inside Skirting
12. Hardware: Industrial Grade Hinges by MAGPPIE
13. Hardware: Industrial Grade Drawer Systems by MAGPPIE, weight bearing capacity 70 kgs
14. Handles:
 a. Base Cabinets: ${r.handle||'C & J'} Handle
 b. Tall Cabinets: Titus Handle
 c. Wall Cabinets: 15 mm drop, no handle
15. Drawer Bottom: 6 mm Silverstone
16. Drawer Back Wall: 15 mm Silverstone
17. Visible Panel Finish: Same as Solid Door Facias`;

  // jsPDF's built-in fonts have no rupee glyph, so amounts read "Rs" as on the printed estimate.
  const rs=n=>(n<0?'- ':'')+'Rs '+Math.abs(Math.round(n||0)).toLocaleString('en-IN');
  const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);

<<<<<<< HEAD
  // Everything both estimate layouts print, from the same projectQuote() the quote screen shows.
  function gather(){
    if(!root.jspdf){ showToast('PDF library did not load — check the internet connection and reload.'); return null; }
    const pq=projectQuote(), priced=pq.rows.filter(r=>r.priced);
    if(!priced.length){ showToast('Generate a design first.'); return null; }
=======
  function downloadQuotePdf(){
    if(!root.jspdf){ showToast('PDF library did not load — check the internet connection and reload.'); return; }
    const pq=projectQuote(), priced=pq.rows.filter(r=>r.priced);
    if(!priced.length){ showToast('Generate a design first.'); return; }
>>>>>>> e2774067c0d47d1d418d831311ca2b77e1ec5bec
    const rooms=priced.map(row=>withRoom(row.room,()=>({name:row.room.name, q:row.q, acc:quoteAccItems(),
      series:seriesLabel(row.room.seriesId), group:finishGroupLabel(row.room.seriesId), finish:S.options.lookName, handle:S.handle,
      counterName:S.options.counterName||'Matched to finish', bsName:S.options.backsplashName||S.options.counterName||'Matched to counter'})));
    const cc=pq.cc, gstPct=Math.round(((S.quoteCfg||{}).gstRate??0.18)*100);
    const T={cab:sum(rooms,r=>r.q.cabinets), acc:sum(rooms,r=>r.q.accessories+r.q.sinkAccAmt+r.q.fridgeAccAmt),
      ctop:sum(rooms,r=>r.q.counter), wall:sum(rooms,r=>r.q.wallpanel), svc:sum(rooms,r=>r.q.sectB)+cc.svcVisits+cc.lu+cc.transport};
<<<<<<< HEAD
    const now=new Date(), fmt=d=>[d.getDate(),d.getMonth()+1,d.getFullYear()].map(n=>String(n).padStart(2,'0')).join('-');
    const date=fmt(now), validTill=fmt(new Date(now.getTime()+14*864e5));
    const client=S.project.client||'Client', seriesNames=[...new Set(rooms.map(r=>r.series))].join(' / ');
    // services, one line each (per room for the sqft-based ones)
    const multi=rooms.length>1, tag=r=>multi?' — '+r.name:'';
    const svc=[...rooms.flatMap(r=>[['Cabinet Installation Cost','Carcass, hardware, fascia, lighting and skirting'+tag(r),r.q.cabSqft,r.q.R.cab,r.q.svcCab],
        ['Countertop Installation','Countertop fixing at site'+tag(r),r.q.ctopSqft,r.q.R.ctop,r.q.svcCtop],
        ['Installation, Wall Panelling','Wall panelling / backsplash fixing at site'+tag(r),r.q.wallPanelSqft,r.q.R.wall,r.q.svcWall]]),
      ['Site Visit Charges','Four supervisor visits: measurement, EPT marking and PDI',cc.visits,cc.visitRate,cc.svcVisits],
      ['Loading Unloading\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling handling',1,cc.lu,cc.lu],
      ['Transportation\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling transport',1,cc.transport,cc.transport]].filter(s=>s[4]);
    return {pq,rooms,cc,gstPct,T,date,validTill,client,seriesNames,svc};
  }

  function downloadQuotePdf(){
    const G=gather(); if(!G) return;
    const {pq,rooms,cc,gstPct,T,date,client,seriesNames,svc}=G;
=======
    const now=new Date(), date=[now.getDate(),now.getMonth()+1,now.getFullYear()].map(n=>String(n).padStart(2,'0')).join('-');
    const client=S.project.client||'Client', seriesNames=[...new Set(rooms.map(r=>r.series))].join(' / ');
>>>>>>> e2774067c0d47d1d418d831311ca2b77e1ec5bec

    const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'a4'}), W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=30;
    let y=M;
    const table=o=>{ doc.autoTable({startY:y,margin:{left:M,right:M,top:M,bottom:40},theme:'grid',
      styles:{fontSize:8,cellPadding:4,lineColor:[205,214,218],lineWidth:.5,textColor:[30,30,30],overflow:'linebreak',valign:'middle'},
      headStyles:{fillColor:GREEN,textColor:255,fontStyle:'bold'},...o}); y=doc.lastAutoTable.finalY+10; };
    const banner=(t,size=13)=>table({head:[[{content:t,styles:{halign:'center',fontSize:size,cellPadding:7}}]]});
    const block=(title,text)=>table({head:[[title]],body:[[text]],bodyStyles:{fillColor:PALE,cellPadding:9},pageBreak:'avoid',rowPageBreak:'avoid'});
    const page=()=>{ doc.addPage(); y=M; };
    const label={fontStyle:'bold',fillColor:GREY}, right={halign:'right'};
    // a right-aligned label spanning `span` columns, then the amount
    const totalRow=(text,amt,span,st={})=>[{content:text,colSpan:span,styles:{halign:'right',fontStyle:'bold',...st}},{content:rs(amt),styles:{halign:'right',fontStyle:'bold',...st}}];
    const grand={fillColor:GREEN,textColor:255,fontSize:10};

    // ---- page 1: project summary ----
    banner('WELLNESS KITCHEN CABINETS');
    table({body:[['Kind Attention',client,'Date',date],['Quotation for','Wellness Kitchen Cabinets & Accessories','City',S.project.city||'-'],['Site Address','-','Drawing No','Proposal']],
      columnStyles:{0:{...label,cellWidth:90},2:{...label,cellWidth:90},3:{cellWidth:230}}});
    table({body:[[{content:'PROJECT SUMMARY\nThank you for choosing Magppie and joining the Wellness Living revolution.\nBelow is a consolidated view of your estimated project investment. A detailed item-wise quotation follows.',styles:{fillColor:PALE,cellPadding:12,fontSize:9}},
      {content:'TOTAL ESTIMATED INVESTMENT\n'+rs(pq.total)+'\nIncluding GST',styles:{fillColor:GREEN,textColor:255,halign:'right',fontStyle:'bold',fontSize:12,cellPadding:12,cellWidth:210}}]]});
    table({theme:'plain',body:[[`KITCHEN AREAS   ${rooms.length}          SERIES   ${seriesNames}`]],styles:{fontSize:8,fontStyle:'bold',textColor:GREEN,cellPadding:2}});
    table({head:[['SCOPE OF INVESTMENT',{content:'ESTIMATED AMOUNT',styles:right}]],columnStyles:{1:{halign:'right',cellWidth:170}},
      body:[['Kitchen Cabinetry',rs(T.cab)],['Kitchen Accessories',rs(T.acc)],['Kitchen Countertop',rs(T.ctop)],['Kitchen Wall Panelling / Backsplash',rs(T.wall)],['Installation & Services',rs(T.svc)],
        ...(pq.disc?[['Discount',rs(pq.disc)]]:[]),
        totalRow('Subtotal (Excluding GST)',pq.beforeGst,1,{fillColor:GREY}),totalRow(`GST @ ${gstPct}%`,pq.gst,1),
        totalRow('Total Estimated Project Investment (Including GST)',pq.total,1,grand)]});

    // ---- item-wise price offer, one block per room ----
    page();
    doc.setFont('helvetica','bold').setFontSize(9).setTextColor(30);
    doc.text('WELLNESS KITCHENS : 100% STONE, 0% WOOD',W/2,y+4,{align:'center'});
    doc.text('Zero Formaldehyde, Cancer Safe, Bacteria Safe, Fungal Safe, Termite Safe, Fire Safe, Scratch Resistant, Stain Proof, 25 Years Guarantee.',W/2,y+15,{align:'center'});
    y+=22;
    banner(`PRICE OFFER : Kitchen Cabinets, Accessories, Countertop & Wall Panelling (${seriesNames})`,11);
    const offer=[];
    rooms.forEach((r,i)=>{ const q=r.q;
      const lines=[['Wellness Cabinets',cabinetSpec(r),q.cabSqft+' sqft',q.cabQuote.rate==null?'-':rs(q.cabQuote.rate),rs(q.cabinets)],
        ...r.acc.map((a,j)=>[j?'':'Kitchen Accessories',a.name,a.qty,rs(a.price),rs(a.price*a.qty)]),
        ['Countertop',r.counterName,q.ctopSqft+' sqft',rs(q.ctopSqft?q.counter/q.ctopSqft:0),rs(q.counter)],
        ...(q.wallpanel?[['Wall Panelling / Backsplash',r.bsName,q.wallPanelSqft+' sqft',rs(q.wallpanel/q.wallPanelSqft),rs(q.wallpanel)]]:[])];
      // the room's number, name and total sit on its first line only (no row spans, so a long
      // room can run over a page break)
      offer.push(...lines.map((l,j)=>j?['','',...l,'']:[i+1,r.name.toUpperCase(),...l,rs(q.sectA)])); });
    table({head:[['S.No','Area Name','Product','Specs',{content:'Qty/Unit',styles:right},{content:'Price',styles:right},{content:'Amount',styles:right},{content:'Area Wise',styles:right}]],body:offer,
      styles:{fontSize:8,cellPadding:4,lineColor:[205,214,218],lineWidth:.5,textColor:[30,30,30],overflow:'linebreak',valign:'top'},
      columnStyles:{0:{cellWidth:30,halign:'center'},1:{cellWidth:72,fontStyle:'bold',textColor:GREEN},2:{cellWidth:95},4:{halign:'right',cellWidth:58},5:{halign:'right',cellWidth:66},6:{halign:'right',cellWidth:76},7:{halign:'right',cellWidth:76,fontStyle:'bold'}}});

    // ---- cost summary & services ----
<<<<<<< HEAD
=======
    const multi=rooms.length>1, tag=r=>multi?' — '+r.name:'';
    const svc=[...rooms.flatMap(r=>[['Cabinet Installation Cost','Carcass, hardware, fascia, lighting and skirting'+tag(r),r.q.cabSqft,r.q.R.cab,r.q.svcCab],
        ['Countertop Installation','Countertop fixing at site'+tag(r),r.q.ctopSqft,r.q.R.ctop,r.q.svcCtop],
        ['Installation, Wall Panelling','Wall panelling / backsplash fixing at site'+tag(r),r.q.wallPanelSqft,r.q.R.wall,r.q.svcWall]]),
      ['Site Visit Charges','Four supervisor visits: measurement, EPT marking and PDI',cc.visits,cc.visitRate,cc.svcVisits],
      ['Loading Unloading\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling handling',1,cc.lu,cc.lu],
      ['Transportation\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling transport',1,cc.transport,cc.transport]].filter(s=>s[4]);
>>>>>>> e2774067c0d47d1d418d831311ca2b77e1ec5bec
    const A=T.cab+T.acc+T.ctop+T.wall;
    table({pageBreak:'avoid',head:[[{content:'COST SUMMARY & SERVICES',colSpan:7}],['S.No','Area Name','Product','Specs',{content:'Qty/Unit',styles:right},{content:'Price',styles:right},{content:'Amount',styles:right}]],
      columnStyles:{0:{cellWidth:30},1:{cellWidth:72},2:{cellWidth:150},4:{halign:'right',cellWidth:58},5:{halign:'right',cellWidth:66},6:{halign:'right',cellWidth:100}},
      body:[totalRow('Total Cabinetry Amount',T.cab,6,{fontStyle:'normal'}),totalRow('Total Accessories Amount',T.acc,6,{fontStyle:'normal'}),
        totalRow('Total Countertop & Wall Panelling Amount',T.ctop+T.wall,6,{fontStyle:'normal'}),totalRow('Total Amount (A)',A,6,{fillColor:GREY}),
        ...svc.map((s,i)=>[{content:rooms.length+1+i,styles:{halign:'center'}},{content:'Services',styles:{fontStyle:'bold'}},s[0],s[1],s[2],rs(s[3]),rs(s[4])]),
        totalRow('Total Service Amount (B)',T.svc,6,{fillColor:GREY}),
        ...(pq.disc?[totalRow('Discount',pq.disc,6,{fontStyle:'normal'})]:[]),
        totalRow('Total A+B (Excluding GST)',pq.beforeGst,6,{fillColor:GREY}),totalRow(`GST @ ${gstPct}%`,pq.gst,6,{fontStyle:'normal'}),
        totalRow('Grand Total (Including GST)',pq.total,6,grand)]});
    table({theme:'plain',pageBreak:'avoid',body:[[{content:CERT_HEAD,styles:{fontStyle:'bold',textColor:GREEN,fontSize:9}}],[CERTS.map(c=>'• Certified '+c).join('\n')]],styles:{fontSize:8,cellPadding:2}});
    block('TERM SHEET',COMPANY);

    // ---- fixed terms ----
    page();
    banner('TERMS & COMMERCIAL DETAILS',10);
    block('TERMS AND CONDITIONS',TERMS);
    BLOCKS.forEach(b=>block(b[0],b[1]));

    const n=doc.getNumberOfPages();
    for(let p=1;p<=n;p++){ doc.setPage(p); doc.setDrawColor(...GOLD).setLineWidth(.8).line(M,H-28,W-M,H-28);
      doc.setFont('helvetica','normal').setFontSize(7).setTextColor(90);
      doc.text('MAGPPIE WELLNESS KITCHENS',M,H-17); doc.text(`Page ${p} of ${n}`,W/2,H-17,{align:'center'}); }
    doc.save(`Estimate_${client.replace(/[^\w]+/g,'_')}_${date}.pdf`);
    return doc;
  }
<<<<<<< HEAD
  // ---------------------------------------------------------------------------------------
  // The redesigned estimate: A4 portrait in the app's own palette (ink, cream, gold), the
  // Magppie logo, a share-of-spend summary, a compact spec sheet instead of one tall cell,
  // payment stages as cards and a sign-off block. Same numbers as downloadQuotePdf().
  const INK=[42,39,34], CREAM=[248,245,239], LINE=[228,221,208], GOLDV=[180,147,111], MUTED=[124,118,108], RUST=[160,71,47];
  const PAY=[['50%','Advance','At the time of booking the order'],['30%','Drawing sign-off','At Production Drawing sign-off'],['20%','Before dispatch','7 working days prior to dispatch']];
  const loadImg=src=>new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.onerror=()=>r(null); i.src=src; });

  async function downloadQuotePdfV2(){
    const G=gather(); if(!G) return;
    const {pq,rooms,gstPct,T,date,validTill,client,seriesNames,svc}=G;
    const logo=await loadImg((root.API||'')+'/assets/presales/logo.png');
    const doc=new root.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'a4'}), W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=40, CW=W-2*M;
    let y=M;
    const font=(size,style='normal',c=INK,face='helvetica')=>doc.setFont(face,style).setFontSize(size).setTextColor(...[].concat(c));
    const caps=(t,x,yy,size=7.5,c=MUTED,align='left')=>{ font(size,'bold',c); const cs=size*0.16, w=doc.getTextWidth(t)+cs*(t.length-1);
      doc.text(t,align==='right'?x-w:align==='center'?x-w/2:x,yy,{charSpace:cs}); };
    const rule=(yy,c=LINE,w=.6,x0=M,x1=W-M)=>doc.setDrawColor(...c).setLineWidth(w).line(x0,yy,x1,yy);
    const need=h=>{ if(y+h>H-60){ doc.addPage(); y=M+10; } };
    const heading=(t,sub)=>{ need(60); font(17,'normal',INK,'times'); doc.text(t,M,y+14); rule(y+22,GOLDV,1.2,M,M+40);
      if(sub){ font(8,'normal',MUTED); doc.text(sub,M,y+36); y+=50; } else y+=36; };
    const tbl=o=>{ doc.autoTable({startY:y,margin:{left:M,right:M,top:M+10,bottom:60},theme:'plain',
      styles:{font:'helvetica',fontSize:8.5,textColor:INK,cellPadding:{top:6,bottom:6,left:4,right:4},valign:'top',overflow:'linebreak'},
      headStyles:{fontSize:7,fontStyle:'bold',textColor:MUTED,cellPadding:{top:5,bottom:5,left:4,right:4}},
      didDrawCell:d=>{ if(d.column.index===0) rule(d.cell.y+d.cell.height,d.section==='head'?INK:LINE,d.section==='head'?.8:.5); },...o});
      y=doc.lastAutoTable.finalY+18; };
    const R={halign:'right'};

    // ---- page 1: header, client, total, summary ----
    if(logo) doc.addImage(logo,'PNG',M,y,110,21);
    font(24,'normal',INK,'times'); doc.text('Estimate',W-M,y+16,{align:'right'});
    y+=40; rule(y,INK,1);
    y+=22;
    const col=(x,label,lines,w)=>{ caps(label,x,y); font(11,'bold'); doc.text(doc.splitTextToSize(lines[0],w)[0],x,y+17);
      font(8.5,'normal',MUTED); lines.slice(1).forEach((l,i)=>doc.text(l,x,y+31+i*12)); };
    col(M,'PREPARED FOR',[client,S.project.city||'-','Site address: -'],CW*0.3);
    col(M+CW*0.33,'PROJECT',['Wellness Kitchen & Accessories',`Series: ${seriesNames}`,`Kitchen areas: ${rooms.length}  ·  Drawing: Proposal`],CW*0.42);
    col(M+CW*0.80,'DATE',[date,`Valid till ${validTill}`],CW*0.2);
    y+=74;

    // total card
    doc.setFillColor(...INK).roundedRect(M,y,CW,92,6,6,'F');
    caps('TOTAL ESTIMATED INVESTMENT',M+22,y+26,7.5,GOLDV);
    font(30,'normal',255,'times'); doc.text(rs(pq.total),M+22,y+62);
    font(8,'normal',[200,195,185]); doc.text(`Including GST @ ${gstPct}%`,M+22,y+78);
    [['Subtotal (excl. GST)',pq.beforeGst],[`GST @ ${gstPct}%`,pq.gst],...(pq.disc?[['Discount',pq.disc]]:[])].forEach(([k,v],i)=>{
      font(8,'normal',[200,195,185]); doc.text(k,W-M-200,y+34+i*16); font(9,'bold',255); doc.text(rs(v),W-M-22,y+34+i*16,{align:'right'}); });
    y+=118;

    // scope of investment with share bars
    heading('Scope of investment','A consolidated view of your estimated investment. The item-wise quotation follows.');
    const scope=[['Kitchen Cabinetry',T.cab],['Kitchen Accessories',T.acc],['Kitchen Countertop',T.ctop],['Wall Panelling / Backsplash',T.wall],['Installation & Services',T.svc]];
    const base=scope.reduce((t,s)=>t+s[1],0)||1;
    scope.forEach(([k,v])=>{ font(9.5,'normal'); doc.text(k,M,y+4);
      const bx=M+190, bw=CW-190-110, f=Math.max(0,v/base);
      doc.setFillColor(...CREAM).roundedRect(bx,y-2,bw,6,3,3,'F'); if(f) doc.setFillColor(...GOLDV).roundedRect(bx,y-2,Math.max(6,bw*f),6,3,3,'F');
      font(7.5,'normal',MUTED); doc.text(Math.round(f*100)+'%',bx+bw+8,y+4);
      font(9.5,'bold'); doc.text(rs(v),W-M,y+4,{align:'right'}); y+=12; rule(y); y+=16; });
    y+=4;
    const line=(k,v,o={})=>{ font(o.size||9,o.bold?'bold':'normal',o.c||INK); doc.text(k,W-M-170,y,{align:'right'}); doc.text(rs(v),W-M,y,{align:'right'}); y+=o.gap||16; };
    if(pq.disc) line('Discount',pq.disc,{c:RUST});
    line('Subtotal (excluding GST)',pq.beforeGst); line(`GST @ ${gstPct}%`,pq.gst,{gap:10});
    rule(y,INK,.8,W-M-260); y+=18; line('Total (including GST)',pq.total,{size:12,bold:true,gap:28});

    // certifications
    need(120);
    doc.setFillColor(...CREAM).roundedRect(M,y,CW,112,6,6,'F');
    caps('SILVERSTONE — CERTIFIED FOR HEALTH & SAFETY',M+18,y+22,7.5,INK);
    font(7.5,'normal',MUTED); doc.text('Magppie Wellness Cabinetry is fully built in our patented material, SilverStone.',M+18,y+35);
    CERTS.forEach((c,i)=>{ const x=M+18+(i%4)*((CW-36)/4), yy=y+56+Math.floor(i/4)*17;
      doc.setFont('zapfdingbats','normal').setFontSize(8).setTextColor(...GOLDV).text('4',x,yy); font(8.5,'normal'); doc.text(c,x+12,yy); });
    y+=134;

    // ---- item-wise quotation ----
    doc.addPage(); y=M+10;
    heading('Itemised quotation','Wellness Kitchens : 100% stone, 0% wood. Zero formaldehyde, cancer safe, bacteria, fungal and termite safe, fire safe, 25 years guarantee.');
    rooms.forEach((r,i)=>{ const q=r.q;
      need(90);
      doc.setFillColor(...CREAM).rect(M,y,CW,26,'F');
      font(10,'bold'); doc.text(`${i+1}.  ${r.name}`,M+10,y+17); font(8,'normal',MUTED); doc.text(`${r.series} · ${r.finish||'-'}`,M+10+doc.getTextWidth(`${i+1}.  ${r.name}`)*10/8+14,y+17);
      font(10,'bold'); doc.text(rs(q.sectA),W-M-10,y+17,{align:'right'}); y+=34;
      const body=[[{content:'Wellness Cabinets',styles:{fontStyle:'bold'}},`${r.series} series, ${r.finish||'-'} finish. Full specification below.`,q.cabSqft+' sqft',q.cabQuote.rate==null?'-':rs(q.cabQuote.rate),rs(q.cabinets)],
        ...r.acc.map((a,j)=>[j?'':{content:'Accessories',styles:{fontStyle:'bold'}},a.name,a.qty,rs(a.price),rs(a.price*a.qty)]),
        [{content:'Countertop',styles:{fontStyle:'bold'}},r.counterName,q.ctopSqft+' sqft',rs(q.ctopSqft?q.counter/q.ctopSqft:0),rs(q.counter)],
        ...(q.wallpanel?[[{content:'Wall Panelling',styles:{fontStyle:'bold'}},r.bsName,q.wallPanelSqft+' sqft',rs(q.wallpanel/q.wallPanelSqft),rs(q.wallpanel)]]:[])];
      tbl({head:[['ITEM','DESCRIPTION',{content:'QTY',styles:R},{content:'RATE',styles:R},{content:'AMOUNT',styles:R}]],body,
        columnStyles:{0:{cellWidth:88},2:{halign:'right',cellWidth:56},3:{halign:'right',cellWidth:66},4:{halign:'right',cellWidth:76,fontStyle:'bold'}}});
      // spec sheet: the numbered points in two columns
      const pts=cabinetSpec(r).split('\n').slice(2).filter(Boolean).map(l=>l.replace(/^\d+\.\s*/,'')).reduce((a,l)=>/^\s*[a-c]\.\s/.test(l)?(a[a.length-1]+='  '+l.trim(),a):(a.push(l),a),[]);
      const half=Math.ceil(pts.length/2), lw=(CW-40)/2; font(7.5);
      const rowsH=Math.max(...[pts.slice(0,half),pts.slice(half)].map(c=>c.reduce((t,l)=>t+doc.splitTextToSize(l,lw-12).length*10+3,0)));
      need(rowsH+44);
      doc.setDrawColor(...LINE).setLineWidth(.6).roundedRect(M,y,CW,rowsH+40,6,6,'S');
      caps('CABINET SPECIFICATION — '+r.series.toUpperCase(),M+16,y+20,7,INK);
      [pts.slice(0,half),pts.slice(half)].forEach((c,ci)=>{ let yy=y+38; c.forEach((l,li)=>{ const x=M+16+ci*(lw+8);
        font(7,'bold',GOLDV); doc.text(String(ci*half+li+1).padStart(2,'0'),x,yy);
        font(7.5,'normal'); const t=doc.splitTextToSize(l,lw-12); doc.text(t,x+14,yy); yy+=t.length*10+3; }); });
      y+=rowsH+60; });

    // ---- services and totals ----
    heading('Installation & services');
    tbl({head:[['SERVICE','DETAILS',{content:'QTY',styles:R},{content:'RATE',styles:R},{content:'AMOUNT',styles:R}]],
      body:svc.map(s=>[{content:s[0].replace('\n',' '),styles:{fontStyle:'bold'}},s[1],s[2],rs(s[3]),rs(s[4])]),
      columnStyles:{0:{cellWidth:130},2:{halign:'right',cellWidth:44},3:{halign:'right',cellWidth:66},4:{halign:'right',cellWidth:76,fontStyle:'bold'}}});
    need(200);
    caps('COST SUMMARY',W-M-260,y); y+=16;
    const A=T.cab+T.acc+T.ctop+T.wall;
    line('Cabinetry',T.cab); line('Accessories',T.acc); line('Countertop & wall panelling',T.ctop+T.wall);
    rule(y-8,LINE,.5,W-M-260); line('Total amount (A)',A,{bold:true}); line('Services (B)',T.svc,{bold:true});
    if(pq.disc) line('Discount',pq.disc,{c:RUST});
    line('A + B (excluding GST)',pq.beforeGst); line(`GST @ ${gstPct}%`,pq.gst,{gap:8});
    doc.setFillColor(...INK).roundedRect(W-M-260,y,260,34,5,5,'F');
    font(9,'bold',GOLDV); doc.text('GRAND TOTAL',W-M-246,y+21); font(13,'bold',255); doc.text(rs(pq.total),W-M-14,y+22,{align:'right'});
    y+=58;

    // ---- terms ----
    doc.addPage(); y=M+10;
    heading('Payment & terms');
    const pw=(CW-20)/3;
    PAY.forEach(([pct,t,d],i)=>{ const x=M+i*(pw+10);
      doc.setFillColor(...CREAM).roundedRect(x,y,pw,70,6,6,'F');
      font(22,'normal',RUST,'times'); doc.text(pct,x+14,y+30); caps(`STAGE ${i+1}  ·  ${t.toUpperCase()}`,x+14,y+46,6.5,INK);
      font(7.5,'normal',MUTED); doc.text(doc.splitTextToSize(d,pw-28),x+14,y+59); });
    y+=92;
    // the text blocks flow down two columns, then on to the next page
    const blocks=[['TERMS AND CONDITIONS',TERMS],...BLOCKS.filter(b=>b[0]!=='PAYMENT TERMS'&&b[0]!=='BANK ACCOUNT DETAILS')];
    const colW=(CW-24)/2; let cx=0, top=y;
    const put=(t,size,style,c,lh)=>{ font(size,style,c); for(const l of doc.splitTextToSize(t,colW)){
      if(y+lh>H-70){ if(cx){ doc.addPage(); top=M+10; cx=0; } else cx=1; y=top; }
      doc.text(l,M+cx*(colW+24),y); y+=lh; } };
    blocks.forEach(([h,t])=>{ if(y+40>H-70){ if(cx){ doc.addPage(); top=M+10; cx=0; } else cx=1; y=top; }
      put(h,7.5,'bold',INK,12); y+=2; t.split('\n').forEach(p=>p.trim()?put(p,7.5,'normal',MUTED,10):(y+=5)); y+=14; });
    // bank details and sign-off continue the same two-column flow, as column-wide cards
    const card=(h,draw)=>{ if(y+h>H-70){ if(cx){ doc.addPage(); top=M+10; cx=0; } else cx=1; y=top; }
      const x=M+cx*(colW+24); doc.setDrawColor(...LINE).setLineWidth(.6).roundedRect(x,y,colW,h,6,6,'S'); draw(x+16,y,colW-32); y+=h+14; };
    const bank=BLOCKS.find(b=>b[0]==='BANK ACCOUNT DETAILS')[1].split('\n');
    card(40+bank.length*13,(x,yy)=>{ caps('BANK ACCOUNT DETAILS',x,yy+20,7,INK);
      bank.forEach((l,i)=>{ font(8,i?'normal':'bold',i?MUTED:INK); doc.text(l,x,yy+38+i*13); }); });
    card(118,(x,yy,w)=>{ caps('ACCEPTANCE',x,yy+20,7,INK);
      font(7.5,'normal',MUTED); doc.text('I accept this estimate, the drawings and the terms above.',x,yy+34);
      [['Client signature & date',client],['For Magppie Silverstone','Authorised signatory']].forEach(([a,b],i)=>{ const sx=x+i*(w/2+6);
        rule(yy+80,INK,.6,sx,sx+w/2-10); font(7.5,'bold'); doc.text(a,sx,yy+92); font(7,'normal',MUTED); doc.text(b,sx,yy+102); }); });

    // footer
    const n=doc.getNumberOfPages();
    for(let p=1;p<=n;p++){ doc.setPage(p); rule(H-38,LINE,.6);
      font(6.5,'normal',MUTED);
      doc.text('Magppie Silverstone Pvt. Ltd.  ·  352, Sultanpur, MG Road, New Delhi 110030  ·  Factory: Plot 68, Sector 3, Manesar',M,H-24);
      doc.text(`Page ${p} of ${n}`,W-M,H-24,{align:'right'}); }
    doc.save(`Estimate_${client.replace(/[^\w]+/g,'_')}_${date}.pdf`);
    return doc;
  }
  root.downloadQuotePdf=downloadQuotePdf;
  root.downloadQuotePdfV2=downloadQuotePdfV2;
=======
  root.downloadQuotePdf=downloadQuotePdf;
>>>>>>> e2774067c0d47d1d418d831311ca2b77e1ec5bec
})(globalThis);
