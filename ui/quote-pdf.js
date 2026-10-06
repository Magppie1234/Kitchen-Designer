// ui/quote-pdf.js — the client estimate PDF ("Export Estimate" on the quote step).
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

  // Everything the estimate prints, from the same projectQuote() the quote screen shows.
  function gather(){
    if(!root.jspdf){ showToast('PDF library did not load — check the internet connection and reload.'); return null; }
    const pq=projectQuote(), priced=pq.rows.filter(r=>r.priced);
    if(!priced.length){ showToast('Generate a design first.'); return null; }
    const rooms=priced.map(row=>withRoom(row.room,()=>({name:row.room.name, q:row.q, acc:quoteAccItems(),
      series:seriesLabel(row.room.seriesId), group:finishGroupLabel(row.room.seriesId), finish:S.options.lookName, handle:S.handle,
      counterName:S.options.counterName||'Matched to finish', bsName:S.options.backsplashName||S.options.counterName||'Matched to counter'})));
    const cc=pq.cc, gstPct=Math.round(((S.quoteCfg||{}).gstRate??0.18)*100);
    const T={cab:sum(rooms,r=>r.q.cabinets), acc:sum(rooms,r=>r.q.accessories+r.q.sinkAccAmt+r.q.fridgeAccAmt),
      ctop:sum(rooms,r=>r.q.counter), wall:sum(rooms,r=>r.q.wallpanel), svc:sum(rooms,r=>r.q.sectB)+cc.svcVisits+cc.lu+cc.transport};
    const now=new Date(), fmt=d=>[d.getDate(),d.getMonth()+1,d.getFullYear()].map(n=>String(n).padStart(2,'0')).join('-');
    const date=fmt(now);
    const client=S.project.client||'Client', seriesNames=[...new Set(rooms.map(r=>r.series))].join(' / ');
    // services, one line each (per room for the sqft-based ones)
    const multi=rooms.length>1, tag=r=>multi?' — '+r.name:'';
    const svc=[...rooms.flatMap(r=>[['Cabinet Installation Cost','Carcass, hardware, fascia, lighting and skirting'+tag(r),r.q.cabSqft,r.q.R.cab,r.q.svcCab],
        ['Countertop Installation','Countertop fixing at site'+tag(r),r.q.ctopSqft,r.q.R.ctop,r.q.svcCtop],
        ['Installation, Wall Panelling','Wall panelling / backsplash fixing at site'+tag(r),r.q.wallPanelSqft,r.q.R.wall,r.q.svcWall]]),
      ['Site Visit Charges','Four supervisor visits: measurement, EPT marking and PDI',cc.visits,cc.visitRate,cc.svcVisits],
      ['Loading Unloading\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling handling',1,cc.lu,cc.lu],
      ['Transportation\n(Including Countertop & Wall Panelling)','Countertop and wall-panelling transport',1,cc.transport,cc.transport]].filter(s=>s[4]);
    return {pq,rooms,cc,gstPct,T,date,client,seriesNames,svc};
  }

  function downloadQuotePdf(){
    const G=gather(); if(!G) return;
    const {pq,rooms,cc,gstPct,T,date,client,seriesNames,svc}=G;

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
  root.downloadQuotePdf=downloadQuotePdf;
})(globalThis);
