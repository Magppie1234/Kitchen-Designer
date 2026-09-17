import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import '../ui/detailed-plan.js';
const db=new DatabaseSync('db/design.sqlite',{readOnly:true});
const rows=db.prepare('SELECT name,state FROM rooms WHERE deleted_at IS NULL').all();db.close();
let n=0;
for(const row of rows){
  const state=JSON.parse(row.state);if(!state.plan||!state.walls?.length)continue;
  state.roomName=row.name;
  const xs=state.walls.flatMap(w=>[w.a[0],w.b[0]]),ys=state.walls.flatMap(w=>[w.a[1],w.b[1]]);
  const minX=Math.min(...xs),minY=Math.min(...ys),W=Math.max(...xs)-minX,H=Math.max(...ys)-minY;
  const sc=Math.min(570/W,380/H),ox=(680-W*sc)/2-minX*sc,oy=(480-H*sc)/2-minY*sc;
  const t={sc,X:x=>x*sc+ox,Y:y=>y*sc+oy};
  // Use the same opening renderer as the app, with its geometry helpers.
  const html=readFileSync('ui/builder.html','utf8');
  const vm=await import('node:vm');
  const ctx=vm.createContext({S:state,WALL_MM:125,Math,ptOnWall:(w,off)=>{const l=w.length;return [t.X(w.a[0]+(w.b[0]-w.a[0])*off/l),t.Y(w.a[1]+(w.b[1]-w.a[1])*off/l)];},inwardPx:w=>{const l=w.length,sgn=Math.sign(state.walls.reduce((a,w)=>a+w.a[0]*w.b[1]-w.b[0]*w.a[1],0))||1;return [-(w.b[1]-w.a[1])/l*sgn,(w.b[0]-w.a[0])/l*sgn];}});
  const start=html.indexOf('function doorFlip('),end=html.indexOf('\nfunction ',html.indexOf('function drawOpeningSym(')+10);
  vm.runInContext(html.slice(start,end),ctx);
  let i=0;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="1040" viewBox="0 0 680 520">${DetailedPlan.render(state,t,ctx.drawOpeningSym,()=>i++)}</svg>`;
  const file=`verification/detailed-plan-${++n}`;writeFileSync(file+'.svg',svg);
  try{const {Resvg}=await import('./render-tools/node_modules/@resvg/resvg-js/index.js');writeFileSync(file+'.png',new Resvg(svg).render().asPng());}catch(e){console.log('PNG render:',e.message);}
  console.log(file,row.name,i,'modules');
}
