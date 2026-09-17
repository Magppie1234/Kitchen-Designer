import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MM = 0.001;
let renderer=null, scene=null, camera=null, controls=null, raf=null, mode='orbit';
let container=null, hint=null, bounds=null, roomWalls=[];
let wallMeshes=[];   // {mesh, mx, mz, nx, nz} — for see-through wall culling in orbit
const keys={};
const apiBase=()=> (window.API||'');

let manifest=null, manifestPromise=null;
const loader=new GLTFLoader();
const modelCache=new Map();
async function getManifest(){
  if(manifest) return manifest;
  if(!manifestPromise) manifestPromise=fetch(apiBase()+'/api/models').then(r=>{if(!r.ok)throw new Error('model manifest');return r.json();}).then(m=>manifest=m).catch(()=>null).finally(()=>{manifestPromise=null;});
  return manifestPromise;
}

function stripHand(code){ return code? code.replace(/_(LH|RH)$/,'') : code; }
function resolveEntry(category,width,code){
  if(!manifest||!manifest.models) return null;
  const cands=manifest.models.filter(m=>m.category===category&&m.path);
  if(!cands.length) return null;
  // Stage 7.2 handle groups: prefer the model variant (_CJ/_EH) matching the group's
  // chosen handle family (base / wall / tall / loft — set in the Finishes panel).
  const H=(window.S&&window.S.options&&window.S.options.handles)||null;
  const grp=category==='base'?'base':category.startsWith('wall')?'wall':category==='loft'?'loft':category.startsWith('tall')||category==='midht'?'tall':'base';
  const want=H&&H[grp];
  const near=(list)=> list.slice().sort((a,b)=>
    Math.abs((a.w||0)-width)-Math.abs((b.w||0)-width)
    || (want?((b.variant===want?1:0)-(a.variant===want?1:0)):0))[0];
  if(code){ const exact=cands.filter(m=>m.code===code); if(exact.length) return near(exact);
    const bc=stripHand(code); const byBase=cands.filter(m=>(m.baseCode||stripHand(m.code))===bc); if(byBase.length) return near(byBase); }
  return code ? null : near(cands);
}
function resolveAccessory(type,width){
  if(!manifest||!manifest.models) return null;
  const accs=manifest.models.filter(m=>m.category==='accessory');
  if(type==='kubos') return accs.find(m=>/kubos 2/i.test(m.name))||accs.find(m=>/kubos/i.test(m.name))||null;
  if(type==='tark'){ const w=width>=1100?'1200':width>=750?'900':'600';
    return accs.find(m=>new RegExp('tark '+w,'i').test(m.name)&&!/\bA\b/i.test(m.name))||accs.find(m=>/tark/i.test(m.name))||null; }
  return null;
}
function normalize(gltfScene){
  const box=new THREE.Box3().setFromObject(gltfScene);
  const c=new THREE.Vector3(); box.getCenter(c);
  const grp=new THREE.Group();
  gltfScene.position.set(-c.x,-box.min.y,-c.z);
  grp.add(gltfScene);
  return grp;
}
function loadModel(path){
  if(modelCache.has(path)) return modelCache.get(path);
  const url=apiBase()+'/models/'+encodeURIComponent(path).replace(/%2F/g,'/');
  const p=new Promise((res,rej)=>{ loader.load(url,(g)=>res(normalize(g.scene)),undefined,rej); }).catch(e=>{modelCache.delete(path);throw e;});
  modelCache.set(path,p); return p;
}
const std=(color,o={})=>new THREE.MeshStandardMaterial(Object.assign({color,roughness:0.72,metalness:0.04},o));
function colorFor(kind,label){ if(label==='hob')return 0x2b2b24; if(label==='sink'||label==='veggie sink')return 0x9fb8c8; if(label==='fridge')return 0xB0894C; if(['oven','pantry','crockery'].includes(label))return 0x6b5a3e; if(kind==='corner')return 0x21433A; return 0xEFE9DA; }
/* ---- runtime finishes on the actual 3D materials (Stage 7) ----
   The GLBs ship untextured; the chosen finish photo is applied here as a real material
   map, per role (cabinet / countertop / backsplash). Mapping behaviour per finish comes
   from assets/finish-mapping.json via the classic script:
     'randomised' — deterministic per-panel offset (hash of world position; the ONLY
                    permitted randomness) so no visible tiling across an elevation
     'flow'      — pattern offset by position along the wall, so grain runs continuously
                    across a run (door/window gaps shift it — a known approximation)
     'fixed'     — every panel anchored to the same origin. */
