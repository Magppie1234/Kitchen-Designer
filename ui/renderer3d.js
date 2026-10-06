import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MM = 0.001;
let renderer=null, scene=null, camera=null, controls=null, raf=null, mode='orbit';
let container=null, hint=null, bounds=null, roomWalls=[], resizeObs=null;
let wallMeshes=[];   // {mesh, mx, mz, nx, nz} — for see-through wall culling in orbit
const keys={};
const apiBase=()=> (window.API||'');

let manifest=null, manifestPromise=null;
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);   // the Models GLBs are meshopt-compressed
const modelCache=new Map();
async function getManifest(){
  if(manifest) return manifest;
  if(!manifestPromise) manifestPromise=fetch(apiBase()+'/api/models').then(r=>{if(!r.ok)throw new Error('model manifest');return r.json();}).then(m=>manifest=m).catch(()=>null).finally(()=>{manifestPromise=null;});
  return manifestPromise;
}

// A cabinet renders its OWN model — the Models file named by its cabinet code — or, when
// there is none, a plain box at its real size. Never a look-alike from another code.
const modelFor=(code)=> code&&manifest&&manifest.models ? manifest.models.find(m=>m.code===String(code).split(' (')[0])||null : null;
// An "Additional Items" model by file name (and LH/RH folder for fillers).
const itemFor=(name,side)=> manifest&&manifest.models ? manifest.models.find(m=>m.category==='item'&&m.item===name&&(!side||!m.side||m.side===side))||null : null;
function resolveAccessory(type,width){
  if(!manifest||!manifest.models) return null;
  const accs=manifest.models.filter(m=>m.category==='accessory');
  if(type==='kubos') return accs.find(m=>/kubos 2/i.test(m.name))||accs.find(m=>/kubos/i.test(m.name))||null;
  if(type==='tark'){ const w=width>=1100?'1200':width>=750?'900':'600';
    return accs.find(m=>new RegExp('tark '+w,'i').test(m.name)&&!/\bA\b/i.test(m.name))||accs.find(m=>/tark/i.test(m.name))||null; }
  return null;
}
// Appliance and structure files carry the odd stray fragment far from the model (the LG
// fridge has a 3mm control-panel speck 200mm outside its body), which would skew every
// bounding-box fit. Meshes that are tiny AND outside the main body are dropped.
function dropStrays(root){
  root.updateMatrixWorld(true);
  const meshes=[], main=new THREE.Box3(), sz=new THREE.Vector3();
  root.traverse(o=>{ if(o.isMesh) meshes.push({o,b:new THREE.Box3().setFromObject(o)}); });
  for(const m of meshes){ m.b.getSize(sz); if(Math.max(sz.x,sz.y,sz.z)>=0.02) main.union(m.b); }
  if(main.isEmpty()) return;
  main.expandByScalar(0.005);
  for(const m of meshes) if(!main.intersectsBox(m.b)) m.o.parent.remove(m.o);
}
/* ---- lettering baked into the models ----
   The CAD exports carry their annotations as real geometry: '2D text' labels on the fronts
   ("BASE CABINET 1 SHELF", "(H720xW600xD560)", "BSC1HS_LH") and dimension chains with their
   numbers (DimText). Every model is tagged once on load; the Review screen's "Hide labels"
   switch shows or hides the tagged meshes in the model cache and the live scene alike, so it
   holds for 3D, the walkthrough, models still streaming in, and snapshots. */
const LABEL_NODE=/^2D.?text|^DimText|^Dimension.?(chain|length)/i;
const labelledModels=new Set();
let labelsHidden=false;
try{ labelsHidden=localStorage.getItem('kd.hideModelLabels')==='1'; }catch(e){}
// Plain scene (Render Portal capture view): no finish maps and no lettering — the AI render
// gets bare geometry, so nothing in the source fights the finish it is asked to apply.
let plain=false;
function setPlain(on){ plain=on; for(const m of labelledModels) showLabels(m); }
function showLabels(root){ root.traverse(o=>{ if(o.userData.modelLabel) o.visible=!labelsHidden&&!plain; }); }
function tagLabels(root){
  let found=false;
  root.traverse(o=>{ if(LABEL_NODE.test(o.name||'')) o.traverse(c=>{ c.userData.modelLabel=true; found=true; }); });
  if(found){ labelledModels.add(root); showLabels(root); }
}
window.setModelLabelsHidden=function(hidden){
  labelsHidden=!!hidden;
  try{ localStorage.setItem('kd.hideModelLabels',labelsHidden?'1':'0'); }catch(e){}
  for(const m of labelledModels) showLabels(m);
  if(scene) showLabels(scene);
  thumbCache.clear();   // library thumbnails re-render in the same state
  return labelsHidden;
};
window.modelLabelsHidden=()=>labelsHidden;
// The base cabinet models carry their own bronze skirting; its material is kept from the first
// model that loads so a filler's skirting (drawn here, fillers have none) matches it exactly.
let skirtingMat=null, gotSkirting;
const skirtingReady=new Promise(r=>gotSkirting=r);
function normalize(gltfScene,clean=false){
  if(clean) dropStrays(gltfScene);
  if(!skirtingMat) gltfScene.traverse(o=>{ if(skirtingMat||!o.isMesh) return;
    const m=[].concat(o.material).find(x=>/skirting/i.test(x?.name||'')); if(m){ skirtingMat=m; gotSkirting(m); } });
  tagLabels(gltfScene);   // clones copy the tag and the current visibility
  const box=new THREE.Box3().setFromObject(gltfScene);
  const c=new THREE.Vector3(); box.getCenter(c);
  const grp=new THREE.Group();
  gltfScene.position.set(-c.x,-box.min.y,-c.z);
  grp.add(gltfScene);
  grp.userData.size=box.getSize(new THREE.Vector3());   // metres, after normalising
  return grp;
}
// renderElevation collects every model/texture load its build starts, to render once they land.
let tracked=null;
const trackLoad=(p)=>{ if(tracked) tracked.push(p); return p; };
function loadModel(path,version='',clean=false){
  // The cache key includes the file fingerprint from /api/models.  This matters when
  // C&J and Titus variants share a cabinet role but an updated GLB keeps its filename.
  const key=path+'?v='+version+(clean?'#clean':'');
  if(modelCache.has(key)) return trackLoad(modelCache.get(key));
  const url=apiBase()+'/models/'+encodeURIComponent(path).replace(/%2F/g,'/')+(version?'?v='+encodeURIComponent(version):'');
  const p=new Promise((res,rej)=>{ loader.load(url,(g)=>res(normalize(g.scene,clean)),undefined,rej); }).catch(e=>{modelCache.delete(key);throw e;});
  modelCache.set(key,p); return trackLoad(p);
}
/* ---- Anchors / Handle / Structure (models.mjs categories) ----
   Appliances attach to the plan's anchors, never to a catalogue code: every file of a type
   (Models/Anchors/Hob_600, Hob_900, ...) is measured once loaded and the widest one that fits
   the cabinet it sits on wins, so a new appliance size is just a new file. */
const modelsOf=(cat,key,val)=>manifest&&manifest.models?manifest.models.filter(m=>m.category===cat&&(key==null||m[key]===val)):[];
// The files come from different sources and do not all face the same way. A model is turned
// so its front is +z, like every cabinet: by its manifest `front` (Models/Anchors/
// orientation.json), else — for a sink — by where its faucet stands (that side is the back).
const FRONT_YAW={'+z':0,'-z':Math.PI,'+x':-Math.PI/2,'-x':Math.PI/2};
function faucetYaw(proto){
  const rim=sinkRim(proto), v=new THREE.Vector3(); let sx=0,sz=0,n=0;
  proto.traverse(o=>{ if(!o.isMesh) return; const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
      if(v.y>rim.y+0.02&&v.y<rim.y+0.12){ sx+=v.x; sz+=v.z; n++; } } });   // the faucet's column
  if(!n) return 0;
  const dx=sx/n-(rim.x0+rim.x1)/2, dz=sz/n-(rim.z0+rim.z1)/2;
  return Math.abs(dz)>=Math.abs(dx)?(dz>0?Math.PI:0):(dx<0?-Math.PI/2:Math.PI/2);
}
const orientedCache=new Map();
function oriented(entry,proto){
  const key=entry.path+'?v='+entry.version;
  if(orientedCache.get(key)?.src===proto) return orientedCache.get(key).model;
  const yaw=entry.front?FRONT_YAW[entry.front]:entry.appliance==='sink'?faucetYaw(proto):0;
  let model=proto;
  if(yaw){ model=new THREE.Group(); const c=proto.clone(true); c.rotation.y=yaw; model.add(c); model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model), ctr=box.getCenter(new THREE.Vector3());
    c.position.set(-ctr.x,-box.min.y,-ctr.z); model.userData.size=box.getSize(new THREE.Vector3()); }
  orientedCache.set(key,{src:proto,model});
  return model;
}
async function appliancesOf(type){
  const loaded=await Promise.all(modelsOf('appliance','appliance',type).map(e=>
    loadModel(e.path,e.version,true).then(raw=>{ const p=oriented(e,raw);
      return {entry:e,proto:p,w:p.userData.size.x/MM,h:p.userData.size.y/MM,d:p.userData.size.z/MM}; }).catch(()=>null)));
  return loaded.filter(Boolean).sort((a,b)=>a.w-b.w);
}
// Width matching: the widest model no wider than the slot; when none fits, the narrowest
// (scaled down to the slot by the caller). `prefer` breaks a tie between equal widths.
function fitByWidth(list,slotW,prefer){
  const fits=list.filter(x=>x.w<=slotW+0.5), pool=fits.length?fits:list.slice(0,1);
  const best=pool.length?pool[pool.length-1].w:0, tied=pool.filter(x=>Math.abs(x.w-best)<1);
  return (prefer&&tied.find(x=>prefer.test(x.entry.name)))||tied[0]||null;
}
// A sink's rim: the highest level at which the model is (nearly) its full width — the
// flange. The faucet above it is narrow, the bowl below it is narrower. Measured once per
// model from its vertices; the footprint at that level is the countertop cut-out.
function sinkRim(proto){
  if(proto.userData.rim) return proto.userData.rim;
  proto.updateMatrixWorld(true);
  const v=new THREE.Vector3(), bins=new Map(), BIN=0.004;
  proto.traverse(o=>{ if(!o.isMesh) return; const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
      const k=Math.round(v.y/BIN), b=bins.get(k)||{x0:1e9,x1:-1e9,z0:1e9,z1:-1e9};
      b.x0=Math.min(b.x0,v.x); b.x1=Math.max(b.x1,v.x); b.z0=Math.min(b.z0,v.z); b.z1=Math.max(b.z1,v.z); bins.set(k,b); } });
  let widest=0; for(const b of bins.values()) widest=Math.max(widest,b.x1-b.x0);
  let rim=null; for(const [k,b] of bins) if(b.x1-b.x0>=widest*0.9&&(!rim||k*BIN>rim.y)) rim={y:k*BIN,...b};
  return proto.userData.rim=rim||{y:0,x0:-0.2,x1:0.2,z0:-0.2,z1:0.2};
}
/* Handles. Every cabinet GLB models its handle as a low-detail placeholder, and that
   placeholder IS the handle's anchor point on the front:
     C&J   — the aluminium J/C profile strips (nodes ALU_PROF_FOR_HANDLE_*), full front width
     Titus — a ~200mm bronze bar on each front (horizontal on drawers, vertical on talls)
   The detailed Models/Handle file replaces each placeholder at exactly its position:
   C&J is stretched along its length to the strip, Titus keeps its catalogue length. */
