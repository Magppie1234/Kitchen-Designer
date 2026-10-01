import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import '../../ui/geometry.js';
import '../../ui/island-rules.js';
import {RULE_PARAMS} from '../../core/config.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function editor(){
  let panel;const calls=[],listeners={},events={},messages=[];let undos=0;
  const S={screen:'editor',activeRoomId:'room1',options:{island:false},steps:{},hob:{},fridge:{width:900},walls, zones:[],openings:[],structures:[],anchors:[{type:'sink',width:900,wall:'W0',off:1000}]};
  const c=vm.createContext({S,API:'',IslandRules,Number,Math,structuredClone,setInterval:()=>0,
    activeRoom:()=>({seriesId:'gold'}),sinkWidth:()=>900,fxWidthMm:a=>a.width,esc:s=>String(s),
    document:{getElementById:()=>panel,createElement:()=>({style:{},addEventListener:(n,f)=>listeners[n]=f,querySelectorAll:()=>[],setAttribute:()=>{}}),body:{append:p=>panel=p},head:{append:()=>{}}},
    fetch:(path,body)=>new Promise(resolve=>calls.push({path,body:JSON.parse(body.body),resolve})),
    markInProcess:()=>{},scheduleAutosave:()=>{},renderEditorLeft:()=>{},renderPos:()=>{},pushUndo:()=>undos++,showToast:s=>messages.push(s),go:screen=>S.screen=screen,
    svgPoint:(_,e)=>({x:e.x,y:e.y}),addEventListener:(k,f)=>events[k]=f,removeEventListener:(k,f)=>{if(events[k]===f)delete events[k];}});
  c.window=c;vm.runInContext(readFileSync('ui/island-ui.js','utf8'),c);
  return {c,S,calls,events,messages,undos:()=>undos,panel:()=>panel,
    click:(action,index)=>listeners.click({target:{closest:()=>({dataset:{islandAction:action,index}})}}),
    change:(field,value,type='number')=>listeners.change({target:{dataset:{field},value,type,checked:!!value}})};
}
const selected={x:3000,y:3000,length:1800,rows:1,rotation:0,seatSides:['south'],fixtures:[]};
const walls=[[[0,0],[6000,0]],[[6000,0],[6000,6000]],[[6000,6000],[0,6000]],[[0,6000],[0,0]]].map(([a,b])=>({a,b}));
function reply(options=[selected]){return {rules:RULE_PARAMS.island,ready:true,context:{walls,obstacles:[],ready:true},options,selected:null};}
const resolve=(call,data)=>call.resolve({ok:true,json:async()=>data});

