import test from 'node:test';
import assert from 'node:assert/strict';
import '../../ui/plan-viewport.js';
import '../../ui/detailed-plan.js';

test('cursor-centred zoom preserves the inspected point and clamps magnification',()=>{
  const v={x:25,y:80,scale:2},p={x:130,y:240};
  const z=PlanViewport.zoomAt(v,2,p);
  assert.equal(z.scale,4);
  assert.equal((p.x-v.x)*v.scale,(p.x-z.x)*z.scale);
  assert.equal((p.y-v.y)*v.scale,(p.y-z.y)*z.scale);
  assert.equal(PlanViewport.zoomAt(z,100,p).scale,10);
  assert.equal(PlanViewport.zoomAt(v,.0001,p).scale,1);
  assert.deepEqual(v,{x:25,y:80,scale:2});
});

function harness(){
  const events={},attrs={},buttons=new Map(),captured=new Set();
  const controls={querySelector(key){if(!buttons.has(key))buttons.set(key,{setAttribute(k,v){this[k]=v;}});return buttons.get(key);}};
  const svg={style:{},setAttribute(k,v){attrs[k]=v;},addEventListener(k,fn){events[k]=fn;},focus(){},
    setPointerCapture(id){captured.add(id);},hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),
    getScreenCTM(){return {inverse:()=>{const [x,y,w]=attrs.viewBox.split(' ').map(Number);return {x,y,scale:680/w};}};},
    createSVGPoint(){return {x:0,y:0,matrixTransform(m){return {x:m.x+this.x/m.scale,y:m.y+this.y/m.scale};}};}};
  const controller=PlanViewport.create(svg,controls);
  const event=(overrides={})=>({preventDefault(){},stopImmediatePropagation(){},target:{closest:()=>null},pointerId:1,button:0,pointerType:'mouse',clientX:100,clientY:100,...overrides});
  return {events,attrs,controls,controller,event};
}
test('buttons, redraws, room changes and keyboard fit keep a predictable camera',()=>{
  const h=harness();h.controller.sync('room-a');
  h.controls.querySelector('[data-plan-zoom="in"]').onclick();
  const zoomed=h.attrs.viewBox;assert.equal(h.controller.view.scale,1.35);
  h.controller.sync('room-a');assert.equal(h.attrs.viewBox,zoomed,'selection and style redraws retain zoom');
  h.events.keydown(h.event({key:'ArrowRight'}));assert.notEqual(h.attrs.viewBox,zoomed);
  h.events.keydown(h.event({key:'0'}));assert.equal(h.attrs.viewBox,'0 0 680 520');
  h.controller.zoom(3);h.controller.sync('room-b');assert.equal(h.attrs.viewBox,'0 0 680 520');
});
test('wheel zoom and background pan do not intercept cabinet selection',()=>{
  const h=harness();h.controller.sync('room');
  h.events.wheel(h.event({deltaY:-120}));assert.ok(h.controller.view.scale>1);
  const before=h.controller.view;
  h.events.pointerdown(h.event());h.events.pointermove(h.event({clientX:160}));h.events.pointerup(h.event({type:'pointerup',clientX:160}));
  assert.ok(h.controller.view.x<before.x);
  let suppressed=false;
  h.events.click(h.event({stopImmediatePropagation(){suppressed=true;}}));assert.ok(suppressed,'drag must not select a cabinet');
  const panned=h.controller.view;
  h.events.pointerdown(h.event({target:{closest:()=>({})}}));h.events.pointermove(h.event({clientX:180}));
  assert.deepEqual(h.controller.view,panned,'normal cabinet gestures stay with the editor');
});
test('touch pinch zooms, pan mode suppresses selection, and fit resets both axes',()=>{
  const h=harness();h.controller.sync('room');
  h.events.pointerdown(h.event({pointerType:'touch',clientX:100}));
  h.events.pointerdown(h.event({pointerType:'touch',pointerId:2,clientX:200}));
  h.events.pointermove(h.event({pointerType:'touch',pointerId:2,clientX:300}));
  assert.equal(h.controller.view.scale,2);
  h.events.pointerup(h.event({pointerType:'touch',type:'pointerup',pointerId:2,clientX:300}));
  h.events.pointerup(h.event({pointerType:'touch',type:'pointerup'}));
  h.controls.querySelector('[data-plan-pan]').onclick();
  assert.equal(h.controls.querySelector('[data-plan-pan]')['aria-pressed'],'true');
  h.controls.querySelector('[data-plan-fit]').onclick();assert.deepEqual(h.controller.view,{x:0,y:0,scale:1});
});
test('cabinet descriptions wrap at a consistent font size instead of shrinking indefinitely',()=>{
  const lines=DetailedPlan.wrapLabel(['Wall blind cabinet','3 glass shelves'],26,4.5,3);
  assert.equal(lines.length,3);
  assert.ok(lines.every(l=>l.length<=10));
  assert.match(lines.at(-1),/…$/);
});