const HANDLE_ANCHOR_NODE=/ALU.?PROF.?FOR.?HANDLE/i, BAR_MATERIAL=/mett?al/i;
function handleAnchors(root,kind){
  root.updateMatrixWorld(true);
  const found=[], sz=new THREE.Vector3();
  root.traverse(o=>{ if(!o.isMesh) return;
    let hit=false;
    if(kind==='CJ'){ for(let p=o;p&&p!==root;p=p.parent) if(HANDLE_ANCHOR_NODE.test(p.name||'')){hit=true;break;} }
    else if([].concat(o.material).some(m=>BAR_MATERIAL.test(m?.name||''))){
      new THREE.Box3().setFromObject(o).getSize(sz);
      const L=Math.max(sz.x,sz.y), S=Math.min(sz.x,sz.y);
      hit=L>=0.15&&L<=0.26&&S<0.06&&sz.z<0.06;
    }
    if(!hit) return;
    const b=new THREE.Box3().setFromObject(o), near=found.find(a=>a.box.clone().expandByScalar(0.003).intersectsBox(b));
    if(near){ near.box.union(b); near.meshes.push(o); } else found.push({box:b,meshes:[o]});
  });
  return found;
}
const handleKindOf=(code)=>/-CJ-/.test(String(code||''))?'CJ':'TTS';
// Swap a freshly cloned cabinet's placeholder handles for the detailed model. `m` must not
// be parented or moved yet, so its world frame is the cabinet's own frame.
function fitHandles(m,code){
  const kind=handleKindOf(code), entry=modelsOf('handle','handle',kind)[0];
  if(!entry) return;
  const anchors=handleAnchors(m,kind);
  if(!anchors.length) return;
  loadModel(entry.path,entry.version).then(proto=>{
    for(const a of anchors){
      const size=a.box.getSize(new THREE.Vector3()), c=a.box.getCenter(new THREE.Vector3());
      const vertical=size.y>size.x;
      const h=proto.clone(true), hg=new THREE.Group(); hg.add(h);
      h.traverse(o=>{ if(o.isMesh){ o.userData.sharedGeometry=true; o.userData.sharedMaterial=true; } });   // the cached handle's own buffers
      // the handle file runs along its own Z: turn it to run along the front (X) or upright (Y)
      if(vertical) h.rotation.x=-Math.PI/2; else h.rotation.y=Math.PI/2;
      h.updateMatrixWorld(true);
      const hb=new THREE.Box3().setFromObject(h), hs=hb.getSize(new THREE.Vector3()), hc=hb.getCenter(new THREE.Vector3());
      h.position.set(-hc.x,-hc.y,-hb.max.z);                       // centred, front face at 0
      if(kind==='CJ'){ if(vertical) hg.scale.y=size.y/hs.y; else hg.scale.x=size.x/hs.x; }
      hg.position.set(c.x,c.y,a.box.max.z);                          // front flush with the placeholder
      hg.userData.role='handle'; m.add(hg);
      for(const o of a.meshes) o.visible=false;
    }
  }).catch(()=>{});
}
/* Chimney front clearance. A chimney's zone is its own envelope plus the space directly in
   front of it (rules.json: chimney-front-clearance), from its underside to the ceiling.
   Footprints are oriented rectangles in plan mm: centre c, unit axis u, half-sizes hu/hv. */
