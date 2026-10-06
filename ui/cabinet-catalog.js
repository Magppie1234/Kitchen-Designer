/* Workbook-driven cabinet pricing and browsing. Pure functions shared by the builder page and
   the tests. Every field read here (carcassSqft, profiles, unitType, subType, path) comes from
   the workbook export or the Models folder; nothing is hardcoded. */
(function(root){
  // Quote: each placed cabinet = selected series rate × that cabinet's workbook Carcass Net Sqft.
  // Amounts are rounded per line and the total is the sum of the shown lines.
  // `rate` is the room's one series rate — every cabinet in a room is priced in that series.
  function cabinetQuote(bom,byCode,rate){
    const lines=[],unpriced=[];
    for(const [code,qty] of Object.entries(bom||{}))for(let i=0;i<qty;i++){
      const sqft=byCode?.[code]?.carcassSqft;
      if(sqft==null||rate==null){unpriced.push(code);continue;}
      lines.push({code,carcassSqft:sqft,rate,amount:Math.round(sqft*rate)});
    }
    return {lines,unpriced,rate,total:lines.reduce((a,l)=>a+l.amount,0)};
  }
  // Shutter profiles offered for a series: the workbook's Design columns whose Modern/Classic
  // band matches the series' finish style.
  function profilesFor(designs,style){
    return Object.keys(designs||{}).filter(d=>!style||designs[d]===style);
  }
  // The one validity test behind both browse modes: null when the cabinet can go in the slot,
  // otherwise the plain reason it cannot (By width lists those too, greyed out).
  const KIND={base:'base',wall720:'wall',wall1085:'wall',loft:'loft',tall2040:'tall',tall2400:'tall',midht:'mid-height'};
  // `family` ({re, name}) narrows an anchor's slot to its own kind: a hob only takes hob cabinets.
  function whyInvalid(e,{cats,maxW,profile,cross,family}){
    if(!cats.includes(e.category))return `${KIND[e.category]||e.category} cabinet — this is a ${[...new Set(cats.map(c=>KIND[c]||c))].join('/')} space`;
    if(family&&!family.re.test(e.code||''))return `not a ${family.name} cabinet`;
    if(e.w>maxW)return `${e.w} mm wide — ${maxW} mm free`;
    if(!cross&&!e.inSeries)return 'not in this series';
    if(profile&&!(e.profiles||[]).includes(profile))return `not offered in shutter profile ${profile}`;
    return null;
  }
  function validEntries(entries,opts){ return (entries||[]).filter(e=>e.path&&!whyInvalid(e,opts)); }
  // Type folder for description browsing: the top Models folder minus the word "Cabinets"
  // ("Base Cabinets" → "Base", "Wall Cabinets 725mm" → "Wall 725mm").
  const typeOf=e=>e.path.split('/')[0].replace(/\s*cabinets\b/i,'').trim();
  // Workbook Description without the type words the folder already says:
  // "Base cabinet + 2 HB drawer" → "2 HB drawer", "Base sink cabinet + …" → "Sink + …".
  function shortDesc(d){
    const t=String(d||'').replace(/\s+/g,' ').trim()
      .replace(/^(mid ht\.? )?(base|wall|tall|loft)? ?(mid ht\.? )?/i,'')
      .replace(/\bcabinet\b ?/i,'').replace(/^[-+] ?/,'').trim();
    return t?t[0].toUpperCase()+t.slice(1):'(no description)';
  }
  // Nested groups: by width = the Models folder path; by description = type › short Description.
  function groupTree(entries,mode){
    const tree={dirs:{},items:[]};
    for(const e of entries){
      const keys=mode==='description'?[typeOf(e),shortDesc(e.description)]:e.path.split('/').slice(0,-1);
      let node=tree;
      for(const k of keys)node=node.dirs[k]??={dirs:{},items:[]};
      node.items.push(e);
    }
    return tree;
  }
  root.CabinetCatalog={cabinetQuote,profilesFor,whyInvalid,validEntries,groupTree,shortDesc};
})(globalThis);
