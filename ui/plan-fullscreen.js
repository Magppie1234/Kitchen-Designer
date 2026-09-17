/* Expand the existing viewer, retaining its SVG camera and cabinet handlers. */
(function(root){
  function create(viewer,button,doc=document){
    let active=false,native=false,closing=false,marker=null,dialog=null,previousFocus=null;
    function restore(){
      if(!active)return;
      active=false;native=false;
      viewer.classList.remove('plan-expanded');
      marker.replaceWith(viewer);marker=null;
      dialog.close();dialog.remove();dialog=null;
      button.textContent='Full screen';button.setAttribute('aria-expanded','false');
      button.title='Open the plan full screen';
      if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
    }
    async function exit(){
      if(!active||closing)return;
      closing=true;
      try{
        if(doc.fullscreenElement===viewer){
          await doc.exitFullscreen();
        }
        restore();
      }catch(_){/* Keep the exit control available if the browser refuses. */}
      finally{closing=false;}
    }
    async function enter(){
      if(active||closing)return;
      previousFocus=doc.activeElement;
      marker=doc.createComment('plan viewer position');viewer.before(marker);
      dialog=doc.createElement('dialog');dialog.className='plan-fullscreen-dialog';
      dialog.setAttribute('aria-label','Full screen kitchen plan');
      dialog.addEventListener('cancel',ev=>{ev.preventDefault();exit();});
      doc.body.appendChild(dialog);dialog.appendChild(viewer);dialog.showModal();
      active=true;viewer.classList.add('plan-expanded');
      button.textContent='Exit full screen';button.setAttribute('aria-expanded','true');
      button.title='Exit full screen (Esc)';
      // A viewport-filling dialog remains usable when native fullscreen is
      // unsupported or blocked by the host browser's permissions policy.
      try{
        if(viewer.requestFullscreen){
          await viewer.requestFullscreen();
          if(!active){if(doc.fullscreenElement===viewer)await doc.exitFullscreen();return;}
          native=doc.fullscreenElement===viewer;
        }
      }catch(_){native=false;}
      if(active)viewer.querySelector('svg')?.focus({preventScroll:true});
    }
    doc.addEventListener('fullscreenchange',()=>{
      if(active&&native&&doc.fullscreenElement!==viewer)restore();
    });
    button.onclick=()=>active?exit():enter();
    return {enter,exit,get active(){return active;}};
  }
  root.PlanFullscreen={create};
})(globalThis);