function rectOverlap(A,B,eps=2){
  const corners=R=>{ const v=[-R.u[1],R.u[0]]; return [[1,1],[1,-1],[-1,1],[-1,-1]].map(([s,t])=>
    [R.c[0]+R.u[0]*R.hu*s+v[0]*R.hv*t, R.c[1]+R.u[1]*R.hu*s+v[1]*R.hv*t]); };
  const ca=corners(A), cb=corners(B);
  for(const ax of [A.u,[-A.u[1],A.u[0]],B.u,[-B.u[1],B.u[0]]]){
    const pa=ca.map(p=>p[0]*ax[0]+p[1]*ax[1]), pb=cb.map(p=>p[0]*ax[0]+p[1]*ax[1]);
    if(Math.max(...pa)<=Math.min(...pb)+eps||Math.max(...pb)<=Math.min(...pa)+eps) return false;
  }
  return true;
}
// Chimney models are needed synchronously (their depth sets the clearance zone that decides
// what else may be placed), so startScene loads them before building.
let chimneyModels=[];
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
const texReady=new Map();
function getTex(url){ if(!texCache.has(url)){ let done; texReady.set(url,new Promise(r=>done=r));
    const t=texLoader.load(url,done,undefined,done); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; texCache.set(url,t); }
  trackLoad(texReady.get(url)); return texCache.get(url); }
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
  // plain: drop the texture a loaded model ships with, but only on the surfaces a render swatch
  // replaces (shutters and panels, countertop, backsplash). Handles, skirting, glass-unit frames
  // and the carcass keep the look they have in the walkthrough — the render must not refinish them.
  if(plain){ if(root!==scene) root.traverse(o=>{ if(o.isMesh&&ROLE_MASK_COLOR[o.userData.role]!=null) for(const m of [].concat(o.material)) if(m.map){ m.map=null; m.needsUpdate=true; } }); return; }
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
    await getManifest();
    const entry=modelFor(code);   // the code's own model or no thumbnail (the text tile stays)
    if(!entry) return null;
    const proto=await loadModel(entry.path,entry.version);
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
  const haveModels=!!(manifest&&manifest.models);
  // A picked finish re-skins only the stone shutter materials (MAGPPIE ...); the ONYX carcass is
  // fixed by the series, and handles, skirting, glass and metal stay exactly as modelled.
  const isShutter=(mat)=>/^MAGPPIE/i.test(mat?.name||'')&&!/ONYX/i.test(mat.name);
  // Cached model geometry/materials are never owned by a live scene.
  // Geometry is shared with the cached model (scale lives on the object, never in the vertex
  // data) — copying it per instance re-uploaded every cabinet's buffers to the GPU. Materials
  // are still owned, since a finish or the walls' see-through fade must not leak between them.
  const own=(m)=>m.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.material=Array.isArray(o.material)?o.material.map(x=>x.clone()):o.material.clone();}});
  const flip=KitchenGeometry.area(walls)<0?Math.PI:0;
  // A Models/Structure file stretched to the box the plan gives it (bottom-centre `pos`); the
  // procedural stand-in `standIn` shows until it loads, and for good when the file is missing.
  function fitModel(entry,w,h,d,pos,rotY,standIn){
    if(!entry) return;
    loadModel(entry.path,entry.version,true).then(proto=>{
      if(!g.userData.active) return;
      const m=proto.clone(true), sz=proto.userData.size; own(m);
      m.scale.set(w*MM/sz.x,h*MM/sz.y,d==null?1:d*MM/sz.z);
      const holder=new THREE.Group(); holder.add(m); holder.position.copy(pos); holder.rotation.y=rotY;
      g.add(holder); if(standIn) standIn.visible=false;
    }).catch(()=>{});
  }
  const structureModel=(type,re)=>{ const all=haveModels?modelsOf('structure','structure',type):[]; return (re&&all.find(e=>re.test(e.name)))||all[0]||null; };
  // ---- structures: columns (full-height dark stone) & beams (overhead lighter timber) ----
  for(const st of ((window.S&&window.S.structures)||[])){
    if(st.type==='beam'){ const bh=st.h||300; const m=box(st.w,bh,st.d||230,0xC9BCA3,{roughness:0.85});
      m.position.copy(world(st.x,st.y,WALL_H-bh/2)); g.add(m);
      fitModel(structureModel('beam'),st.w,bh,st.d||230,world(st.x,st.y,WALL_H-bh),0,m); }
    else { const ch=st.h||WALL_H; const m=box(st.w,ch,st.d||st.w,0x8C867A,{roughness:0.9,metalness:0.02});
      m.position.copy(world(st.x,st.y,ch/2)); g.add(m);
      fitModel(structureModel('column'),st.w,ch,st.d||st.w,world(st.x,st.y,0),0,m); }
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
    const og=new THREE.Group(); g.add(og);   // the procedural opening — hidden once its model loads
    if(o.type==='door'){
      const dh=DOOR_HEAD_MM-10;              // leaf height (just under the head)
      if(o.variant==='doorless'){
        /* open threshold — no leaf; the punched opening + header wall are the whole door */
      } else if(o.variant==='aluminium'){
        const glass=box(ww-60,dh-60,26,0x9fb6c4,{transparent:true,opacity:0.4,metalness:0.2,roughness:0.1,side:THREE.DoubleSide}); glass.position.copy(world(px,py,dh/2)); glass.rotation.y=ang; og.add(glass);
        const jL=box(36,dh,REVEAL,0xb9bdc1,{metalness:0.4,roughness:0.4}); jL.position.copy(world(px+u[0]*(-ww/2+18),py+u[1]*(-ww/2+18),dh/2)); jL.rotation.y=ang; og.add(jL);
        const jR=box(36,dh,REVEAL,0xb9bdc1,{metalness:0.4,roughness:0.4}); jR.position.copy(world(px+u[0]*(ww/2-18),py+u[1]*(ww/2-18),dh/2)); jR.rotation.y=ang; og.add(jR);
      } else {
        // single = 1 leaf; double & sliding = 2 leaves/panels spanning the opening.
        // Flip (fix #1): the leaf sits on the INSIDE or OUTSIDE reveal of the wall per o.flip
        // (flip 0/1 = inside, 2/3 = outside). Only inside/outside is meaningful in 3D (no swing arc).
        const inside=((((o.flip||0)%4)+4)%4)<2;
        let n=KitchenGeometry.normal(w,walls);   // inward normal
        const doff=(inside?1:-1)*(WALL_MM/2-REVEAL/2);                             // shift toward that face
        const leaves = (o.variant==='double'||o.variant==='sliding')?2:1; const lw=(ww-40)/leaves;
        for(let k=0;k<leaves;k++){ const lx=px+u[0]*(-ww/2+20+lw*(k+0.5))+n[0]*doff, ly=py+u[1]*(-ww/2+20+lw*(k+0.5))+n[1]*doff;
          const leaf=box(lw-20,dh,REVEAL,0x8a6f4f,{roughness:0.6,side:THREE.DoubleSide}); leaf.position.copy(world(lx,ly,dh/2)); leaf.rotation.y=ang; og.add(leaf); }
      }
    } else {
      // window: fill the punched opening with glass + top/bottom frame + mullion, using the
      // instance's OWN sill/height (French = floor-to-ceiling) so 3D matches the stored dims.
      const v=openingVSpan(o); const sill=v.sill, h=Math.max(1,v.head-v.sill);
      const glass=box(ww-50,h,26,0x9fb6c4,{transparent:true,opacity:0.4,metalness:0.2,roughness:0.05,side:THREE.DoubleSide}); glass.position.copy(world(px,py,sill+h/2)); glass.rotation.y=ang; og.add(glass);
      const fT=box(ww,46,REVEAL,0xEDE7DA); fT.position.copy(world(px,py,sill+h)); fT.rotation.y=ang; og.add(fT);
      const fB=box(ww,46,REVEAL,0xEDE7DA); fB.position.copy(world(px,py,sill)); fB.rotation.y=ang; og.add(fB);
      const mull=box(40,h,30,0xEDE7DA,{side:THREE.DoubleSide}); mull.position.copy(world(px,py,sill+h/2)); mull.rotation.y=ang; og.add(mull);
    }
    // Models/Structure: a hinged door (single leaf) or a window, stretched to the real opening.
    // Doorless, aluminium, double and sliding doors keep their procedural build.
    const inside=((((o.flip||0)%4)+4)%4)<2;
    if(o.type==='door'){ if(!o.variant||o.variant==='single')
      fitModel(structureModel('door'),ww,DOOR_HEAD_MM,thick,world(px,py,0),ang+flip+(inside?0:Math.PI),og); }
    else { const v=openingVSpan(o), french=/french|fulllength/i.test(o.variant||'')||!!o.french;
      fitModel(structureModel('window',french?/2/:/1/),ww,Math.max(1,v.head-v.sill),Math.min(thick,REVEAL*2),world(px,py,v.sill),ang+flip,og); }
  }
  // ---- chimney clearance (rectOverlap) — zones are laid out before anything that could intrude ----
  const P=(window.S&&window.S.rulesCfg&&window.S.rulesCfg.params)||{};
  const CLEAR=P.chimney_front_clearance??600, CHIMNEY_OVER=P.chimney_wider_than_hob_by??100;
  const zones=[]; g.userData.clearance={frontClearance:CLEAR,zones:[],violations:[]};
  const footprint=(px,py,ang,w,d)=>({c:[px,py],u:[Math.cos(ang),-Math.sin(ang)],hu:w/2,hv:d/2});
  // True when something may not go here: its footprint and height span enter a chimney zone.
  function blocked(what,fp,z0,z1){
    for(const zn of zones){
      if(Math.min(z1,zn.z1)-Math.max(z0,zn.z0)<=2||!rectOverlap(fp,zn.fp)) continue;
      g.userData.clearance.violations.push({what:String(what||'unit'),zone:zn.id});
      console.warn(`[3d] ${what||'unit'} not placed: it is inside the chimney clearance over ${zn.id}`);
      return true;
    }
    return false;
  }
  /* An appliance from Models/Anchors, matched to its cabinet by width and set on its anchor.
     `at(k)` is the plan point at depth k from the run's back line (the model's back goes on
     that line; hob and sink are centred at depth `centre` instead). Modes:
       counter — hob: sits on the worktop at `y`, never wider than its cabinet
       sink    — rim flush on the worktop at `y`; onRim(size) gets the cut-out to make
       floor   — fridge: stands on the floor, scaled uniformly to the slot width (height capped)
       box     — dishwasher: fitted to the carcass volume [height, depth] behind its panel
       wall    — chimney: stretched to the chimney width only, hung with its underside at `y` */
  function appliance(type,slotW,at,ang,{mode,y=0,centre=0,maxH,boxHD,fallback,onRim,prefer,models}={}){
    const vol={code:'appliance:'+type,slot:slotW,object:fallback||null}; g.userData.volumes.push(vol);
    const put=(x)=>{
      if(!g.userData.active||!x) return;
      const m=x.proto.clone(true); own(m);
      let sx=1,sy=1,sz=1;
      if(mode==='wall') sx=slotW/x.w;
      else if(mode==='box'){ sx=slotW/x.w; sy=boxHD[0]/x.h; sz=boxHD[1]/x.d; }
      else { const s=mode==='floor'?Math.min(slotW/x.w,(maxH||x.h)/x.h):Math.min(1,slotW/x.w); sx=sy=sz=s; }
      m.scale.set(sx,sy,sz);
      let k=x.d*sz/2, yy=y;
      if(mode==='counter') k=centre;
      else if(mode==='sink'){ const r=sinkRim(x.proto); k=centre; yy=y-r.y*sy/MM+1;
        m.position.set(-(r.x0+r.x1)/2*sx,0,-(r.z0+r.z1)/2*sz);   // the bowl, not the faucet, is centred
        if(onRim) onRim({w:(r.x1-r.x0)*sx/MM,d:(r.z1-r.z0)*sz/MM}); }
      const holder=new THREE.Group(); holder.add(m);
      const [px,py]=at(k); holder.position.copy(world(px,py,yy)); holder.rotation.y=ang+flip;
      holder.userData.role='appliance'; g.add(holder);
      if(fallback) fallback.visible=false;
      Object.assign(vol,{object:holder,model:x.entry.name,modelWidth:Math.round(x.w*sx)});
    };
    if(models) put(fitByWidth(models,slotW,prefer));
    else appliancesOf(type).then(list=>put(fitByWidth(list,slotW,prefer))).catch(()=>{});
  }
  // A worktop slab [s0,s1] x [t0,t1] (along x depth) with one cut-out, as the strips around it.
  // at(along,depth,y) maps slab coordinates to a world point.
  function counterWithHole(s0,s1,t0,t1,hole,at,ang){
    const h0=Math.max(s0,hole.a0), h1=Math.min(s1,hole.a1), k0=Math.max(t0,hole.k0), k1=Math.min(t1,hole.k1);
    const y=stack.baseTop-stack.counterThickness/2;
    const strip=(a0,a1,d0,d1)=>{ if(a1-a0>1&&d1-d0>1) counter(a1-a0,d1-d0,at((a0+a1)/2,(d0+d1)/2,y),ang); };
    strip(s0,h0,t0,t1); strip(h1,s1,t0,t1); strip(h0,h1,t0,k0); strip(h0,h1,k1,t1);
  }
  const SINK_LIP=20;   // the sink flange rests this far onto the worktop on every side
  const sinkHole=(ac,kc,rim)=>({a0:ac-rim.w/2+SINK_LIP,a1:ac+rim.w/2-SINK_LIP,k0:kc-rim.d/2+SINK_LIP,k1:kc+rim.d/2-SINK_LIP});
  // A cabinet: a plain box at its real size, replaced by the code's own model once loaded.
  // The model is never stretched. Its legs/skirting are part of it, so it is lifted to meet the
  // plan's carcass top (base 100+720 -> model 820 from the floor), and its back is set on the
  // wall — the model is deeper than the carcass by the shutter. The fallback box is tagged
  // 'cabinet' so the snapshot mask pass (captureSnapshotPair) sees fronts either way.
  function place(width,code,px,py,tierY,ang,fallbackColor,fallbackH,fallbackD,procedural=false){
    const entry=haveModels&&!procedural?modelFor(code):null, dep=fallbackD||D;
    if(blocked(code||'cabinet',footprint(px,py,ang,width,dep),tierY,tierY+fallbackH)) return;
    const fb=box(width,fallbackH,dep,fallbackColor);
    fb.position.copy(world(px,py,tierY+fallbackH/2)); fb.rotation.y=ang; fb.userData.role='cabinet'; g.add(fb);
    const volume={code,object:fb};g.userData.volumes.push(volume);
    // The outline is the actual occupied volume, so procedural and GLB paths agree.
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(fb.geometry),new THREE.LineBasicMaterial({color:0x635b4b}));
    edges.position.copy(fb.position);edges.rotation.copy(fb.rotation);g.add(edges);
    if(entry){ loadModel(entry.path,entry.version).then(proto=>{
      if(!g.userData.active)return;
      const m=proto.clone(true), size=new THREE.Vector3(); new THREE.Box3().setFromObject(m).getSize(size);
      if(Math.min(size.x,size.y,size.z)<=0)return;
      own(m); m.traverse(o=>{if(o.isMesh&&isShutter(o.material))o.userData.role='cabinet';});
      fitHandles(m,code);   // before m moves: handle anchors are found in the cabinet's own frame
      m.position.z=(size.z-dep*MM)/2;   // front is +z: back face onto the carcass back plane
      const holder=new THREE.Group(); holder.add(m);
      holder.position.copy(world(px,py,Math.max(0,tierY+fallbackH-size.y/MM))); holder.rotation.y=ang+flip;
      g.add(holder);applyFinishToObject(holder);volume.object=holder;fb.visible=false;edges.visible=false;
    }).catch(()=>{}); }
  }
  // An "Additional Items" model (countertop, filler strip, panel) stretched to the box the plan
  // gives it; a plain box until it loads, or for good when the file is missing. `turn` stands a
  // front-facing flat panel sideways, as an end panel.
  // Only the chimney's own panel (`free`) is exempt from the chimney zone. Returns {hide()}.
  function item(name,side,w,h,d,pos,ang,color,role,turn=false,opts,free=false){
    if(!free&&blocked(name,footprint(pos.x/MM+cx,pos.z/MM+cy,ang,w,d),pos.y/MM-h/2,pos.y/MM+h/2)) return {hide(){}};
    let hidden=false; const parts=[];
    const b=box(w,h,d,color,opts); b.position.copy(pos); b.rotation.y=ang; b.userData.role=role; g.add(b); parts.push(b);
    const entry=haveModels?itemFor(name,side):null;
    if(entry) loadModel(entry.path,entry.version).then(proto=>{
      if(!g.userData.active||hidden)return;
      const m=proto.clone(true), size=new THREE.Vector3(); new THREE.Box3().setFromObject(m).getSize(size);
      if(Math.min(size.x,size.y,size.z)<=0)return;
      own(m); m.traverse(o=>{if(o.isMesh)o.userData.role=role;});
      const [sx,sz]=turn?[d,w]:[w,d];
      m.scale.set(sx*MM/size.x,h*MM/size.y,sz*MM/size.z); m.position.y=-h*MM/2;
      // A panel stands on its side: +90deg faces its finished side toward rising wall offset (a right
      // panel, base run on the high side); a left panel turns the other way so the finished side
      // faces the base run, not the cabinet.
      if(turn)m.rotation.y=side==='LH'?-Math.PI/2:Math.PI/2;
      const holder=new THREE.Group(); holder.add(m); holder.position.copy(pos); holder.rotation.y=ang;
      g.add(holder);applyFinishToObject(holder);b.visible=false;parts.push(holder);
    }).catch(()=>{});
    return {hide(){ hidden=true; for(const p of parts) p.visible=false; }};
  }
  const FILLER_D=76;
  const SKIRT_AT=500, SKIRT_T=3, SKIRT_H=100;   // the base models' skirting: 3mm thick, its face 500mm off the wall
  const DW_PANEL_T=15;              // FDP/SDP dishwasher panels are 15 mm boards
  // The skirting runs on unbroken under pieces that have none of their own (fillers, the
  // dishwasher), in line with the cabinets' and in their own bronze material.
  function skirting(ww,z,D,at,ang){
    if(z<=1) return;
    const sk=box(ww,z,SKIRT_T,0x7a5c44); sk.position.copy(at(Math.min(SKIRT_AT,D-60)+SKIRT_T/2,z/2)); sk.rotation.y=ang; sk.userData.role='skirting'; g.add(sk);
    skirtingReady.then(m=>{ if(!g.userData.active) return; sk.material.dispose(); sk.material=m; sk.userData.sharedMaterial=true; });
  }   // the filler profile's own depth (Models/Additional Items/Filler)
  // The worktop is deeper than the carcass (600 over 560): it runs past the 585mm shutter
  // fronts so the edge reads clean. A shallow (336) run keeps the same overhang.
  const COUNTER_OVER=Math.max(0,dOf('counter',600)-dOf('base',560));
  const counter=(w,d,pos,ang)=>item('Countertop 30mm',null,w,stack.counterThickness,d,pos,ang,0xDAD3C2,'countertop',false,{roughness:0.35,metalness:0.1});

  function placeBlind(seg,w,u,n,ang,depth,bottom,height,color){
    const along=seg.x0+seg.width/2,inset=seg.offset??0;
    const px=w.a[0]+u[0]*along+n[0]*(depth/2+inset), py=w.a[1]+u[1]*along+n[1]*(depth/2+inset);
    // a modelled blind unit carries its own door; only a missing model gets the drawn one
    if(modelFor(seg.code)) return place(seg.width,seg.code,px,py,bottom,ang,color,height,depth);
    place(seg.width,seg.code,px,py,bottom,ang,color,height,depth,true);
    const s=seg.shutter,frontAt=(s.x0+s.x1)/2;
    // Keep the door within the measured cabinet volume. The rest of the front
    // is the closed blind section, with no generic full-width door/model.
    const door=box(s.width,height-4,15,0xD8C9A3);
    door.position.copy(world(w.a[0]+u[0]*frontAt+n[0]*(depth+inset-7.5),w.a[1]+u[1]*frontAt+n[1]*(depth+inset-7.5),bottom+height/2));
    door.rotation.y=ang;door.userData.role='cabinet';door.userData.blindShutter=true;g.add(door);
  }

  // ---- CHIMNEYS — Models/Anchors/chimney over every hob with an overhead structure above it ----
  // Overhead = any wall-tier unit spanning the hob (the engine's chimney slot included) or a
  // beam over its footprint. The chimney takes the slot's width (hob + chimney_wider_than_hob_by
  // without one) and hangs at the wall tier's underside. Its zone — its own envelope plus
  // CLEAR mm in front, underside to ceiling — is reserved BEFORE anything else is placed, so no
  // cabinet, panel, accessory or appliance is ever put in front of it (blocked()).
  const beams=((window.S&&window.S.structures)||[]).filter(st=>st.type==='beam');
  const beamOver=(fp)=>beams.some(st=>rectOverlap(fp,{c:[st.x,st.y],u:[1,0],hu:st.w/2,hv:(st.d||230)/2}));
  const chimneyHobs=new Set();
  function chimney(id,width,bottom,at,ang,depthSpan,fallback){
    const x=fitByWidth(chimneyModels,width), cd=x?x.d:510;
    const [d0,d1]=depthSpan(cd), [zx,zy]=at((d0+d1)/2);
    zones.push({id,fp:footprint(zx,zy,ang,width,d1-d0),z0:bottom,z1:1e6});
    g.userData.clearance.zones.push({id,centre:[Math.round(zx),Math.round(zy)],width,depth:Math.round(d1-d0),from:bottom});
    if(x) appliance('chimney',width,at,ang,{mode:'wall',y:bottom,models:chimneyModels});
    else fallback();
    return cd;
  }
  // Where a wall cabinet's shutter faces stand, in mm from the wall: the front of its stone
  // shutter (or glass) meshes in its own model — 359 for the current wall range (336 carcass,
  // hinge gap, 15 shutter). The carcass depth + 23 stands in when there is no model.
  const SHUTTER_FACE=/shutter|glass/i;
  function shutterFront(unit,carcass){
    const entry=unit&&haveModels?modelFor(unit.code):null, fallback=Promise.resolve(carcass+23);
    if(!entry) return fallback;
    return loadModel(entry.path,entry.version).then(proto=>{
      proto.updateMatrixWorld(true);
      let front=-Infinity; const back=-proto.userData.size.z/2;
      proto.traverse(o=>{ if(o.isMesh&&[].concat(o.material).some(m=>SHUTTER_FACE.test(m?.name||'')&&!/ONYX/i.test(m.name)))
        front=Math.max(front,new THREE.Box3().setFromObject(o).max.z); });
      return Number.isFinite(front)?(front-back)/MM:carcass+23;
    }).catch(()=>carcass+23);
  }
  // The kitchen height ('7ft' / '8ft', rules.json params.heights) of a run, read off its wall
  // cabinets' height; the project's design height when the run has none.
  const kitchenFt=(tier)=>{ const H=P.heights||{}, wallH=tier.find(t=>t.height)?.height;
    return Object.keys(H).find(k=>H[k].wall===wallH)||Object.keys(H).find(k=>H[k].design_height===window.S?.options?.kitchenHeightMm)||null; };
  for(const r of (plan.runs||[])){
    const w=walls[+r.key.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    const n=KitchenGeometry.normal(w,walls), tw=(plan.tiers&&plan.tiers[r.key]&&plan.tiers[r.key].wall)||[];
    let off=0;
    for(const seg of r.segments){ off=seg.x0??off;
      if(seg.kind==='anchor'&&seg.label==='hob'){
        const a0=off, a1=off+seg.width, D=seg.depth??dOf('base',560), inset=seg.offset??0;
        const over=tw.filter(t=>{ const x0=t.x0??0; return x0<a1-1&&x0+t.width>a0+1; }), slot=over.find(t=>t.kind==='chimney');
        const hc=(a0+a1)/2, hobFp=footprint(w.a[0]+u[0]*hc+n[0]*(D/2+inset),w.a[1]+u[1]*hc+n[1]*(D/2+inset),ang,seg.width,D);
        if(over.length||beamOver(hobFp)){
          const cw=slot?slot.width:seg.width+CHIMNEY_OVER, cm=slot?(slot.x0??a0)+slot.width/2:hc, ci=slot?.offset??0;
          const bottom=slot?.z??stack.wallBottom, at=(k)=>[w.a[0]+u[0]*cm+n[0]*(k+ci),w.a[1]+u[1]*cm+n[1]*(k+ci)];
          const cd=chimney(`${r.key} hob at ${Math.round(a0)}mm`,cw,bottom,(k)=>[w.a[0]+u[0]*cm+n[0]*(k+ci),w.a[1]+u[1]*cm+n[1]*(k+ci)],ang,
            (cd)=>[0,cd+CLEAR],()=>{ const hood=box(cw,200,D-130,0x2b2b24,{metalness:0.3,roughness:0.5});
              hood.position.copy(world(w.a[0]+u[0]*cm+n[0]*((D-130)/2+ci),w.a[1]+u[1]*cm+n[1]*((D-130)/2+ci),bottom+100)); hood.rotation.y=ang; g.add(hood); });
          // Chimney panel (rules.json: chimney-panel): CP-<hob + chimney_wider_than_hob_by>-<height
          // for this kitchen height>-15 — 600 hob -> CP-700, 900 hob -> CP-1000; 7ft -> 450,
          // 8ft -> 600. It lines up with the wall cabinets: top level with theirs, face on the
          // same plane as their shutters (measured off the flanking cabinet's own model).
          const ft=kitchenFt(tw), cpH=ft&&P.chimney_panel_height?.[ft];
          if(cpH){
            const top=bottom+(slot?.height??P.heights[ft].wall), sx0=slot?(slot.x0??a0):cm-cw/2;
            const flank=tw.find(t=>t.code&&(Math.abs(t.x0+t.width-sx0)<2||Math.abs(t.x0-(sx0+cw))<2))||tw.find(t=>t.code);
            shutterFront(flank,slot?.depth??WD_WALL).then(front=>{ const [ppx,ppy]=at(front-12);
              item(`CP-${seg.width+CHIMNEY_OVER}-${cpH}-15`,null,cw,cpH,24,world(ppx,ppy,top-cpH/2),ang,0xE7E0D0,'cabinet',false,undefined,true); });
          }
          chimneyHobs.add(seg);
        }
      }
      off+=seg.width;
    }
  }
  const islandPoint=(i,r,m)=>{ const d=m.depth||r.cabinet_depth;
    return IslandRules.point(i,r,m.at+m.width/2,m.row*r.cabinet_depth+(m.row===0?r.cabinet_depth-d/2-(i.rows===1?(i.backPanel||0):0):d/2)); };
  if(plan.island?.rules&&globalThis.IslandRules){
    // an island hob has no wall behind it: its chimney hangs from a beam, clear on both faces
    const i=plan.island,r=i.rules,ang=-(i.rotation||0)*Math.PI/180;
    for(const m of i.working||[]) if(m.label==='hob'){
      const [x,y]=islandPoint(i,r,m), d=m.depth||r.cabinet_depth;
      if(!beamOver(footprint(x,y,ang,m.width,d))) continue;
      chimney(`island hob at ${Math.round(m.at)}mm`,m.width+CHIMNEY_OVER,stack.wallBottom,()=>[x,y],ang+(m.row===0?Math.PI:0),(cd)=>[-cd/2-CLEAR,cd/2+CLEAR],()=>{});
      chimneyHobs.add(m);
    }
  }
  for(const r of (plan.runs||[])){
    const w=walls[+r.key.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    let n=KitchenGeometry.normal(w,walls);
    // Worktop along this run. At a corner the perpendicular run's worktop now reaches
    // COUNTER_OVER past its cabinets into this run's corner footprint, so this run's worktop
    // starts (or ends) where that one stops instead of overlapping it.
    // Only the OTHER run's footprint counts — a 'concealed corner space' (hiddenCorner) is this
    // run's own corner cabinet running on under the worktop, and keeps its worktop.
    const ends=r.segments.filter(sg=>sg.width>0), corner=(sg)=>sg&&sg.kind==='gap'&&!sg.hiddenCorner&&/perpendicular|corner void/.test(sg.label||'');
    const lo=corner(ends[0])?(ends[0].x0??0)+ends[0].width+Math.max(0,dOf('counter',600)-ends[0].width):0;
    const last=ends[ends.length-1], hi=corner(last)?(last.x0??0)-Math.max(0,dOf('counter',600)-last.width):r.total;
    const topAt=(a,k,y)=>world(w.a[0]+u[0]*a+n[0]*k,w.a[1]+u[1]*a+n[1]*k,y);
    function worktop(a0,a1,D,inset){
      a0=Math.max(a0,Math.min(lo,a1)); a1=Math.min(a1,Math.max(hi,a0));
      if(a1-a0<1) return {hide(){}, a0, a1};
      const cd=D+COUNTER_OVER;
      return Object.assign(counter(a1-a0,cd,topAt((a0+a1)/2,cd/2+inset,stack.baseTop-stack.counterThickness/2),ang),{a0,a1});
    }
    let off=0;
    for(const seg of r.segments){ const ww=seg.width, D=seg.depth??dOf('base',560), inset=seg.offset??0;
      off=seg.x0??off;
      if(seg.hiddenCorner){
        worktop(off,off+ww,D,inset);
        off+=ww;continue;
      }
      if(seg.kind==='tallBank'){
        const units=seg.units||[{type:'pantry',width:600},{type:'fridge',width:600},{type:'appliance',width:600}];
        let so=off;
        units.forEach((tu)=>{const wmm=tu.width;const along=so+wmm/2;const px=w.a[0]+u[0]*along+n[0]*(D/2+inset),py=w.a[1]+u[1]*along+n[1]*(D/2+inset);
          if(tu.loose||tu.applianceWidth!=null){ const fw=tu.applianceWidth??wmm-40;
            if(!blocked('refrigerator',footprint(px,py,ang,fw,tu.depth??D),0,1800)){
              const fr=box(fw,1800,tu.depth??D,0xcfd3d6,{metalness:0.3,roughness:0.3}); fr.position.copy(world(px,py,900)); fr.rotation.y=ang; g.add(fr);
              appliance('fridge',fw,(k)=>[w.a[0]+u[0]*along+n[0]*(k+inset),w.a[1]+u[1]*along+n[1]*(k+inset)],ang,{mode:'floor',maxH:tu.height??seg.height??stack.tall,fallback:fr}); } }
          else place(wmm,tu.code||seg.code,px,py,tu.z??seg.z??0,ang,0x21433A,tu.height??seg.height??stack.tall,tu.depth??D);
          so+=wmm;});
        off+=ww;continue;}
      if(seg.kind==='filler'||seg.kind==='inset'){
        const tall=seg.tier==='tall', panel=/visible panel|^panel/.test(seg.label||'');
        // a deleted filler leaves open space: nothing stands there, the worktop runs on over it
        if(seg.open){ if(!tall) worktop(off,off+ww,D,inset); off+=ww; continue; }
        let h=seg.height??720, z=seg.z??100;
        // A tall gap filler starts on the floor, but the tall cabinets beside it stand on their
        // skirting: it stops at the skirting line and the skirting runs on beneath it.
        // Visible panels too: every filler or panel stops at the skirting line, with skirting
        // beneath it, so its bottom edge matches the cabinets beside it.
        if(tall&&z<SKIRT_H){ h-=SKIRT_H-z; z=SKIRT_H; }
        const along=off+ww/2;
        const at=(k,y)=>world(w.a[0]+u[0]*along+n[0]*(k+inset),w.a[1]+u[1]*along+n[1]*(k+inset),y);
        // a visible panel is an end panel standing sideways; any other filler is the front
        // filler strip (LH in the first half of the run, RH in the second)
        if(panel) item(D<450?'VP-336-15':'VP-560-15',seg.side==='left'?'LH':seg.side==='right'?'RH':null,ww,h,D,at(D/2,z+h/2),ang,0xE6DFCE,'cabinet',true);
        else item(tall?(h>2200?'TFP-2397':'TFP-2037'):'BFP-717',along<r.total/2?'LH':'RH',ww,h,FILLER_D,at(D-FILLER_D/2,z+h/2),ang,0xE6DFCE,'cabinet');
        skirting(ww,z,D,at,ang);
        if(!tall) worktop(off,off+ww,D,inset);
        off+=ww;continue;}
      if(['cabinet','anchor','corner'].includes(seg.kind)){
        const along=off+ww/2; const px=w.a[0]+u[0]*along+n[0]*(D/2+inset), py=w.a[1]+u[1]*along+n[1]*(D/2+inset);
        const isF=seg.kind==='anchor'&&TALL_ANCHORS.includes(seg.label), isH=seg.kind==='anchor'&&seg.label==='hob', isS=seg.kind==='anchor'&&['sink','veggie sink'].includes(seg.label);
        if(seg.shutter)placeBlind(seg,w,u,n,ang,D,seg.z??100,seg.height??720,colorFor(seg.kind,seg.label));
        else if(seg.label==='dishwasher'){   // the appliance, fronted by its dishwasher panel
          const z=seg.z??100, h=seg.height??720, at=(k,y=z+h/2)=>world(w.a[0]+u[0]*along+n[0]*(k+inset),w.a[1]+u[1]*along+n[1]*(k+inset),y);
          const body=box(ww,h,D-24,0x3a3a36,{metalness:0.3,roughness:0.5}); body.position.copy(at((D-24)/2)); body.rotation.y=ang; g.add(body);
          appliance('dishwasher',ww,(k)=>[w.a[0]+u[0]*along+n[0]*(k+inset),w.a[1]+u[1]*along+n[1]*(k+inset)],ang,{mode:'box',boxHD:[z+h,D-24],fallback:body,prefer:/fully/i});
          // C&J base handles take the full-height panel (FDP 717); Titus the 597 panel (SDP),
          // which leaves the machine's control strip showing above it. The panel face lines up
          // with the cabinet shutters (the base models stand 24 mm proud of the carcass).
          const titus=(window.S?.options?.handles?.base||'')==='TTS', ph=titus?Math.min(597,h):h;
          item(titus?'SDP-597-597-15':'FDP-597-717-15',null,ww,ph,DW_PANEL_T,at(D+24-DW_PANEL_T/2,z+ph/2),ang,0xE6DFCE,'cabinet');
          skirting(ww,z,D,at,ang);
        }
        else place(ww,seg.code,px,py,seg.z??(isF?0:100),ang,colorFor(seg.kind,seg.label),seg.height??(isF?stack.tall:720),D);
        if(!isF){
          const top=worktop(off,off+ww,D,inset);
          if(isH||isS){
            const surface=box(Math.max(100,ww-100),6,Math.min(400,D-60),isH?0x222222:0x77909a,{metalness:0.35,roughness:0.3});
            surface.position.copy(world(px,py,stack.baseTop+3));surface.rotation.y=ang;g.add(surface);
            const at=(k)=>[w.a[0]+u[0]*along+n[0]*(k+inset),w.a[1]+u[1]*along+n[1]*(k+inset)];
            if(isH) appliance('hob',ww,at,ang,{mode:'counter',y:stack.baseTop,centre:D/2,fallback:surface});
            else appliance('sink',ww,at,ang,{mode:'sink',y:stack.baseTop,centre:D/2,fallback:surface,prefer:seg.veggie||seg.label==='veggie sink'?/veggie/i:null,
              onRim:(rim)=>{ top.hide(); counterWithHole(top.a0,top.a1,0,D+COUNTER_OVER,sinkHole(along,D/2,rim),
                (a,k,y)=>topAt(a,k+inset,y),ang); }});
          }
          // The wall row is NOT derived here any more — see the wall-tier pass below. The hood
          // box is only a stand-in for a hob with nothing overhead (no chimney was raised).
          if(isH&&!chimneyHobs.has(seg)){ const hood=box(ww,200,D-130,0x2b2b24,{metalness:0.3,roughness:0.5}); hood.position.copy(world(px,py,stack.wallBottom+100)); hood.rotation.y=ang; g.add(hood); }
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
    // loft units (Design → Extras) ride the same pass: each carries its own x0, z and height
    const tt=(plan.tiers&&plan.tiers[r.key])||{}, tw=[...(tt.wall||[]),...(tt.loft||[])];
    let twx=0;   // fallback cursor for a plan annotated before x0 existed
    for(const tu of tw){ const ux=(tu.x0!=null?tu.x0:twx); twx=ux+tu.width;
      const along=ux+tu.width/2;
      const depth=tu.depth??WD_WALL, bottom=tu.z??stack.wallBottom, height=tu.height??(stack.wallTop-stack.wallBottom);
      const wpx=w.a[0]+u[0]*along+n[0]*(depth/2+(tu.offset??0)), wpy=w.a[1]+u[1]*along+n[1]*(depth/2+(tu.offset??0));
      if(tu.kind==='wallSolid'||tu.kind==='wallGlass'||tu.kind==='wallBlind'||tu.kind==='loft'){
        // the tier's own SKU drives the GLB (falling back to the generic 3-shelf wall unit),
        // so a glass or blind-corner wall cabinet renders as itself
        if(tu.shutter)placeBlind(tu,w,u,n,ang,depth,bottom,height,0x21433A);
        else place(tu.width,tu.code,wpx,wpy,bottom,ang,tu.kind==='wallBlind'?0x21433A:0xE7E0D0,height,depth);
      } else {
        const at=(k,y)=>world(w.a[0]+u[0]*along+n[0]*(k+(tu.offset??0)),w.a[1]+u[1]*along+n[1]*(k+(tu.offset??0)),y);
        // The chimney slot is left to the chimney alone: no backsplash, chimney panel or filler
        // is put on or over it (the chimney pass above placed the appliance itself).
        if(tu.kind==='chimney') continue;
        if((tu.kind==='filler'||tu.kind==='inset')&&!tu.open)
          item(height<900?'WFP-722':'WFP-1082',along<r.total/2?'LH':'RH',tu.width,height,FILLER_D,at(depth-FILLER_D/2,bottom+height/2),ang,0xEDE7DA,'cabinet');
      }
    }
  }
  // Backsplash regions the designer added in the Elevation, as {wallKey:[{x0,x1,z0,z1}]} in wall
  // mm (x along the wall, z up). Only the Render Portal's capture view passes them, so the AI
  // render sees exactly where the stone goes; 3D and the walkthrough stay without.
  const BS_T=15;
  for(const [key,rects] of Object.entries(plan.bsRects||{})){
    const w=walls[+key.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx),n=KitchenGeometry.normal(w,walls);
    for(const q of rects){ const along=(q.x0+q.x1)/2, b=box(q.x1-q.x0,q.z1-q.z0,BS_T,0xC3CED2);
      b.position.copy(world(w.a[0]+u[0]*along+n[0]*BS_T/2,w.a[1]+u[1]*along+n[1]*BS_T/2,(q.z0+q.z1)/2)); b.rotation.y=ang; b.userData.role='backsplash'; g.add(b); }
  }
  if(plan.island?.rules&&globalThis.IslandRules){
    const i=plan.island,r=i.rules,b=IslandRules.shape(i,r),ang=-(i.rotation||0)*Math.PI/180;
    const islandAt=(a,k,y)=>{ const [x,y2]=IslandRules.point(i,r,a,k); return world(x,y2,y); };
    const holes=[]; let slab=null;
    for(const m of i.working||[]){
      const d=m.depth||r.cabinet_depth;
      const [x,y]=islandPoint(i,r,m), face=ang+(m.row===0?Math.PI:0);
      place(m.width,m.code,x,y,stack.baseTop-stack.counterThickness-(m.height||720),face,colorFor(m.kind,m.label),m.height||720,d,m.kind==='filler');
      if(['hob','sink','veggie sink'].includes(m.label)){
        const fixture=box(Math.max(100,m.width-100),15,400,m.label==='hob'?0x242424:0x9eb2ba);
        fixture.position.copy(world(x,y,stack.baseTop+3));fixture.rotation.y=ang;fixture.userData.role=m.label;g.add(fixture);
        if(m.label==='hob') appliance('hob',m.width,()=>[x,y],face,{mode:'counter',y:stack.baseTop,fallback:fixture});
        else appliance('sink',m.width,()=>[x,y],face,{mode:'sink',y:stack.baseTop,fallback:fixture,prefer:m.label==='veggie sink'?/veggie/i:null,
          onRim:(rim)=>{ const k=m.row*r.cabinet_depth+(m.row===0?r.cabinet_depth-d/2-(i.rows===1?(i.backPanel||0):0):d/2);
            // one cut-out per island slab: a second sink (rare) sits on the strips as they are
            holes.push(sinkHole(m.at+m.width/2,k,rim));
            if(slab){ slab.hide(); slab=null; for(const h of holes.splice(0)) counterWithHole(b.left,b.right,Math.min(b.top,b.bottom),Math.max(b.top,b.bottom),h,islandAt,ang); } }});
      }
    }
    slab=counter(b.length,b.depth,world(i.x,i.y,stack.baseTop-stack.counterThickness/2),ang);
    if(i.rows===0){
      // A seating-only island has a table frame, never a hidden storage row.
      const legHeight=stack.baseTop-stack.counterThickness;
      for(const along of [b.left+426,b.right-426]){
        const [x,y]=IslandRules.point(i,r,along,(b.top+b.bottom)/2),leg=box(60,legHeight,60,0x6e655a);
        leg.position.copy(world(x,y,legHeight/2));leg.rotation.y=ang;leg.userData.role='table support';g.add(leg);
      }
    }
    for(const seat of IslandRules.stools(i,r)){
      const [x,y]=IslandRules.point(i,r,seat.x,seat.y);
      const stool=new THREE.Group();stool.position.copy(world(x,y,0));stool.rotation.y=ang;stool.userData.role='stool';
      const cushion=new THREE.Mesh(new THREE.CylinderGeometry(160*MM,160*MM,45*MM,32),std(0xc7ad90,{roughness:.85}));
      cushion.position.y=627.5*MM;stool.add(cushion);
      for(const dx of [-95,95])for(const dz of [-95,95]){
        const leg=box(24,605,24,0x776451);leg.position.set(dx*MM,302.5*MM,dz*MM);stool.add(leg);
      }
      for(const dz of [-95,95]){const rail=box(214,18,18,0x776451);rail.position.set(0,220*MM,dz*MM);stool.add(rail);}
      g.add(stool);
    }
  }
  for(const acc of (plan.placedAccessories||[])){ const w=walls[+acc.wall.slice(1)]; if(!w) continue;
    const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len],ang=Math.atan2(-dy,dx);
    let n=KitchenGeometry.normal(w,walls);
    const dep=acc.type==='kubos'?WD_WALL:140; const px=w.a[0]+u[0]*acc.off+n[0]*dep/2, py=w.a[1]+u[1]*acc.off+n[1]*dep/2;
    if(blocked(acc.type,footprint(px,py,ang,acc.width,dep),acc.tierY,acc.tierY+acc.height)) continue;
    const entry=haveModels?resolveAccessory(acc.type,acc.width):null;
    if(entry){ loadModel(entry.path,entry.version).then(proto=>{ if(!g.userData.active)return;const m=proto.clone(true);
      m.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
      const size=new THREE.Vector3();new THREE.Box3().setFromObject(m).getSize(size);
      if(Math.min(size.x,size.y,size.z)<=0)return;m.scale.set(acc.width*MM/size.x,acc.height*MM/size.y,dep*MM/size.z);
      m.position.copy(world(px,py,acc.tierY)); m.rotation.y=ang+(KitchenGeometry.area(walls)<0?Math.PI:0); g.add(m); }).catch(()=>{}); }
    else { const b=box(acc.width,acc.height,dep, acc.type==='kubos'?0x8a7a5a:0x6f6f63); b.position.copy(world(px,py,acc.tierY+acc.height/2)); b.rotation.y=ang; g.add(b); } }
  return g;
}
function disposeScene(root=scene){ if(!root) return; root.traverse(o=>{ if(o.userData.active!=null)o.userData.active=false; if(o.geometry&&!o.userData.sharedGeometry)o.geometry.dispose(); if(o.material&&!o.userData.sharedMaterial){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());} }); }
const MOVE_KEYS={KeyW:'f',ArrowUp:'f',KeyS:'b',ArrowDown:'b',KeyA:'l',ArrowLeft:'l',KeyD:'r',ArrowRight:'r'};
function keyDown(e){ const k=MOVE_KEYS[e.code]; if(k){ keys[k]=true; if(controls&&controls.isLocked) e.preventDefault(); } }
function keyUp(e){ const k=MOVE_KEYS[e.code]; if(k) keys[k]=false; }
function clearKeys(){ for(const k in keys) keys[k]=false; }   // a key held through Esc/alt-tab must not keep walking
const clock=new THREE.Clock();
const WALK_SPEED=1.6;   // m/s — a relaxed walking pace, independent of the frame rate
function animate(){
  if(!renderer){ raf=null; return; }
  raf=requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);   // capped, so a stalled frame never jumps you across the room
  if(mode==='walk'&&controls){
    let f=(keys.f?1:0)-(keys.b?1:0), r=(keys.r?1:0)-(keys.l?1:0);
    if(controls.isLocked&&(f||r)){
      const step=WALK_SPEED*dt/(f&&r?Math.SQRT2:1);   // diagonal no faster than straight
      // Move, then test each axis on its own: blocked on one axis you still slide along the
      // other, instead of the whole step being thrown away (which felt like sticking).
      const x0=camera.position.x, z0=camera.position.z;
      controls.moveForward(f*step); controls.moveRight(r*step);
      if(bounds&&!walkPointInside(camera.position.x,camera.position.z)){
        const x1=camera.position.x, z1=camera.position.z;
        if(walkPointInside(x1,z0)) camera.position.z=z0;
        else if(walkPointInside(x0,z1)) camera.position.x=x0;
        else { camera.position.x=x0; camera.position.z=z0; }
      }
    }
  } else if(controls){ controls.update();
    // see-through walls: hide the wall(s) standing between the camera and the room interior —
    // material flags only change when a wall actually flips side
    for(const wm of wallMeshes){ const outside=(camera.position.x-wm.mx)*wm.nx+(camera.position.z-wm.mz)*wm.nz>0;
      if(wm.outside===outside) continue; wm.outside=outside;
      wm.mesh.material.transparent=true; wm.mesh.material.opacity=outside?0.05:1; wm.mesh.material.depthWrite=!outside; wm.mesh.material.needsUpdate=true; }
  }
  renderer.render(scene,camera);
}
function teardown(){
  sceneRequest++;
  if(raf){ cancelAnimationFrame(raf); raf=null; }
  window.removeEventListener('keydown',keyDown); window.removeEventListener('keyup',keyUp); window.removeEventListener('blur',clearKeys); clearKeys();
  if(resizeObs){ resizeObs.disconnect(); resizeObs=null; }
  if(camera&&controls instanceof PointerLockControls) walkPose={p:camera.position.clone(),q:camera.quaternion.clone()};
  setPlain(false);
  if(controls){ try{controls.unlock&&controls.unlock();}catch(e){} try{controls.dispose&&controls.dispose();}catch(e){} controls=null; }
  if(renderer){ renderer.dispose(); const el=renderer.domElement; if(el&&el.parentNode)el.parentNode.removeChild(el); renderer=null; }
  disposeScene(); scene=null; camera=null;
}
let sceneRequest=0;
let walkPose=null;   // where the last walk scene was standing: the capture view opens on the same angle
function walkPointInside(x,z){
  const px=x/MM+bounds.cx,py=z/MM+bounds.cy;
  return KitchenGeometry.containsRect({x0:px-350,x1:px+350,y0:py-350,y1:py+350},roomWalls);
}
async function startScene(plan, walls, m, orbitId, walkId, hintId, plainScene){
  if(!plan || !walls || !walls.length) return;
  mode=m||'orbit';
  container=document.getElementById(mode==='walk'?(walkId||'walkCanvas'):(orbitId||'view3d'));
  hint=document.getElementById(hintId||'walkHint');
  if(!container) return;
  if(renderer) teardown();
  setPlain(!!plainScene);
  const request=++sceneRequest;
  await getManifest();
  chimneyModels=await appliancesOf('chimney');
  if(request!==sceneRequest)return;
  const Wd=container.clientWidth||600, Hd=container.clientHeight||380;
  scene=new THREE.Scene(); scene.background=null;   // transparent → the model floats over the beige grid
  scene.add(new THREE.HemisphereLight(0xffffff,0x6b6b5a,1.2));
  const dl=new THREE.DirectionalLight(0xfff2d8,0.75); dl.position.set(2,5,1.5); scene.add(dl);
  camera=new THREE.PerspectiveCamera(mode==='walk'?72:50, Wd/Hd, mode==='walk'?0.05:0.01, mode==='walk'?40:100);
  // No preserveDrawingBuffer: it forced a full buffer copy every frame. Snapshots re-render
  // immediately before reading the canvas (captureSnapshotPair), so they never needed it.
  // Pixel ratio capped at 1.5: on a 2x screen that is ~44% fewer pixels to shade per frame.
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'}); renderer.setClearColor(0x000000,0); renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); renderer.setSize(Wd,Hd);
  container.innerHTML=''; container.appendChild(renderer.domElement);
  // Follow the container: the canvas reflows when the layout around it changes (window
  // resize, a panel opening or closing) instead of keeping its size from scene start.
  resizeObs=new ResizeObserver(()=>{ const w=container.clientWidth, h=container.clientHeight;
    if(!renderer||!camera||!w||!h) return; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h); });
  resizeObs.observe(container);
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
    if(walkPose&&walkPointInside(walkPose.p.x,walkPose.p.z)){ camera.position.copy(walkPose.p); camera.quaternion.copy(walkPose.q); }
    controls.addEventListener('lock',()=>{ if(hint)hint.style.display='none'; });
    controls.addEventListener('unlock',()=>{ clearKeys(); if(hint)hint.style.display='block'; });
    container.onclick=()=>{ try{controls.lock();}catch(e){} };
    window.addEventListener('keydown',keyDown); window.addEventListener('keyup',keyUp); window.addEventListener('blur',clearKeys);
    // walls are always solid while walking: set once, not every frame
    for(const wm of wallMeshes){ wm.mesh.material.transparent=false; wm.mesh.material.opacity=1; wm.mesh.visible=true; }
  } else {
    controls=new OrbitControls(camera, renderer.domElement);
    camera.position.set(span*0.9, span*0.95, span*0.9); controls.target.set(0,1.0,0);
    controls.enableDamping=true; controls.maxPolarAngle=Math.PI*0.49; controls.update();
  }
  clock.getDelta();   // the first frame's step starts now, not at the last scene
  animate();
}
window.startScene=startScene;