const texLoader=new THREE.TextureLoader();
const texCache=new Map();
let FINISH=null;   // {cabinetImg, counterImg, backsplashImg, mapping, textureWorldMm}
function getTex(url){ if(!texCache.has(url)){ const t=texLoader.load(url); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; texCache.set(url,t); } return texCache.get(url); }
function hash01(a,b){ const s=Math.sin(a*127.1+b*311.7)*43758.5453; return s-Math.floor(s); }
function finishMesh(o,url,mapping,worldMm){
  if(!o.isMesh||!url) return;
  const base=getTex(url), tex=base.clone(); tex.needsUpdate=true;
  const bb=o.geometry.boundingBox||(o.geometry.computeBoundingBox(),o.geometry.boundingBox);
  const sx=(bb?bb.max.x-bb.min.x:1)*(o.scale?o.scale.x:1);
  const wm=(worldMm||1200)*MM;
  tex.repeat.set(Math.max(0.35,sx/wm),1);
  const p=new THREE.Vector3(); o.getWorldPosition(p);
  if(mapping==='flow'){ const ry=o.rotation.y||(o.parent&&o.parent.rotation.y)||0;
    tex.offset.set(((p.x*Math.cos(ry)-p.z*Math.sin(ry))/wm)%1,0); }
  else if(mapping==='fixed'){ tex.offset.set(0,0); }
  else { tex.offset.set(hash01(p.x*1000,p.z*1000),hash01(p.z*1000,p.y*1000)*0.35); }
  o.material=new THREE.MeshStandardMaterial({map:tex,roughness:0.5,metalness:0.05});
}
function applyFinishToObject(root){
  if(!FINISH) return;
  root.traverse(o=>{ if(!o.isMesh||!o.userData.role) return;
    if(o.userData.role==='cabinet') finishMesh(o,FINISH.cabinetImg,FINISH.mapping,FINISH.textureWorldMm);
    else if(o.userData.role==='countertop') finishMesh(o,FINISH.counterImg,'fixed',2400);
    else if(o.userData.role==='backsplash') finishMesh(o,FINISH.backsplashImg,'fixed',2400);
  });
}
// classic-script entry point: set/replace the live scene's finish (no rebuild needed)
window.setSceneFinish=function(cfg){ FINISH=cfg||null; if(scene&&FINISH) applyFinishToObject(scene); };
/* ---- module thumbnails (classic-script entry point) ----
   Small offscreen 3/4 render of the resolved GLB for a module — the preview shown when
   a cabinet is selected in the edit sidebar and on the library "Cards" view. One shared
   offscreen renderer; renders are QUEUED one at a time (single GL context) and the
   resulting dataURLs cached, so a code+width renders once per session. Thumbnails are
   deliberately untextured (no finish applied): they show the cabinet's construction —
   drawers, doors, pull-outs — and stay stable while textures stream in. Resolves null
   (never rejects) when no model exists, so callers can keep their fallback tile. */
let thumbR=null;
const THUMB_W=300, THUMB_H=210;
function thumbRenderer(){
  if(!thumbR){ thumbR=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    thumbR.setSize(THUMB_W,THUMB_H); thumbR.outputColorSpace=THREE.SRGBColorSpace; }
  return thumbR; }
