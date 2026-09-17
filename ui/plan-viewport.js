/* Camera for both plan styles. SVG viewBox zoom keeps drawings sharp and exports whole. */
(function(root){
  function zoomAt(view,factor,point){
    const scale=Math.max(1,Math.min(10,view.scale*factor));
    const ratio=view.scale/scale;
    return {x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio,scale};
  }
  function create(svg,controls){
    let view={x:0,y:0,scale:1},scene=null,panMode=false,gesture=null,moved=false;
    const touches=new Map();
    const point=ev=>{
      const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const center=()=>({x:view.x+340/view.scale,y:view.y+260/view.scale});
    function apply(){
      svg.setAttribute('viewBox',`${view.x} ${view.y} ${680/view.scale} ${520/view.scale}`);
      svg.setAttribute('data-pan-mode',String(panMode));
      controls.querySelector('[data-plan-scale]').textContent=Math.round(view.scale*100)+'%';
      controls.querySelector('[data-plan-zoom="out"]').disabled=view.scale<=1;
      controls.querySelector('[data-plan-zoom="in"]').disabled=view.scale>=10;
      controls.querySelector('[data-plan-pan]').setAttribute('aria-pressed',String(panMode));
      svg.style.cursor=gesture?'grabbing':panMode?'grab':'default';
      svg.style.touchAction='none';
    }
    const fit=()=>{view={x:0,y:0,scale:1};apply();};
    const zoom=(factor,p=center())=>{view=zoomAt(view,factor,p);apply();};
    svg.addEventListener('wheel',ev=>{
      const delta=ev.deltaY*(ev.deltaMode===1?16:ev.deltaMode===2?520:1);
      ev.preventDefault();zoom(Math.exp(-Math.max(-160,Math.min(160,delta))*.004),point(ev));
    },{passive:false});
    controls.querySelector('[data-plan-zoom="in"]').onclick=()=>zoom(1.35);
    controls.querySelector('[data-plan-zoom="out"]').onclick=()=>zoom(1/1.35);
    controls.querySelector('[data-plan-fit]').onclick=fit;
    controls.querySelector('[data-plan-pan]').onclick=()=>{panMode=!panMode;apply();};
    svg.addEventListener('keydown',ev=>{
      if(['+','=','-','0','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){
        ev.preventDefault();
        if(ev.key==='0'||ev.key==='Home')fit();
        else if(ev.key==='+'||ev.key==='=')zoom(1.35);
        else if(ev.key==='-')zoom(1/1.35);
        else{const step=30/view.scale;view.x+=ev.key==='ArrowRight'?step:ev.key==='ArrowLeft'?-step:0;view.y+=ev.key==='ArrowDown'?step:ev.key==='ArrowUp'?-step:0;apply();}
      }
    });
    svg.addEventListener('pointerdown',ev=>{
      if(ev.button!==0&&ev.button!==1)return;
      if(!touches.size)moved=false;
      const isTouch=ev.pointerType==='touch';
      // Cabinets keep their normal selection/edit gestures unless Pan is explicitly on.
      if(!isTouch&&!panMode&&ev.button!==1&&ev.target.closest('.mod'))return;
      ev.preventDefault();svg.focus({preventScroll:true});svg.setPointerCapture(ev.pointerId);
      touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      const ps=[...touches.values()];
      if(ps.length===2){
        const midpoint={clientX:(ps[0].x+ps[1].x)/2,clientY:(ps[0].y+ps[1].y)/2};
        gesture={type:'pinch',distance:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),anchor:point(midpoint),view:{...view}};
      }else gesture={type:'pan',anchor:point(ev),sx:ev.clientX,sy:ev.clientY,target:ev.target};
      moved=false;apply();
    });
    svg.addEventListener('pointermove',ev=>{
      if(!touches.has(ev.pointerId)||!gesture)return;
      touches.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
      if(gesture.type==='pinch'&&touches.size===2){
        const ps=[...touches.values()],distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
        view=zoomAt(gesture.view,distance/Math.max(1,gesture.distance),gesture.anchor);apply();
        const midpoint=point({clientX:(ps[0].x+ps[1].x)/2,clientY:(ps[0].y+ps[1].y)/2});
        view.x+=gesture.anchor.x-midpoint.x;view.y+=gesture.anchor.y-midpoint.y;moved=true;
      }else{
        if(Math.hypot(ev.clientX-gesture.sx,ev.clientY-gesture.sy)>4)moved=true;
        if(!moved)return;
        const p=point(ev);view.x+=gesture.anchor.x-p.x;view.y+=gesture.anchor.y-p.y;
      }
      apply();
    });
    const end=ev=>{
      if(!touches.has(ev.pointerId))return;
      const tapped=ev.type==='pointerup'&&!moved&&!panMode&&gesture?.type==='pan'&&ev.pointerType==='touch';
      const target=gesture?.target;touches.delete(ev.pointerId);
      if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
      gesture=null;apply();
      if(tapped){target?.closest('.mod')?.onclick?.(ev);moved=true;}
    };
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    svg.addEventListener('click',ev=>{if(moved){ev.preventDefault();ev.stopImmediatePropagation();moved=false;}},true);
    apply();
    return {sync(key){if(scene!==key){scene=key;fit();}else apply();},fit,zoom,get view(){return {...view};}};
  }
  root.PlanViewport={create,zoomAt};
})(globalThis);
