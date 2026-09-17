import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {layout} from '../engine.mjs';
import {loadCatalog} from '../loadCatalog.mjs';
const input=JSON.parse(readFileSync('verification/filler-3600-input.json','utf8'));
const result=layout(input,loadCatalog().ok);
assert.deepEqual(result.problems,[]);
const row=result.placed.base.filter(p=>p.wall==='2');
assert.deepEqual(row.filter(p=>p.hiddenCorner).map(p=>p.width),[100,57]);
const original=JSON.parse(readFileSync('verification/filler-3600-state.json')).plan.runs.find(r=>r.key==='W2').segments.map(s=>({at:s.x0,width:s.width,role:s.label??'gap filler'}));
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="450" viewBox="0 0 1000 450" role="img" aria-label="Sink wall with concealed corner spaces and a 43 millimetre visible filler"><rect width="1000" height="450" fill="#faf8f3"/><g font-family="Arial,sans-serif" fill="#21433a">';
svg+='<text x="50" y="36" font-size="22">Sink wall - 3600 mm</text><text x="50" y="66" font-size="14">Previous rule: 57 mm and 143 mm visible fillers beside the sink</text><text x="50" y="236" font-size="14">New rule: concealed corner spaces, with only a 43 mm visible filler</text>';
for(const [y,pieces] of [[82,original],[252,row]]){
 for(const p of pieces){
  const filler=p.role==='gap filler',hidden=p.hiddenCorner;
  const x=50+(3600-p.at-p.width)*.25,w=p.width*.25;
  svg+=`<rect x="${x}" y="${y}" width="${w}" height="88" fill="${hidden?'#f1eee5':filler?'#e4c88f':p.role==='sink'?'#81a9b0':'#d8c9a3'}" stroke="#526055" ${hidden?'stroke-dasharray="3 3"':''}><title>${esc(p.role)} - ${p.width} mm</title></rect>`;
  if(!filler&&!hidden)svg+=`<text x="${x+w/2}" y="${y+39}" text-anchor="middle" font-size="13">${esc(p.role.toUpperCase())}</text><text x="${x+w/2}" y="${y+60}" text-anchor="middle" font-size="12">${p.width} mm</text>`;
  if(p.shutter)svg+=`<line x1="${50+(3600-p.shutter.x1)*.25}" x2="${50+(3600-p.shutter.x0)*.25}" y1="${y}" y2="${y}" stroke="#70551e" stroke-width="4"/>`;
  if(y===252&&(hidden||filler)){
   const cx=x+w/2,lx=hidden?(p.at===0?860:130):690;
   svg+=`<path d="M${cx} ${y+88} V355 L${lx} 375" fill="none" stroke="#947129"/><text x="${lx}" y="396" text-anchor="middle" font-size="15" fill="#70551e">${p.width} mm ${hidden?'concealed':'filler'}</text>`;
  }
 }
}
svg+='<text x="50" y="432" font-size="13">Dark front lines show opening shutters. Dashed areas are concealed beneath the countertop, with no filler.</text></g></svg>';
writeFileSync('deliverables/sink-fillers-before-after.svg',svg);
writeFileSync('ui/sink-fillers-preview.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind corners: revised clearance rule</title><style>body{margin:0;background:#faf8f3;font:16px Arial,sans-serif;color:#21433a}main{max-width:1100px;margin:30px auto;padding:20px}svg{width:100%;height:auto}p{line-height:1.6}</style><main>${svg}<p>The sink stays in place. Concealed corner spaces are shown here only to explain the change; they receive no filler. The adjacent wall keeps its required corner filler. Each opening shutter starts 40 mm beyond the neighbouring cabinet front.</p><p>These cabinets are 560 mm deep, so the base shutter starts 600 mm from the inside corner. For a 600 mm front projection, it would start at 640 mm.</p></main></html>`);
console.log('Created revised corner-rule preview from the saved 3600mm layout.');