const thumbCache=new Map();
let thumbQ=Promise.resolve();
window.moduleThumb=function(categories,width,code){
  const cats=[].concat(categories||[]);
  const key=cats.join(',')+'|'+(code||'')+'|'+(width||0);
  if(thumbCache.has(key)) return thumbCache.get(key);
  const job=thumbQ.then(async()=>{
    await getManifest(); if(!manifest||!manifest.models) return null;
    // prefer a code (or baseCode) match in ANY of the given categories before falling
    // back to nearest-width — resolveEntry alone always answers within one category,
    // which would hide a wall720 model behind a wall1085 guess.
    let entry=null;
    if(code){ const bc=stripHand(code);
      for(const c of cats){
        const m=manifest.models.filter(x=>x.category===c&&x.path&&(x.code===code||(x.baseCode||stripHand(x.code))===bc));
        if(m.length){ entry=m.sort((a,b)=>Math.abs((a.w||0)-(width||600))-Math.abs((b.w||0)-(width||600)))[0]; break; } } }
    if(!entry) for(const c of cats){ entry=resolveEntry(c,width||600,code); if(entry) break; }
    if(!entry) return null;
    const proto=await loadModel(entry.path);
    const m=proto.clone(true);
    const sc=new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff,0.95));
    const d1=new THREE.DirectionalLight(0xffffff,1.35); d1.position.set(2,3,4); sc.add(d1);
    const d2=new THREE.DirectionalLight(0xffffff,0.5); d2.position.set(-3,2,-2); sc.add(d2);
    sc.add(m); m.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(m), size=new THREE.Vector3(), ctr=new THREE.Vector3();
    box.getSize(size); box.getCenter(ctr);
    const r=Math.max(size.x,size.y,size.z)||1;
    const cam=new THREE.PerspectiveCamera(32,THUMB_W/THUMB_H,0.01,50);
    cam.position.set(ctr.x+r*1.15,ctr.y+r*0.72,ctr.z+r*1.55);
    cam.lookAt(ctr);
    const R=thumbRenderer(); R.render(sc,cam);
    return R.domElement.toDataURL('image/png');
  }).catch(()=>null);
  thumbQ=job.catch(()=>{});   // stay serialized even after a failed render
  thumbCache.set(key,job);
  return job;
};
const TALL_ANCHORS=(window.TALL_ANCHORS||['fridge','oven','pantry','crockery','tallStorage']);
const TALL3D={fridge:'TC1SR1HS',oven:'TC3S1EHSFMO1HS',pantry:'TC1STP1HS',crockery:'TC6GS1GHS',tallStorage:'TC1S1HS'};
function moduleSpecFor(seg){
  const isT=seg.kind==='anchor'&&TALL3D[seg.label], isH=seg.kind==='anchor'&&seg.label==='hob', isS=seg.kind==='anchor'&&seg.label==='sink';
  if(isT) return {category:'tall2400', code:TALL3D[seg.label], tierY:0, h:2400};
  if(isH) return {category:'base', code:'BC2EL1EH', tierY:0, h:720};
  if(isS) return {category:'base', code:'BSC1HS_LH', tierY:0, h:720};
  if(seg.kind==='corner') return {category:'base', code:'BC2EH', tierY:0, h:720};
  // a coded cabinet (hob side pick, veggie sink, library replacement) renders ITS model
  if(seg.kind==='cabinet'&&seg.code) return {category:'base', code:seg.code, tierY:0, h:720};
  return {category:'base', code:'BC2EH', tierY:0, h:720};
}
function WINDOW_T(variant){ if(variant==='fulllength') return {sill:50,h:2100}; return {sill:900,h:1200}; }
// Vertical span (mm, floor-relative) of an opening — the exact hole to punch through the
// wall AND the extent the frame/glass fills, so the 3D cut matches the real stored dims.
// Doors: floor → 2050 head. Windows: use the instance's stored sill / winH (French =
// floor-to-ceiling), falling back to the type defaults only when unset.
const DOOR_HEAD_MM=2050;
function openingVSpan(o){
  if(o.type==='door') return {sill:0, head:DOOR_HEAD_MM};
  const WT=WINDOW_T(o.variant);
  const sill=(o.sill!=null?o.sill:WT.sill), h=(o.winH!=null?o.winH:WT.h);
  return {sill, head:sill+h};
}
function buildKitchen(plan, walls){
  const g=new THREE.Group(); g.userData.active=true; g.userData.volumes=[]; roomWalls=walls;
  const stack=plan.geometry||{baseTop:850,wallBottom:1415,wallTop:2500,tall:2400,counterThickness:30};
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  for(const w of walls) for(const p of [w.a,w.b]){ minx=Math.min(minx,p[0]);miny=Math.min(miny,p[1]);maxx=Math.max(maxx,p[0]);maxy=Math.max(maxy,p[1]); }
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2; bounds={minx,miny,maxx,maxy,cx,cy};
  // WALL_H = the room's real ceiling height (shared with columns, which default to it) so
  // wall tops, column tops and beams all line up instead of using an arbitrary constant.
  // WALL_MM = the SAME thickness the 2D plan uses (exposed on window from the classic script,
  // since this module scope can't read that const directly).
  const WALL_MM=(window.WALL_MM||230);
  const Wp=maxx-minx, Hp=maxy-miny, WALL_H=(window.S&&window.S.options&&window.S.options.ceiling)||2700;
  // tier depths from data/rules.json (window.depthOf is set by the classic script; the
  // literals are the shipped fallbacks for the boot window before /api/config answers)
  const dOf=(t2,f)=>(window.depthOf?window.depthOf(t2):f), D=dOf('base',560), WD_WALL=dOf('wall',336);
  const world=(x,y,z)=> new THREE.Vector3((x-cx)*MM, z*MM, (y-cy)*MM);
  const box=(w,h,d,color,o)=>new THREE.Mesh(new THREE.BoxGeometry(Math.max(w,1)*MM,Math.max(h,1)*MM,Math.max(d,1)*MM), std(color,o));
  // floor follows the real room polygon (convex/concave/polygon), not just the bbox.
  // Shape is built in centred plan coords; rotation.x=-90° lays it on the ground so
  // shape-Y maps to world +Z (hence the -(y-cy) below).
  const fshape=new THREE.Shape();
  walls.forEach((w,i)=>{ const px=(w.a[0]-cx)*MM, py=-(w.a[1]-cy)*MM; i===0?fshape.moveTo(px,py):fshape.lineTo(px,py); });
  fshape.closePath();
  const floor=new THREE.Mesh(new THREE.ShapeGeometry(fshape), std(0xEDE7DA,{roughness:0.96}));
  floor.rotation.x=-Math.PI/2; g.add(floor);
  wallMeshes=[];
  // ---- Walls: real WALL_MM-thick geometry with TRUE cut-through openings ----
  // Each wall is assembled from solid boxes (full thickness = WALL_MM, the same value the
  // 2D top-down plan uses) rather than one thin sheet: full-height PIERS between openings,
  // a HEADER above each opening, and a SILL wall below each window. The openings are real
  // gaps in the geometry, so the jamb reveals show the wall's depth and every opening reads
  // correctly whether the camera is inside the room or outside looking in. A solid BoxGeometry
  // has outward-facing quads on all six sides, so each piece is visible from both sides.
  const T=WALL_MM;                      // 230mm — shared with the 2D plan (no separate 3D number)
  const wallColor=0xF3EFE6, wallOpts={roughness:1,side:THREE.DoubleSide};
  const openSet=(window.S&&window.S.roomMode==='open'&&window.S.openWalls)||[];
  // add one solid wall piece: `alongC` mm from the wall start (centre), `length` along the
  // wall, vertical centre `vc`, `height` tall, full thickness T; registered for see-through culling.
  const addWallPiece=(w,u,ang,np,alongC,length,vc,height)=>{
    if(length<=0.5||height<=0.5) return;
    const thick=w.thickness||T; const px=w.a[0]+u[0]*alongC+np[0]*thick/2, py=w.a[1]+u[1]*alongC+np[1]*thick/2;
    const m=box(length,height,w.thickness||T,wallColor,wallOpts);
    m.position.copy(world(px,py,vc)); m.rotation.y=ang; g.add(m);
    wallMeshes.push({mesh:m, mx:(px-cx)*MM, mz:(py-cy)*MM, nx:np[0], nz:np[1]});
  };
  walls.forEach((w,wi)=>{ if(openSet.includes(wi))return;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    const Mpx=(w.a[0]+w.b[0])/2, Mpy=(w.a[1]+w.b[1])/2;
    const inn=KitchenGeometry.normal(w,walls), np=[-inn[0],-inn[1]];
    // this wall's openings, as [s0,s1] along-spans + vertical sill/head, sorted left→right
    const ops=(plan.openings||[]).filter(o=>+String(o.wall).slice(1)===wi).map(o=>{
      const ww=o.width||(o.type==='door'?900:1200);
      const c=Math.max(ww/2, Math.min(len-ww/2, o.off||len/2)); const v=openingVSpan(o);
      return {s0:c-ww/2, s1:c+ww/2, sill:Math.max(0,v.sill), head:Math.min(v.head,WALL_H)};
    }).filter(x=>x.s1>x.s0+0.5).sort((a,b)=>a.s0-b.s0);
    let cursor=0;
    for(const op of ops){
      addWallPiece(w,u,ang,np,(cursor+op.s0)/2, op.s0-cursor, WALL_H/2, WALL_H);          // pier before the opening
      addWallPiece(w,u,ang,np,(op.s0+op.s1)/2, op.s1-op.s0, (op.head+WALL_H)/2, WALL_H-op.head); // header above
      addWallPiece(w,u,ang,np,(op.s0+op.s1)/2, op.s1-op.s0, op.sill/2, op.sill);           // sill wall below (windows)
      cursor=Math.max(cursor, op.s1);
    }
    addWallPiece(w,u,ang,np,(cursor+len)/2, len-cursor, WALL_H/2, WALL_H);                 // final pier to the wall end
  });
  // ---- structures: columns (full-height dark stone) & beams (overhead lighter timber) ----
  for(const st of ((window.S&&window.S.structures)||[])){
    if(st.type==='beam'){ const bh=st.h||300; const m=box(st.w,bh,st.d||230,0xC9BCA3,{roughness:0.85});
      m.position.copy(world(st.x,st.y,WALL_H-bh/2)); g.add(m); }
    else { const ch=st.h||WALL_H; const m=box(st.w,ch,st.d||st.w,0x8C867A,{roughness:0.9,metalness:0.02});
      m.position.copy(world(st.x,st.y,ch/2)); g.add(m); }
  }
  // ---- doors & windows (procedural) ----
  for(const o of (plan.openings||[])){
    const w=walls[+String(o.wall).slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    const along=Math.max(0,Math.min(len,o.off)), inn=KitchenGeometry.normal(w,walls), thick=w.thickness||WALL_MM;
    const px=w.a[0]+u[0]*along-inn[0]*thick/2, py=w.a[1]+u[1]*along-inn[1]*thick/2;
    const ww=o.width||(o.type==='door'?900:1200);
    // frame/leaf/glass depth — a bit less than the wall thickness so it sits WITHIN the
    // reveal (visible from both sides), leaving a shadow gap at the jambs.
    const REVEAL=Math.min(60, WALL_MM-40);   // panel depth centred in the wall
    if(o.type==='door'){
      const dh=DOOR_HEAD_MM-10;              // leaf height (just under the head)
      if(o.variant==='doorless'){
        /* open threshold — no leaf; the punched opening + header wall are the whole door */
      } else if(o.variant==='aluminium'){
        const glass=box(ww-60,dh-60,26,0x9fb6c4,{transparent:true,opacity:0.4,metalness:0.2,roughness:0.1,side:THREE.DoubleSide}); glass.position.copy(world(px,py,dh/2)); glass.rotation.y=ang; g.add(glass);
        const jL=box(36,dh,REVEAL,0xb9bdc1,{metalness:0.4,roughness:0.4}); jL.position.copy(world(px+u[0]*(-ww/2+18),py+u[1]*(-ww/2+18),dh/2)); jL.rotation.y=ang; g.add(jL);
        const jR=box(36,dh,REVEAL,0xb9bdc1,{metalness:0.4,roughness:0.4}); jR.position.copy(world(px+u[0]*(ww/2-18),py+u[1]*(ww/2-18),dh/2)); jR.rotation.y=ang; g.add(jR);
      } else {
        // single = 1 leaf; double & sliding = 2 leaves/panels spanning the opening.
        // Flip (fix #1): the leaf sits on the INSIDE or OUTSIDE reveal of the wall per o.flip
        // (flip 0/1 = inside, 2/3 = outside). Only inside/outside is meaningful in 3D (no swing arc).
        const inside=((((o.flip||0)%4)+4)%4)<2;
        let n=KitchenGeometry.normal(w,walls);   // inward normal
        const doff=(inside?1:-1)*(WALL_MM/2-REVEAL/2);                             // shift toward that face
        const leaves = (o.variant==='double'||o.variant==='sliding')?2:1; const lw=(ww-40)/leaves;
        for(let k=0;k<leaves;k++){ const lx=px+u[0]*(-ww/2+20+lw*(k+0.5))+n[0]*doff, ly=py+u[1]*(-ww/2+20+lw*(k+0.5))+n[1]*doff;
          const leaf=box(lw-20,dh,REVEAL,0x8a6f4f,{roughness:0.6,side:THREE.DoubleSide}); leaf.position.copy(world(lx,ly,dh/2)); leaf.rotation.y=ang; g.add(leaf); }
      }
    } else {
      // window: fill the punched opening with glass + top/bottom frame + mullion, using the
      // instance's OWN sill/height (French = floor-to-ceiling) so 3D matches the stored dims.
      const v=openingVSpan(o); const sill=v.sill, h=Math.max(1,v.head-v.sill);
      const glass=box(ww-50,h,26,0x9fb6c4,{transparent:true,opacity:0.4,metalness:0.2,roughness:0.05,side:THREE.DoubleSide}); glass.position.copy(world(px,py,sill+h/2)); glass.rotation.y=ang; g.add(glass);
      const fT=box(ww,46,REVEAL,0xEDE7DA); fT.position.copy(world(px,py,sill+h)); fT.rotation.y=ang; g.add(fT);
      const fB=box(ww,46,REVEAL,0xEDE7DA); fB.position.copy(world(px,py,sill)); fB.rotation.y=ang; g.add(fB);
      const mull=box(40,h,30,0xEDE7DA,{side:THREE.DoubleSide}); mull.position.copy(world(px,py,sill+h/2)); mull.rotation.y=ang; g.add(mull);
    }
  }
  const haveModels=!!(manifest&&manifest.models);
  // place() always builds a shutter-fronted module (base/wall/tall cabinet) — tag both the
  // fallback box AND the real loaded model 'cabinet' so the snapshot mask pass (captureSnapshotPair)
  // can flat-shade every cabinet front the same way regardless of which one actually rendered.
  function place(category,width,code,px,py,tierY,ang,fallbackColor,fallbackH,fallbackD,procedural=false){
    const entry=haveModels&&!procedural?resolveEntry(category,width,code):null;
    const fb=box(width,fallbackH,fallbackD||D,fallbackColor);
    fb.position.copy(world(px,py,tierY+fallbackH/2)); fb.rotation.y=ang; fb.userData.role='cabinet'; g.add(fb);
    const volume={code,object:fb};g.userData.volumes.push(volume);
    // The outline is the actual occupied volume, so procedural and GLB paths agree.
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(fb.geometry),new THREE.LineBasicMaterial({color:0x635b4b}));
    edges.position.copy(fb.position);edges.rotation.copy(fb.rotation);g.add(edges);
    if(entry){ loadModel(entry.path).then(proto=>{
      if(!g.userData.active)return;
      const m=proto.clone(true), size=new THREE.Vector3(); new THREE.Box3().setFromObject(m).getSize(size);
      if(Math.min(size.x,size.y,size.z)<=0)return;
      m.scale.set(width*MM/size.x,fallbackH*MM/size.y,(fallbackD||D)*MM/size.z);
      // Cached model geometry/materials are never owned by a live scene.
      m.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.userData.role='cabinet';}});
      m.position.copy(world(px,py,tierY));m.rotation.y=ang+(KitchenGeometry.area(walls)<0?Math.PI:0);
      g.add(m);applyFinishToObject(m);volume.object=m;fb.visible=false;edges.visible=false;
    }).catch(()=>{}); }
  }

  function placeBlind(seg,w,u,n,ang,depth,bottom,height,color){
    const along=seg.x0+seg.width/2,inset=seg.offset??0;
    place('',seg.width,seg.code,w.a[0]+u[0]*along+n[0]*(depth/2+inset),w.a[1]+u[1]*along+n[1]*(depth/2+inset),bottom,ang,color,height,depth,true);
    const s=seg.shutter,frontAt=(s.x0+s.x1)/2;
    // Keep the door within the measured cabinet volume. The rest of the front
    // is the closed blind section, with no generic full-width door/model.
    const door=box(s.width,height-4,15,0xD8C9A3);
    door.position.copy(world(w.a[0]+u[0]*frontAt+n[0]*(depth+inset-7.5),w.a[1]+u[1]*frontAt+n[1]*(depth+inset-7.5),bottom+height/2));
    door.rotation.y=ang;door.userData.role='cabinet';door.userData.blindShutter=true;g.add(door);
  }

  for(const r of (plan.runs||[])){
    const w=walls[+r.key.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    let n=KitchenGeometry.normal(w,walls);
    let off=0;
    for(const seg of r.segments){ const ww=seg.width, D=seg.depth??dOf('base',560), inset=seg.offset??0;
      off=seg.x0??off;
      if(seg.hiddenCorner){
        const along=off+ww/2,slab=box(ww,stack.counterThickness,D,0xDAD3C2);
        slab.position.copy(world(w.a[0]+u[0]*along+n[0]*(D/2+inset),w.a[1]+u[1]*along+n[1]*(D/2+inset),stack.baseTop-stack.counterThickness/2));
        slab.rotation.y=ang;slab.userData.role='countertop';g.add(slab);off+=ww;continue;
      }
      if(seg.kind==='tallBank'){
        const units=seg.units||[{type:'pantry',width:600},{type:'fridge',width:600},{type:'appliance',width:600}];
        const TCODE={glass:'TC6GS1GHS',fridge:'TC1SR1HS',pantry:'TC1STP1HS',appliance:'TC3S1EHSFMO1HS'};
        let so=off;
        units.forEach((tu)=>{const wmm=tu.width;const along=so+wmm/2;const px=w.a[0]+u[0]*along+n[0]*(D/2+inset),py=w.a[1]+u[1]*along+n[1]*(D/2+inset);
          if(tu.loose){ const fr=box(wmm-40,1800,wmm-60,0xcfd3d6,{metalness:0.3,roughness:0.3}); fr.position.copy(world(px,py,900)); fr.rotation.y=ang; g.add(fr); }
          else place((tu.height??seg.height??stack.tall)<2300?'tall2040':'tall2400',wmm,tu.code||seg.code||TCODE[tu.type],px,py,tu.z??seg.z??0,ang,0x21433A,tu.height??seg.height??stack.tall,tu.depth??D);
          so+=wmm;});
        off+=ww;continue;}
      if(seg.kind==='filler'||seg.kind==='inset'){
        const along=off+ww/2; const px=w.a[0]+u[0]*along+n[0]*(D/2+inset), py=w.a[1]+u[1]*along+n[1]*(D/2+inset);
        const h=seg.height??720, z=seg.z??100;
        const fp=box(ww,h,D,0xE6DFCE);fp.position.copy(world(px,py,z+h/2));fp.rotation.y=ang;fp.userData.role='cabinet';g.add(fp);
        if(seg.tier!=='tall') {const slab=box(ww,stack.counterThickness,D,0xDAD3C2);slab.position.copy(world(px,py,stack.baseTop-stack.counterThickness/2));slab.rotation.y=ang;slab.userData.role='countertop';g.add(slab);}
        off+=ww;continue;}
      if(['cabinet','anchor','corner'].includes(seg.kind)){
        const along=off+ww/2; const px=w.a[0]+u[0]*along+n[0]*(D/2+inset), py=w.a[1]+u[1]*along+n[1]*(D/2+inset);
        const sp=moduleSpecFor(seg);
        const isF=seg.kind==='anchor'&&TALL_ANCHORS.includes(seg.label), isH=seg.kind==='anchor'&&seg.label==='hob', isS=seg.kind==='anchor'&&seg.label==='sink';
        if(seg.shutter)placeBlind(seg,w,u,n,ang,D,seg.z??100,seg.height??720,colorFor(seg.kind,seg.label));
        else place(isF?(seg.height<2300?'tall2040':'tall2400'):sp.category,ww,seg.code||sp.code,px,py,seg.z??(isF?0:100),ang,colorFor(seg.kind,seg.label),seg.height??(isF?stack.tall:720),D);
        if(!isF){
          const slab=box(ww,stack.counterThickness,D,0xDAD3C2,{roughness:0.35,metalness:0.1}); slab.position.copy(world(px,py,stack.baseTop-stack.counterThickness/2)); slab.rotation.y=ang; slab.userData.role='countertop'; g.add(slab);
          if(isH||isS){
            const surface=box(Math.max(100,ww-100),6,Math.min(400,D-60),isH?0x222222:0x77909a,{metalness:0.35,roughness:0.3});
            surface.position.copy(world(px,py,stack.baseTop+3));surface.rotation.y=ang;g.add(surface);
          }
          // The wall row is NOT derived here any more — see the wall-tier pass below. Only the
          // extractor hood stays with the base anchor, because it hangs over the hob itself.
          if(isH){ const hood=box(ww,200,D-130,0x2b2b24,{metalness:0.3,roughness:0.5}); hood.position.copy(world(px,py,stack.wallBottom+100)); hood.rotation.y=ang; g.add(hood); }
        }
      }
      off+=ww;
    }
    // ---- WALL TIER — placed from plan.tiers, never mirrored off the base row ----
    // This used to hang a wall cabinet over every base segment, so the wall run could only
    // ever be a copy of the base run. The engine publishes the real wall tier (lib/tiers.js)
    // with its own kinds, its own codes and its own along-wall x0 (annotatePositions), so we
    // place exactly that: cabinets where there are cabinets, a backsplash where the tier says
    // chimney/filler/inset, and nothing at all over a window, a doorway or a tall footprint.
    const tw=(plan.tiers&&plan.tiers[r.key]&&plan.tiers[r.key].wall)||[];
    let twx=0;   // fallback cursor for a plan annotated before x0 existed
    for(const tu of tw){ const ux=(tu.x0!=null?tu.x0:twx); twx=ux+tu.width;
      const along=ux+tu.width/2;
      const depth=tu.depth??WD_WALL, bottom=tu.z??stack.wallBottom, height=tu.height??(stack.wallTop-stack.wallBottom);
      const wpx=w.a[0]+u[0]*along+n[0]*(depth/2+(tu.offset??0)), wpy=w.a[1]+u[1]*along+n[1]*(depth/2+(tu.offset??0));
      if(tu.kind==='wallSolid'||tu.kind==='wallGlass'||tu.kind==='wallBlind'){
        // the tier's own SKU drives the GLB (falling back to the generic 3-shelf wall unit),
        // so a glass or blind-corner wall cabinet renders as itself
        const code=tu.code?String(tu.code).split(' (')[0]:'WC3GS2HS';
        if(tu.shutter)placeBlind(tu,w,u,n,ang,depth,bottom,height,0x21433A);
        else place(height<900?'wall720':'wall1085',tu.width,code,wpx,wpy,bottom,ang,tu.kind==='wallBlind'?0x21433A:0xE7E0D0,height,depth);
      } else if(tu.kind==='chimney'){
        const panel=box(tu.width,height,40,0xE7E0D0); panel.position.copy(world(wpx,wpy,bottom+height/2)); panel.rotation.y=ang; panel.userData.role='backsplash'; g.add(panel);
      } else if(tu.kind==='filler'||tu.kind==='inset'){
        const wf=box(tu.width,height,depth,0xEDE7DA); wf.position.copy(world(wpx,wpy,bottom+height/2)); wf.rotation.y=ang; wf.userData.role='backsplash'; g.add(wf);
      }
    }
  }
  if(plan.island && plan.island.working){ const ISL_D=900; const tot=plan.island.total||1800; let o2=-tot/2;
    for(const s of plan.island.working){ if(['cabinet','anchor'].includes(s.kind)){
      const m=box(s.width,850,ISL_D,colorFor(s.kind,s.label)); m.position.set((o2+s.width/2)*MM,425*MM,0); m.userData.role='cabinet'; g.add(m); } o2+=s.width; }
    const islSlab=box(tot+40,30,ISL_D+40,0xDAD3C2,{roughness:0.35,metalness:0.1}); islSlab.position.set(0,865*MM,0); islSlab.userData.role='countertop'; g.add(islSlab); }
  for(const acc of (plan.placedAccessories||[])){ const w=walls[+acc.wall.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    let n=KitchenGeometry.normal(w,walls);
    const dep=acc.type==='kubos'?WD_WALL:140; const px=w.a[0]+u[0]*acc.off+n[0]*dep/2, py=w.a[1]+u[1]*acc.off+n[1]*dep/2;
    const entry=haveModels?resolveAccessory(acc.type,acc.width):null;
    if(entry){ loadModel(entry.path).then(proto=>{ if(!g.userData.active)return;const m=proto.clone(true);
      m.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
      const size=new THREE.Vector3();new THREE.Box3().setFromObject(m).getSize(size);
      if(Math.min(size.x,size.y,size.z)<=0)return;m.scale.set(acc.width*MM/size.x,acc.height*MM/size.y,dep*MM/size.z);
      m.position.copy(world(px,py,acc.tierY)); m.rotation.y=ang+(KitchenGeometry.area(walls)<0?Math.PI:0); g.add(m); }).catch(()=>{}); }
    else { const b=box(acc.width,acc.height,dep, acc.type==='kubos'?0x8a7a5a:0x6f6f63); b.position.copy(world(px,py,acc.tierY+acc.height/2)); b.rotation.y=ang; g.add(b); } }
  return g;
}
function disposeScene(){ if(!scene) return; scene.traverse(o=>{ if(o.userData.active!=null)o.userData.active=false; if(o.geometry)o.geometry.dispose(); if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());} }); }
function keyDown(e){ keys[e.key.toLowerCase()]=true; } function keyUp(e){ keys[e.key.toLowerCase()]=false; }
function animate(){
  if(!renderer){ raf=null; return; }
  raf=requestAnimationFrame(animate);
  if(mode==='walk'&&controls){ const sp=0.055; let f=0,r=0; if(keys['w'])f+=1; if(keys['s'])f-=1; if(keys['d'])r+=1; if(keys['a'])r-=1;
    const previous=camera.position.clone();
    if(controls.isLocked){ controls.moveForward(f*sp); controls.moveRight(r*sp); }
    if(bounds&&!walkPointInside(camera.position.x,camera.position.z)) camera.position.copy(previous);
    camera.position.y=1.6;
    for(const wm of wallMeshes){ wm.mesh.material.transparent=false; wm.mesh.material.opacity=1; wm.mesh.visible=true; }
  } else if(controls){ controls.update();
    // see-through walls: hide the wall(s) standing between the camera and the room interior
    for(const wm of wallMeshes){ const outside=(camera.position.x-wm.mx)*wm.nx+(camera.position.z-wm.mz)*wm.nz>0;
      wm.mesh.material.transparent=true; wm.mesh.material.opacity=outside?0.05:1; wm.mesh.material.depthWrite=!outside; }
  }
  renderer.render(scene,camera);
}
function teardown(){
  sceneRequest++;
  if(raf){ cancelAnimationFrame(raf); raf=null; }
  window.removeEventListener('keydown',keyDown); window.removeEventListener('keyup',keyUp);
  if(controls){ try{controls.unlock&&controls.unlock();}catch(e){} try{controls.dispose&&controls.dispose();}catch(e){} controls=null; }
  if(renderer){ renderer.dispose(); const el=renderer.domElement; if(el&&el.parentNode)el.parentNode.removeChild(el); renderer=null; }
  disposeScene(); scene=null; camera=null;
}
let sceneRequest=0;
function walkPointInside(x,z){
  const px=x/MM+bounds.cx,py=z/MM+bounds.cy;
  return KitchenGeometry.containsRect({x0:px-350,x1:px+350,y0:py-350,y1:py+350},roomWalls);
}
async function startScene(plan, walls, m, orbitId, walkId, hintId){
  if(!plan || !walls || !walls.length) return;
  mode=m||'orbit';
  container=document.getElementById(mode==='walk'?(walkId||'walkCanvas'):(orbitId||'view3d'));
  hint=document.getElementById(hintId||'walkHint');
  if(!container) return;
  if(renderer) teardown();
  const request=++sceneRequest;
  await getManifest();
  if(request!==sceneRequest)return;
  const Wd=container.clientWidth||600, Hd=container.clientHeight||380;
  scene=new THREE.Scene(); scene.background=null;   // transparent → the model floats over the beige grid
  scene.add(new THREE.HemisphereLight(0xffffff,0x6b6b5a,1.2));
  const dl=new THREE.DirectionalLight(0xfff2d8,0.75); dl.position.set(2,5,1.5); scene.add(dl);
  camera=new THREE.PerspectiveCamera(mode==='walk'?72:50, Wd/Hd, 0.01, 100);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true}); renderer.setClearColor(0x000000,0); renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setSize(Wd,Hd);
  container.innerHTML=''; container.appendChild(renderer.domElement);
  scene.add(buildKitchen(plan,walls));
  if(FINISH) applyFinishToObject(scene);   // 7.1: the scene opens already finished, never beige
  const span=bounds?Math.max((bounds.maxx-bounds.minx),(bounds.maxy-bounds.miny))*MM:4;
  if(mode==='walk'){
    controls=new PointerLockControls(camera, renderer.domElement);
    camera.position.set(0,1.6, bounds?Math.max(0.4,(bounds.maxy-bounds.cy)*MM-0.7):1.2);
    if(!walkPointInside(camera.position.x,camera.position.z)){
      outer:for(let y=bounds.miny+350;y<bounds.maxy;y+=200)for(let x=bounds.minx+350;x<bounds.maxx;x+=200){
        if(walkPointInside((x-bounds.cx)*MM,(y-bounds.cy)*MM)){camera.position.set((x-bounds.cx)*MM,1.6,(y-bounds.cy)*MM);break outer;}
      }
    }
    controls.addEventListener('lock',()=>{ if(hint)hint.style.display='none'; });
    controls.addEventListener('unlock',()=>{ if(hint)hint.style.display='block'; });
    container.onclick=()=>{ try{controls.lock();}catch(e){} };
    window.addEventListener('keydown',keyDown); window.addEventListener('keyup',keyUp);
  } else {
    controls=new OrbitControls(camera, renderer.domElement);
    camera.position.set(span*0.9, span*0.95, span*0.9); controls.target.set(0,1.0,0);
    controls.enableDamping=true; controls.maxPolarAngle=Math.PI*0.49; controls.update();
  }
  animate();
}
window.startScene=startScene;
// Read-only diagnostics for the local verification page: measure actual rendered
// objects after transforms/model loading, rather than echoing requested sizes.
window.inspectSceneGeometry=function(){
  if(!scene||!bounds)return null;scene.updateMatrixWorld(true);const volumes=[];
  scene.traverse(g=>{for(const v of g.userData.volumes||[]){const b=new THREE.Box3().setFromObject(v.object);
    volumes.push({code:v.code,x0:b.min.x/MM+bounds.cx,x1:b.max.x/MM+bounds.cx,y0:b.min.z/MM+bounds.cy,y1:b.max.z/MM+bounds.cy,z0:b.min.y/MM,z1:b.max.y/MM});}});
  return {volumes,cameraInside:KitchenGeometry.pointInside(camera.position.x/MM+bounds.cx,camera.position.z/MM+bounds.cy,roomWalls)};
};
// Flattens the CURRENT frame of the transparent WebGL canvas onto a solid backdrop (renderer has
// scene.background=null, so raw toDataURL would blacken empty pixels — e.g. looking up past the
// open-top walls). bgHex=null skips the fill (used for the mask pass, whose background is already
// opaque — see captureSnapshotPair).
function flattenCanvas(bgHex){
  const src=renderer.domElement, out=document.createElement('canvas');
  out.width=src.width; out.height=src.height;
  const ctx=out.getContext('2d');
  if(bgHex){ ctx.fillStyle=bgHex; ctx.fillRect(0,0,out.width,out.height); }
  ctx.drawImage(src,0,0);
  return out;
}
// Walkthrough → Render Portal capture. Grabs BOTH the real photo AND a same-pose "role mask" —
// every cabinet-front mesh flat-shaded pure red, every countertop slab pure green, every backsplash
// panel pure blue (tagged via mesh.userData.role in buildKitchen/place — see there), everything else
// black. The Render Portal later reads each color channel back out as a per-surface alpha mask to
// composite the picked finish onto exactly the right pixels (see compositeFinishRender in the main
// script) — Option B: no AI/backend call, pure canvas compositing.
const ROLE_MASK_COLOR={cabinet:0xff0000,countertop:0x00ff00,backsplash:0x0000ff};
window.captureSnapshotPair=function(){
  if(!renderer||mode!=='walk'||!scene||!camera) return null;
  renderer.render(scene,camera);                      // ensure the buffer holds the CURRENT camera pose
  const photo=flattenCanvas('#EDE8DE').toDataURL('image/jpeg',0.86);
  const saved=[];
  scene.traverse(o=>{ if(o.isMesh){ saved.push({mesh:o,mat:o.material});
    const role=o.userData&&o.userData.role;
    o.material=new THREE.MeshBasicMaterial({color:(role&&ROLE_MASK_COLOR[role])!=null?ROLE_MASK_COLOR[role]:0x000000}); } });
  const oldBg=scene.background; scene.background=new THREE.Color(0x000000);
  renderer.render(scene,camera);
  const mask=flattenCanvas(null).toDataURL('image/png');   // png: lossless, keeps mask edges crisp
  saved.forEach(s=>{ s.mesh.material.dispose(); s.mesh.material=s.mat; });
  scene.background=oldBg; renderer.render(scene,camera);   // restore the live view before returning
  return {photo,mask};
};
window.stopScene=function(){ teardown(); if(hint)hint.style.display='block'; };
mountLogos();