test('opening suggests without adding; selecting persists dimensions; editing keeps invalid sizes visible',async()=>{
  const e=editor();e.c.IslandDesigner.open();resolve(e.calls[0],reply());await flush();
  assert.equal(e.S.options.island,false);assert.match(e.panel().innerHTML,/1860 × 976 mm/);
  e.click('choose','0');assert.equal(e.S.options.island,true);assert.equal(e.S.options.islandConfig.length,1800);
  assert.equal(e.S.options.islandConfig.y,3000);
  resolve(e.calls[1],{...reply(),selected:{...selected,working:[],problems:[],unresolved:[]}});await flush();
  e.change('length','1217');assert.equal(e.S.options.islandConfig.length,1217);
  resolve(e.calls[2],{...reply(),selected:{...selected,length:1217,working:[],problems:['Cannot fill selected gap'],unresolved:[]}});await flush();
  assert.match(e.panel().innerHTML,/Cannot fill selected gap/);assert.equal(e.S.options.islandConfig.length,1217);
  e.click('remove');assert.equal(e.S.options.island,false);assert.equal(e.S.options.islandConfig.length,1217);
});
test('late room checks cannot overwrite newer island options or select an island automatically',async()=>{
  const e=editor();e.c.IslandDesigner.open();e.S.walls=[{a:[0,0],b:[6000,0]}];e.c.IslandDesigner.refresh(true);
  resolve(e.calls[1],reply([{...selected,length:2400}]));await flush();
  resolve(e.calls[0],reply());await flush();
  assert.match(e.panel().innerHTML,/2460 × 976 mm/);assert.doesNotMatch(e.panel().innerHTML,/1800 x 976 mm/);
  assert.equal(e.S.options.island,false);
});
test('fixture assignment is explicit and removal returns it to the saved wall anchor',async()=>{
  const e=editor();e.c.IslandDesigner.open();resolve(e.calls[0],reply());await flush();e.click('choose','0');
  e.change('fixture.sink',true,'checkbox');
  assert.equal(e.c.IslandDesigner.assigned('sink'),true);assert.equal(e.S.anchors[0].off,1000);
  assert.equal(e.S.options.islandConfig.fixtures[0].width,900);
  e.change('fixture.sink',false,'checkbox');assert.equal(e.c.IslandDesigner.assigned('sink'),false);
  assert.equal(e.S.anchors[0].wall,'W0');
});
async function readyEditor(){
  const e=editor();e.c.IslandDesigner.open();resolve(e.calls[0],reply());await flush();e.click('choose','0');
  resolve(e.calls[1],{...reply(),selected:{...selected,working:[],problems:[],unresolved:[]}});await flush();return e;
}
function beginDrag(e){
  const hit={},svg={querySelector:()=>hit},t={sc:1,X:x=>x,Y:y=>y};
  e.c.IslandDesigner.bind(svg,t);hit.onmousedown({button:0,x:3000,y:3000,preventDefault(){},stopPropagation(){}});return t;
}
test('drag shades permitted centres, blocks outside drops and only saves a checked position',async()=>{
  const e=await readyEditor(),before=structuredClone(e.S.options.islandConfig),undo=e.undos(),t=beginDrag(e);
  assert.match(e.c.IslandDesigner.svg(t),/data-island-placement-area/);
  e.events.mousemove({x:3000,y:-1000});
  assert.deepEqual(structuredClone(e.S.options.islandConfig),before,'drag preview does not mutate the saved island');
  const held=e.c.IslandDesigner.svg(t);
  assert.doesNotMatch(held,/data-island-blocked-preview/,'no translucent copy is drawn outside the allowed area');
  assert.match(held,/data-island-drag-status/,'a blocked drag says so');
  const [,dx,dy]=/translate\(([-\d.]+),([-\d.]+)\) rotate\([-\d.]+\)" data-island="true"/.exec(held);
  assert.equal(IslandRules.check(reply().context,{...before,x:+dx,y:+dy},RULE_PARAMS.island,{services:false}).valid,true,
    'the island shown mid-drag is itself a placeable position');
  e.events.mouseup();
  assert.equal(e.S.options.islandConfig.y,1538,'1050 front aisle plus half of the 976mm finished depth');
  assert.equal(IslandRules.check(reply().context,e.S.options.islandConfig,RULE_PARAMS.island,{services:false}).valid,true);
  assert.equal(e.undos(),undo+1);assert.equal(e.events.mousemove,undefined);
  assert.doesNotMatch(e.c.IslandDesigner.svg(t),/data-island-placement-area/);
});
test('Escape and room edits cancel the drag; stale limits cannot start a drag',async()=>{
  const e=await readyEditor(),before=structuredClone(e.S.options.islandConfig);beginDrag(e);
  e.events.mousemove({x:3100,y:3100});e.events.keydown({key:'Escape',preventDefault(){}});
  assert.deepEqual(structuredClone(e.S.options.islandConfig),before);
  beginDrag(e);e.S.openings.push({type:'door',wall:'W0',off:2000,width:900});
  e.events.mousemove({x:3300,y:3300});assert.deepEqual(structuredClone(e.S.options.islandConfig),before);assert.equal(e.events.mouseup,undefined);
  beginDrag(e);assert.equal(e.events.mousemove,undefined);assert.match(e.messages.at(-1),/Checking placement limits/);
});
test('invalid coordinate and orientation edits cannot bypass the placement constraint',async()=>{
  const e=await readyEditor();e.change('y','0');assert.equal(e.S.options.islandConfig.y,3000);
  assert.match(e.messages.at(-1),/Position blocked/);
  e.change('rotation','45');assert.equal(e.S.options.islandConfig.rotation,0);
});
test('large option sets group into standard width cards without a show-all list',async()=>{
  const options=[];for(const length of [1200,1350,1500,1650,1800,1950,2100,2250,2400,2550,2700,3000])for(const rows of [1,2])for(const rotation of [0,90])options.push({...selected,seatSides:[],length,rows,rotation});
  const e=editor();e.c.IslandDesigner.open();resolve(e.calls[0],reply(options));await flush();
  const h=e.panel().innerHTML;assert.equal((h.match(/data-island-action="choose"/g)||[]).length,2);
  assert.equal((h.match(/aria-label="Island layout and room position"/g)||[]).length,2);
  assert.doesNotMatch(h,/Show all|Options that fit/);assert.match(h,/Storage only/);assert.match(h,/Double storage/);
});
test('width selector preserves a custom length and supports a seating-only layout',async()=>{
  const e=await readyEditor();e.change('length','2377');
  resolve(e.calls.at(-1),{...reply(),selected:{...selected,length:2377,working:[],problems:[],unresolved:[]}});await flush();
  e.change('standardWidth','900','select');
  assert.equal(e.S.options.islandConfig.length,2377);assert.equal(e.S.options.islandConfig.rows,0);
  assert.deepEqual([...e.S.options.islandConfig.seatSides],['north','south']);
  resolve(e.calls.at(-1),{...reply(),selected:{...e.S.options.islandConfig,working:[],problems:[],unresolved:[]}});await flush();
  assert.match(e.panel().innerHTML,/Seating-only islands have no cabinets/);
  assert.doesNotMatch(e.panel().innerHTML,/data-field="fixture.sink"/);
  e.change('standardWidth','1200','select');assert.equal(e.S.options.islandConfig.rows,2);assert.equal(e.S.options.islandConfig.length,2377);
});
