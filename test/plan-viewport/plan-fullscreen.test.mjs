import test from 'node:test';
import assert from 'node:assert/strict';
import '../../ui/plan-fullscreen.js';

function harness(mode='native'){
  const events={};
  let doc;
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
    get isConnected(){return this===doc.body||!!this.parent?.isConnected;}
    appendChild(node){node.remove();this.children.push(node);node.parent=this;return node;}
    remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
    before(node){node.remove();const p=this.parent;p.children.splice(p.children.indexOf(this),0,node);node.parent=p;}
    replaceWith(node){this.before(node);this.remove();}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(k,fn){this.events[k]=fn;}
    querySelector(tag){return this.children.find(n=>n.tag===tag);}
    showModal(){this.open=true;}
    close(){this.open=false;}
    focus(){doc.activeElement=this;}
  }
  doc={fullscreenElement:null,createElement:tag=>new Element(tag),createComment:()=>new Element('comment'),addEventListener(k,fn){events[k]=fn;},async exitFullscreen(){this.fullscreenElement=null;events.fullscreenchange();}};
  doc.body=new Element('body');
  const parent=doc.body.appendChild(new Element('main'));
  const before=parent.appendChild(new Element('aside'));
  const viewer=parent.appendChild(new Element('div'));
  const after=parent.appendChild(new Element('footer'));
  const svg=viewer.appendChild(new Element('svg'));
  svg.setAttribute('viewBox','100 80 340 260');
  const button=viewer.appendChild(new Element('button'));button.focus();
  if(mode==='native')viewer.requestFullscreen=async()=>{doc.fullscreenElement=viewer;events.fullscreenchange();};
  if(mode==='blocked')viewer.requestFullscreen=async()=>{throw new Error('Fullscreen blocked');};
  const controller=PlanFullscreen.create(viewer,button,doc);
  return {controller,doc,parent,before,after,viewer,svg,button,events};
}

function assertRestored(h){
  assert.equal(h.controller.active,false);
  assert.deepEqual(h.parent.children,[h.before,h.viewer,h.after]);
  assert.equal(h.doc.body.children.length,1,'temporary modal is removed');
  assert.equal(h.viewer.querySelector('svg'),h.svg,'same interactive SVG retained');
  assert.equal(h.svg.attrs.viewBox,'100 80 340 260','camera is retained');
  assert.equal(h.button.attrs['aria-expanded'],'false');
  assert.equal(h.doc.activeElement,h.button,'focus returns to the invoking control');
}

test('fullscreen button expands the existing viewer and restores its exact position and camera',async()=>{
  const h=harness();
  await h.button.onclick();
  assert.equal(h.controller.active,true);
  assert.equal(h.doc.fullscreenElement,h.viewer);
  assert.equal(h.viewer.parent.tag,'dialog');
  assert.equal(h.viewer.parent.open,true);
  assert.equal(h.button.textContent,'Exit full screen');
  assert.equal(h.button.attrs['aria-expanded'],'true');
  assert.equal(h.doc.activeElement,h.svg);
  await h.button.onclick();
  assert.equal(h.doc.fullscreenElement,null);
  assertRestored(h);
});

test('browser Escape restores the viewer after native fullscreen ends',async()=>{
  const h=harness();await h.controller.enter();
  h.doc.fullscreenElement=null;h.events.fullscreenchange();
  assertRestored(h);
  await h.controller.enter();await h.controller.exit();assertRestored(h);
});

for(const mode of ['blocked','unsupported'])test(`${mode} native fullscreen keeps a usable expanded dialog with Escape`,async()=>{
  const h=harness(mode);await h.controller.enter();
  assert.equal(h.controller.active,true);
  assert.ok(h.viewer.classes.has('plan-expanded'));
  let prevented=false;
  h.viewer.parent.events.cancel({preventDefault(){prevented=true;}});
  assert.ok(prevented);
  assertRestored(h);
});

test('exiting while the browser is entering fullscreen leaves no stranded fullscreen viewer',async()=>{
  const h=harness();let finish;
  h.viewer.requestFullscreen=()=>new Promise(resolve=>{finish=()=>{h.doc.fullscreenElement=h.viewer;resolve();};});
  const entering=h.controller.enter();
  await h.controller.exit();assertRestored(h);
  finish();await entering;
  assert.equal(h.doc.fullscreenElement,null);
  assertRestored(h);
});
