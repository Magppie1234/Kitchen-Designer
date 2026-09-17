import {readFileSync} from 'node:fs';
import {outline} from '../checkInput.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
export function fixtures(){
  const u=read('default-kitchen');
  // Synthetic current-rule dimensions: replace the old 50mm base return / tall
  // closure combination with one 20mm tall panel. Do not edit the source fixture.
  for(const w of u.walls)if(w.length===4275)w.length=4225;
  for(const zs of Object.values(u.zones))for(const z of zs)if(z.to===4275)z.to=4225;
  u.zones.base.find(z=>z.wall==='CC').to=1450;u.zones.tall[0].from=1450;
  u.anchors.find(a=>a.item==='fridge').at=2670;
  // The symmetric 550mm wall flanks leave an exposed 25mm end panel.
  u.zones.wall.find(z=>z.wall==='BB').to=2725;
  // Explicitly request the known physical solution in the centre-based UI. The
  // original bench request remains separately tested for its reported repair.
  Object.assign(u.anchors.find(a=>a.item==='hob'),{at:1500,width:600});
  const l=structuredClone(u), seven=structuredClone(u), straight=structuredClone(u), concave=structuredClone(u);
  l.project='L runs';l.zones.base=l.zones.base.filter(z=>z.wall!=='CC');
  seven.project='U 7ft';seven.height='7ft';
  straight.project='Straight 12000';straight.walls[0].length=straight.walls[2].length=12000;straight.openings=[];
  straight.anchors=[{item:'sink',wall:'AA',at:1100,width:900},{item:'hob',wall:'AA',at:4500,width:900},{item:'fridge',wall:'AA',at:9550,width:600}];
  straight.zones={base:[{wall:'AA',from:0,to:9000}],wall:[{wall:'AA',from:0,to:9000}],tall:[{wall:'AA',from:9000,to:12000}]};
  concave.project='Concave L room';concave.walls[0].length+=1800;concave.walls[3].length=1500;
  concave.walls.push({id:'EE',length:1800,dir:'W'},{id:'FF',length:1500,dir:'N'});
  concave.openings=concave.openings.filter(o=>o.wall!=='DD');
  for(const x of [...concave.anchors,...concave.openings])if(x.wall==='AA')x.at+=1800;
  for(const row of Object.values(concave.zones))for(const z of row)if(z.wall==='AA'){z.from+=1800;z.to+=1800;}
  const reflected=structuredClone(concave);reflected.project='Concave reversed winding';
  for(const w of reflected.walls)w.dir=({E:'W',W:'E',N:'N',S:'S'})[w.dir];
  return {u,l,seven,straight,concave,reflected};
}
export function uiRequest(j){
  const id=wall=>'W'+j.walls.findIndex(w=>w.id===wall);
  return {anchors:j.anchors.map(a=>({type:a.item,wall:id(a.wall),off:a.at+a.width/2,width:a.width})),options:{
    seriesId:'signature',pg:'PG1',finish:'Classic',ceiling:j.height==='7ft'?2140:2700,kitchenHeightMm:j.height==='7ft'?2140:2500,
    handles:{base:j.handle==='TTS'?'EH':'CJ'},dishwasher:j.dishwasher,
    walls:outline(j.walls).walls.map(w=>({a:[w.x0,w.y0],b:[w.x1,w.y1],length:w.length,thickness:230})),
    openings:j.openings.map(o=>({...o,wall:id(o.wall),off:o.at+o.width/2})),structures:[],
    zones:Object.entries(j.zones).flatMap(([tier,zs])=>zs.map(z=>({wall:id(z.wall),tier,s:z.from,e:z.to})))
  }};
}
// Independent orthogonal-volume reconstruction, deliberately not using KitchenGeometry.
export function measuredVolumes(j,placed){
  let x=0,y=0;const walls=new Map(),points=[];
  for(const w of j.walls){const [dx,dy]=({E:[1,0],S:[0,1],W:[-1,0],N:[0,-1]})[w.dir];points.push([x,y]);walls.set(w.id,{x,y,dx,dy});x+=dx*w.length;y+=dy*w.length;}
  const sign=Math.sign(points.reduce((a,p,i)=>a+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0));
  return Object.entries(placed).flatMap(([tier,ps])=>ps.filter(p=>!p.blocker).map(p=>{
    const w=walls.get(p.wall),nx=-w.dy*sign,ny=w.dx*sign;
    const ax=w.x+w.dx*p.at+nx*(p.offset||0),ay=w.y+w.dy*p.at+ny*(p.offset||0);
    const bx=ax+w.dx*p.width+nx*p.depth,by=ay+w.dy*p.width+ny*p.depth;
    return {code:p.code,role:p.role,tier,wall:p.wall,x0:Math.min(ax,bx),x1:Math.max(ax,bx),y0:Math.min(ay,by),y1:Math.max(ay,by),z0:p.z,z1:p.z+p.height};
  }));
}
export function collisions(boxes){
  const out=[];for(let i=0;i<boxes.length;i++)for(let k=i+1;k<boxes.length;k++){
    const a=boxes[i],b=boxes[k];if(['x','y','z'].every(v=>Math.min(a[v+'1'],b[v+'1'])-Math.max(a[v+'0'],b[v+'0'])>0.01))out.push([a,b]);
  }return out;
}
