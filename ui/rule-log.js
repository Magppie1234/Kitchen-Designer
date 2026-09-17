// Presentation only. Original messages remain available under Technical details.
(function (root) {
  const tierNames = {base:'Base cabinets',wall:'Wall cabinets',tall:'Tall cabinets'};
  const wallName = id => /^\d+$/.test(id) ? `W${id}` : id;
  const plain = value => String(value ?? '')
    .replace(/\bwall (\d+)\b/gi, (_, n) => `wall W${n}`)
    .replace(/\banchors?\b/g, m => m === 'anchor' ? 'appliance position' : 'appliance positions')
    .replace(/\bflanks?\b/g, 'side cabinets').replace(/\btier\b/g, 'cabinet level')
    .replace(/\bzone\b/g, 'cabinet area').replace(/\brun\b/g, 'cabinet row')
    .replace(/\bSKU\b/g, 'catalogue product').replace(/\bmandatory\b/g, 'required')
    .replace(/\bintersects\b/g, 'overlaps').replace(/\bomitted\b/g, 'not included')
    .replace(/\bclosure pieces?\b/g, 'end panels and fillers')
    .replace(/\b(\d+)mm\b/g, '$1 mm');

  function explain(entry) {
    const raw = String(entry.detail ?? '');
    let text = raw, location = '', m;
    if ((m = text.match(/^([^\s/:]+)\/(base|wall|tall):\s*/))) {
      location = `Wall ${wallName(m[1])} · ${tierNames[m[2]]}`;
      text = text.slice(m[0].length);
    } else if ((m = text.match(/^corner ([^/]+)\/([^/:]+)(?:\/(base|wall))?:\s*/))) {
      location = `Corner between walls ${wallName(m[1])} and ${wallName(m[2])}${m[3] ? ' · '+tierNames[m[3]] : ''}`;
      text = text.slice(m[0].length);
    } else if ((m = text.match(/^corner on (\S+) at (\d+):\s*/))) {
      location = `Wall ${wallName(m[1])} · ${m[2]} mm from the wall start`;
      text = text.slice(m[0].length);
    } else if ((m = text.match(/^(\S+):\s*(?=base and wall run|base\/tall junction|tall visible panel|countertop dropdown|\d+mm tall visible panel)/))) {
      location = `Wall ${wallName(m[1])}`;
      text = text.slice(m[0].length);
    }
    const cancelledAccessory = /dish rack required but not placed|vegetable basket required but not placed/.test(text);
    const group = cancelledAccessory ? 'done' : entry.rule === 'Candidate' ? 'alternatives' : entry.rule === 'Unresolved' || entry.rule === 'Edited layout validation' ? 'review'
      : entry.status === 'conflict' ? 'problems' : entry.status === 'assumed' ? 'defaults'
      : entry.status === 'skipped' ? 'preferences' : 'done';
    let title = {problems:'Layout needs a change',review:'Design decision needed',defaults:'Setting used',preferences:'Optional item not included',done:'Design update',alternatives:'Another layout checked'}[group];
    let problem = plain(text), action = group === 'problems' ? 'Review this area in the layout, adjust the cabinet sizes or positions, and generate the design again.' : '';
    if(entry.rule==='Generation'){
      title='Generation could not finish';problem=plain(text);
      action='Check that the local designer server is running, then try Generate Design again. Your previous layout has been kept.';
    } else if (/physical overlap:|overlap by|already there|collides with|occupies a perpendicular tall/.test(text)) {
      title = 'Cabinets are using the same space';
      problem = plain(text.replace(/^physical overlap:/, 'These cabinets overlap:').replace(/(\S+)\/(base|wall|tall)/g, (_,w,t)=>`wall ${wallName(w)} (${tierNames[t].toLowerCase()})`));
      action = 'Check the corner and the cabinet areas on both walls. Reserve the cabinet depth once; do not place another cabinet inside that footprint.';
    } else if ((m=text.match(/^(\d+)mm corner zone is inside the (\d+)mm cabinet depth on wall (\S+);/))) {
      title='Short corner area already occupied';
      problem=`This ${m[1]} mm return lies inside the ${m[2]} mm depth of the cabinets on wall ${wallName(m[3])}. It is reserved for those cabinets, so no second cabinet is placed there.`;
      action='';
    } else if ((m=text.match(/^blind shutter starts (\d+)mm from the corner, (\d+)mm beyond the adjacent cabinet front; (\d+)mm concealed corner space/))) {
      title='Corner shutters aligned';
      problem=`The blind cabinet shutter starts ${m[1]} mm from the inside corner, leaving ${m[2]} mm beyond the neighbouring cabinet front. ${+m[3]?`${m[3]} mm behind the blind cabinet stays concealed and empty; no filler is needed there.`:'The blind cabinet sits against the corner wall.'}`;
      action='';
    } else if (/blind shutter must start/.test(text)) {
      title='The blind cabinet shutter needs more clearance';
      problem=plain(text)+'.';
      action='Adjust the blind cabinet position or shutter opening while keeping the adjacent wall filler. Concealed space behind the cabinet may be up to 100 mm.';
    } else if (/concealed corner space is/.test(text)) {
      title='Too much space behind the corner cabinet';
      problem=plain(text)+'.';
      action='Keep the concealed corner space between 0 and 100 mm and generate again.';
    } else if (/base blind cabinet/.test(text)) {
      title = 'Keep both blind cabinets on the same wall';
      const wall = text.match(/base blind cabinet is on wall (\S+),/)?.[1];
      problem = /matching wall blind cabinet is missing/.test(text)
        ? `The base blind cabinet is on wall ${wallName(wall)}, but its matching wall blind cabinet could not be placed.`
        : plain(text.split('. Place both')[0])+'.';
      action = `Make room for the 900 mm wall blind cabinet on wall ${wallName(wall)}. Keep both blind cabinets at this corner on that wall; do not put the upper one on the adjacent wall.`;
    } else if ((m = text.match(/^(\d+)mm filler closes the remaining space at (\d+)/))) {
      title = 'Empty space closed with a filler';
      problem = `A ${m[1]} mm filler fills the space ${m[2]} mm from the wall start. This space is too small for an available cabinet.`;
      action = '';
    } else if ((m = text.match(/^(\d+)mm gap at (\d+)/))) {
      title = 'The cabinets do not fill this space';
      problem = `A ${m[1]} mm space, starting ${m[2]} mm from the wall start, cannot be filled with the available cabinet sizes and allowed end panels or fillers.`;
      action = 'Try different cabinet sizes or adjust the nearby appliance position or cabinet area, then generate again.';
    } else if (/no corner unit and/.test(text)) {
      title = 'The corner cabinet does not fit';
      problem = 'There is not enough clear space for the corner cabinet, the space it needs on the next wall, and its filler.';
      action = 'Check nearby appliances, doors and windows. Make more room at this corner and generate again.';
    } else if (/wall-width-follows-hob-flank/.test(text)) {
      const width = text.match(/(?:matching|symmetric) (\d+)mm/)?.[1];
      title = group === 'problems' ? 'The cabinets beside the chimney do not match' : 'Matching cabinets beside the chimney';
      problem = group === 'problems' ? `The chimney needs an equal-width cabinet on each side${width ? ', '+width+' mm each' : ''}, sized to suit the base cabinets below. The required pair is missing or does not fit.` : plain(text.replace(/^wall-width-follows-hob-flank:\s*/, '').replace(/symmetric/g,'matching'));
      action = group === 'problems' ? 'Make room on both sides of the chimney, or change the hob-side base cabinets and generate again.' : '';
    } else if (cancelledAccessory) {
      title = 'This accessory rule has been removed';
      problem = 'Dish racks and vegetable baskets are no longer required or automatically recommended. This message belongs to an older design check.';
      action = 'Generate Design again to update the saved checks.';
    } else if (/grain trolley/.test(text) && group === 'problems') {
      title = 'Add a grain trolley';
      problem = 'Every kitchen needs at least one grain trolley. It does not have to sit directly beside the hob.';
      action = 'Make room for a catalogue grain trolley in the base cabinets; it can be two or three cabinets away from the hob.';
    } else if (/bottle pullout/.test(text) && group === 'problems') {
      title = 'Add a bottle pullout near the hob';
      problem = 'At least one bottle pullout is required. It can sit beside the hob or immediately beyond either flanking cabinet.';
      action = 'Make room for a 150 or 300 mm bottle pullout in one of these positions.';
    } else if (entry.rule === 'Appliance position adjusted') {
      title = 'Appliance moved for a better cabinet fit';
    } else if (entry.rule === 'Edited layout validation') {
      title = 'Check your cabinet changes';
      problem = 'Cabinets were edited after the last design check.';
      action = 'Generate Design again to check the new arrangement.';
    } else if (/obstructs|in front of a (door|window)|intersects a structural|intersects (beam|column)/.test(text)) {
      title = 'A cabinet or appliance is blocked';
      problem = plain(text.replace(/\s*\([^)]*\)$/, ''));
      action = 'Move the cabinet or appliance clear of the opening or structure and generate again.';
    } else if (/base and wall run .*must align/.test(text)) {
      title = 'Base and wall cabinets must end together';
      problem = plain(text);
      action = 'Adjust the unfinished cabinet row so both rows end at the same point, then generate again.';
    } else if (/corner filler/.test(text) && group === 'problems') {
      title = 'The corner needs a filler and a regular cabinet';
      action = 'Leave the required filler beside the blind corner, followed immediately by a regular cabinet. Adjust the nearby cabinets and generate again.';
    } else if (/base\/tall junction|tall visible panel|countertop dropdown/.test(text)) {
      title = group === 'problems' ? 'Check the end panel' : 'End panel added';
      problem = plain(text.replace(/base\/tall junction/g,'join between base and tall cabinets').replace(/countertop dropdown/g,'countertop side panel'));
      action = group === 'problems' ? 'Use one tall side panel where base and tall cabinets meet. Use a countertop side panel at an exposed base end, then generate again.' : '';
    } else if (/hob and sink are/.test(text)) {
      title = 'The hob and sink are too close';
      problem = plain(text.replace(/\s*\([^)]*\)$/, ''));
      action = 'Move the hob or sink to leave the stated minimum worktop space between them, then generate again.';
    } else if (/no catalog SKU|unknown catalog code|belongs to|project requires|does not match/.test(text)) {
      title = 'Check this cabinet selection';
      action = 'Choose an available catalogue cabinet with the correct size, height and handle, then generate again.';
    } else if (entry.rule === 'Planning flow') {
      title = 'Cabinet combinations checked';
      problem = 'The design was arranged using available catalogue cabinets and checked against the layout rules.';
    } else if (group === 'preferences') {
      title = 'Optional design choice';
      problem = plain(text.replace(/preferred model omitted:/,'Not included:').replace(/preferred /g,'').replace(/\s*\(rule:[^)]*\)/g,''));
    }
    return {group,title,location,problem,action,technical:raw,rule:entry.rule};
  }

  function groups(log) {
    const out = {problems:[],review:[],done:[],defaults:[],preferences:[],alternatives:[]};
    const seen = new Set();
    for (const entry of log) {
      const item = explain(entry), key = JSON.stringify([item.group,item.location,item.problem,item.action]);
      if (!seen.has(key)) { seen.add(key); out[item.group].push(item); }
    }
    return out;
  }
  root.KitchenRuleLog = {explain,groups};
})(globalThis);