/* ---- wall elevation (classic-script entry point) ----
   A front-on orthographic render of ONE wall, built from the same buildKitchen scene as 3D —
   same models, finish, appliances — so the Elevation view looks like the CAD elevation. Only
   that wall's own objects are kept (the adjacent wall's return would show sliced open at the
   corners). The image spans exactly [0, wall length] x [0, ceil] mm; `a` is on the right when
   the wall is seen from inside that way round (elevationFlip). Renders are queued on their own
   GL context and cached by wall content, so an unchanged wall never re-renders. */
let elevR=null, elevQ=Promise.resolve();
const elevCache=new Map();
function elevationFrame(w,walls){
  const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],L=Math.hypot(dx,dy)||1,u=[dx/L,dy/L],n=KitchenGeometry.normal(w,walls);
  return {L,u,n,ang:Math.atan2(-dy,dx),flip:u[0]*n[1]-u[1]*n[0]<0};
}
window.elevationFlip=(walls,key)=>{ const w=walls[+String(key).slice(1)]; return !!w&&elevationFrame(w,walls).flip; };
async function settleLoads(){
  for(let n=-1;n!==tracked.length;){ n=tracked.length; await Promise.allSettled(tracked.slice()); await new Promise(r=>setTimeout(r,0)); }
}
window.renderElevation=function(plan,walls,key,{ceil=2700,px=1800}={}){
  const w=walls&&walls[+String(key).slice(1)];
  if(!w) return Promise.reject(new Error('no wall '+key));
  const ck=JSON.stringify([key,walls,(plan.runs||[]).find(r=>r.key===key),plan.tiers&&plan.tiers[key],plan.geometry,
    (plan.openings||[]).filter(o=>o.wall===key),FINISH,ceil,px]);
  if(elevCache.has(ck)) return elevCache.get(ck);
  const job=elevQ.then(async()=>{
    await getManifest();
    if(!chimneyModels.length) chimneyModels=await appliancesOf('chimney');
    const saved=[roomWalls,bounds,wallMeshes];
    tracked=[];
    let g, b;
    try{ g=buildKitchen(plan,walls); b=bounds;
      await Promise.race([settleLoads(),new Promise(r=>setTimeout(r,10000))]);
    } finally{ tracked=null; [roomWalls,bounds,wallMeshes]=saved; }
    const {L,u,n,ang}=elevationFrame(w,walls);
    // keep what stands on this wall: same orientation (either way round), within reach of it
    for(const o of g.children){
      const x=o.position.x/MM+b.cx-w.a[0], y=o.position.z/MM+b.cy-w.a[1], d=x*n[0]+y*n[1], along=x*u[0]+y*u[1];
      o.visible=o.visible&&Math.abs(Math.sin((o.rotation.y||0)-ang))<0.02&&d>-400&&d<900&&along>-60&&along<L+60;
    }
    g.traverse(o=>{ if(o.userData.modelLabel) o.visible=false; });
    const sc=new THREE.Scene(); sc.add(g);
    // Flat, bright, front-on light: an elevation reads colours and shutter lines, not mood.
    sc.add(new THREE.AmbientLight(0xffffff,1.6), new THREE.HemisphereLight(0xffffff,0x8a8a7a,0.8));
    const mid=[(w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2], target=new THREE.Vector3((mid[0]-b.cx)*MM,ceil/2*MM,(mid[1]-b.cy)*MM);
    const key1=new THREE.DirectionalLight(0xffffff,1.4); key1.position.copy(target).add(new THREE.Vector3(n[0]*3-u[0],1.5,n[1]*3-u[1])); key1.target.position.copy(target); sc.add(key1,key1.target);
    const cam=new THREE.OrthographicCamera(-L/2*MM,L/2*MM,ceil/2*MM,-ceil/2*MM,0.01,6);
    cam.position.copy(target).add(new THREE.Vector3(n[0]*4,0,n[1]*4)); cam.up.set(0,1,0); cam.lookAt(target);
    const W=Math.round(Math.min(px,px*L/ceil)), H=Math.round(W*ceil/L);
    if(!elevR){ elevR=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); elevR.outputColorSpace=THREE.SRGBColorSpace; }
    elevR.setSize(W,H,false); elevR.setClearColor(0xF8F5EF,1); elevR.render(sc,cam);
    const url=elevR.domElement.toDataURL('image/jpeg',0.9);
    g.userData.active=false; disposeScene(sc);
    return url;
  });
  elevQ=job.catch(()=>{});
  job.catch(()=>elevCache.delete(ck));
  elevCache.set(ck,job);
  if(elevCache.size>40) elevCache.delete(elevCache.keys().next().value);
  return job;
};
// Pre-sales deck: eye-level views of the finished kitchen from inside the room, one from each
// corner that is inside it (up to `count`). Same build + queue as renderElevation, own camera.
window.renderPerspectives=function(plan,walls,{count=4,w=1600,h=900}={}){
  const job=elevQ.then(async()=>{
    await getManifest();
    if(!chimneyModels.length) chimneyModels=await appliancesOf('chimney');
    const saved=[roomWalls,bounds,wallMeshes];
    tracked=[];
    let g, b, rw, wm;
    try{ g=buildKitchen(plan,walls); b=bounds; rw=roomWalls; wm=wallMeshes;
      await Promise.race([settleLoads(),new Promise(r=>setTimeout(r,10000))]);
    } finally{ tracked=null; [roomWalls,bounds,wallMeshes]=saved; }
    for(const m of wm){ m.mesh.material.transparent=false; m.mesh.material.opacity=1; m.mesh.visible=true; }
    g.traverse(o=>{ if(o.userData.modelLabel) o.visible=false; });
    const sc=new THREE.Scene(); sc.add(g); if(FINISH) applyFinishToObject(sc);
    sc.add(new THREE.HemisphereLight(0xffffff,0x6b6b5a,1.5));
    const dl=new THREE.DirectionalLight(0xfff2d8,0.9); dl.position.set(2,5,1.5); sc.add(dl);
    if(!elevR){ elevR=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); elevR.outputColorSpace=THREE.SRGBColorSpace; }
    elevR.setSize(w,h,false); elevR.setClearColor(0xEDE8DE,1);
    const cam=new THREE.PerspectiveCamera(68,w/h,0.05,40), out=[];
    for(const [x,y] of [[b.minx,b.maxy],[b.maxx,b.maxy],[b.maxx,b.miny],[b.minx,b.miny]]){
      // ponytail: fixed 85%-to-the-corner pose; a pose picker if sales want framed shots
      const px=b.cx+(x-b.cx)*0.85, py=b.cy+(y-b.cy)*0.85;
      if(!KitchenGeometry.containsRect({x0:px-300,x1:px+300,y0:py-300,y1:py+300},rw)) continue;
      cam.position.set((px-b.cx)*MM,1.6,(py-b.cy)*MM); cam.lookAt(0,1.1,0);
      elevR.render(sc,cam); out.push(elevR.domElement.toDataURL('image/jpeg',0.88));
      if(out.length>=count) break;
    }
    g.userData.active=false; disposeScene(sc);
    return out;
  });
  elevQ=job.catch(()=>{});
  return job;
};
// Read-only diagnostics for the local verification page: measure actual rendered
// objects after transforms/model loading, rather than echoing requested sizes.
window.inspectSceneGeometry=function(){
  if(!scene||!bounds)return null;scene.updateMatrixWorld(true);const volumes=[];
  let clearance=null;
  scene.traverse(g=>{ if(g.userData.clearance) clearance=g.userData.clearance;
    for(const v of g.userData.volumes||[]){ if(!v.object) continue; const b=new THREE.Box3().setFromObject(v.object);
    volumes.push({code:v.code,...(v.slot!=null?{slot:v.slot,model:v.model||null,modelWidth:v.modelWidth??null}:{}),x0:b.min.x/MM+bounds.cx,x1:b.max.x/MM+bounds.cx,y0:b.min.z/MM+bounds.cy,y1:b.max.z/MM+bounds.cy,z0:b.min.y/MM,z1:b.max.y/MM});}});
  return {volumes,clearance,cameraInside:KitchenGeometry.pointInside(camera.position.x/MM+bounds.cx,camera.position.z/MM+bounds.cy,roomWalls)};
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
// Snapshots are always exactly 16:9, whatever shape the pane is: the AI renderer only returns a
// fixed set of shapes, and any mismatch makes it squash or re-frame the cabinets. Same pose and
// vertical field of view. The Render Portal's capture pane (#rpWalk) is 16:9 itself, so what
// you see is what is kept.
const SNAP_W=1920, SNAP_H=1080;
window.captureSnapshotPair=function(){
  if(!renderer||mode!=='walk'||!scene||!camera) return null;
  const live=renderer.getSize(new THREE.Vector2()), livePr=renderer.getPixelRatio(), liveAspect=camera.aspect;
  renderer.setPixelRatio(1); renderer.setSize(SNAP_W,SNAP_H,false);
  camera.aspect=SNAP_W/SNAP_H; camera.updateProjectionMatrix();
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
  scene.background=oldBg;
  renderer.setPixelRatio(livePr); renderer.setSize(live.x,live.y,false);
  camera.aspect=liveAspect; camera.updateProjectionMatrix();
  renderer.render(scene,camera);   // restore the live view before returning
  return {photo,mask};
};
window.stopScene=function(){ teardown(); if(hint)hint.style.display='block'; };
mountLogos();
