import React from 'react';
import {createRoot,Root} from 'react-dom/client';
import {Leva,folder,useControls,button} from 'leva';
import {ProjectionType} from '../engine/src/mapviewer/Camera';
let root:Root|undefined;
export function mountSettings(viewer:any){
 const host=document.getElementById('settings-panel')!;root?.unmount();root=createRoot(host);
 function Settings(){
  const camera=viewer.camera,renderer=viewer.renderer,route=viewer.replayRoute;
  const [revision,setRevision]=React.useState(0);
  React.useEffect(()=>{const update=()=>setRevision(v=>v+1);window.addEventListener('replay-route-change',update);return()=>window.removeEventListener('replay-route-change',update);},[]);
  const change=(id:string,value:any)=>{const input:any=document.getElementById(id);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.dispatchEvent(new Event(id==='distance'?'input':'change'));};
  const native=renderer.getControls(),visual:any={};
  for(const key of ['Sky','Fog Depth','Brightness','Color Banding','Texture Filtering','Cull Back-faces','Anti-Aliasing']){
   if(native[key])visual[key]=native[key];
  }
  // Preserve current replay defaults when mounting; native controls otherwise reset them.
  visual.Brightness={value:(1-renderer.brightness)*10,min:0,max:4,step:0.1,onChange:(v:number)=>renderer.brightness=1-v*0.1};
  visual['Color Banding']={value:(255-renderer.colorBanding)/2,min:0,max:100,step:1,onChange:(v:number)=>renderer.colorBanding=255-v*2};
  const [,setControls]=useControls(()=>({
   Camera:folder({
    Projection:{value:camera.projectionType,options:{Perspective:ProjectionType.PERSPECTIVE,Orthographic:ProjectionType.ORTHO},onChange:(v:any)=>camera.setProjectionType(v)},
    FOV:{value:camera.fov,min:30,max:140,step:1,onChange:(v:number)=>camera.fov=v},
    'Ortho Zoom':{value:camera.orthoZoom,min:1,max:60,step:0.5,onChange:(v:number)=>camera.orthoZoom=v},
    Speed:{value:viewer.cameraSpeed,min:0.1,max:5,step:0.1,onChange:(v:number)=>viewer.cameraSpeed=v},
   },{collapsed:false}),
   Distance:folder({Render:{value:viewer.renderDistance,min:16,max:2000,step:16,onChange:(v:number)=>change('distance',v)},Unload:{value:viewer.unloadDistance,min:1,max:30,step:1,onChange:(v:number)=>viewer.unloadDistance=v},LOD:{value:viewer.lodDistance,min:0,max:30,step:1,onChange:(v:number)=>viewer.lodDistance=v}},{collapsed:true}),
   Render:folder({'FPS limit':{value:Number((document.getElementById('fps-limit') as HTMLSelectElement).value),options:{'30':30,'60':60,'90':90,'120':120,Unlimited:0},onChange:(v:number)=>change('fps-limit',v)},...visual},{collapsed:true}),
   Record:folder({
    'Add point (F3)':button(()=>route?.add()),
    'Delete last point (F4)':button(()=>route?.remove()),
    'Use point times':{value:false,onChange:(v:boolean,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.usePointTimes=v;}},
    Points:{type:'NUMBER',value:route?.points.length||0,disabled:true},
    'Start time':{type:'STRING',value:route?.start||'0:00',onChange:(v:string,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.start=v;}},
    'End time':{type:'STRING',value:route?.end||'0:10',onChange:(v:string,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.end=v;}},
    'Use current time as start':button(()=>viewer.replayRouteSetTime?.('start')),
    'Use current time as end':button(()=>viewer.replayRouteSetTime?.('end')),
    Timing:folder({
     'Pause at':{type:'STRING',value:route?.pauseAt||'0:00',onChange:(v:string,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.pauseAt=v;}},
     'Pause for (seconds)':{value:0,min:0,max:120,step:0.1,onChange:(v:number,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.pauseSeconds=v;}},
     'Slowdown at':{type:'STRING',value:route?.slowAt||'0:00',onChange:(v:string,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.slowAt=v;}},
     'Slowdown for (seconds)':{value:0,min:0,max:120,step:0.1,onChange:(v:number,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.slowSeconds=v;}},
     'Slowdown (%)':{value:50,min:0,max:99,step:1,onChange:(v:number,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.slowdown=v;}},
     'Keep camera moving':{value:true,onChange:(v:boolean,_p:any,c:any)=>{if(route&&!c.initial&&!route.active&&!route.preparing)route.keepCameraMoving=v;}},
    },{collapsed:true}),
    'Start / stop (F2)':button(()=>viewer.replayRouteToggle?.()),
    Status:{type:'STRING',value:route?.preparing?'Preparing':route?.active?'Playing camera route':'Stopped',disabled:true},
   },{collapsed:true}),
   Replay:folder({'Hide stacked players':{value:(document.getElementById('hide-stacked-players') as HTMLInputElement).checked,onChange:(v:boolean,_path:any,context:any)=>{if(!context.initial)change('hide-stacked-players',v);}}},{collapsed:true}),
  }),[]);
  React.useEffect(()=>{setControls({'Use point times':route?.usePointTimes??false,Points:route?.points.length||0,'Start time':route?.start||'0:00','End time':route?.end||'0:10','Pause at':route?.pauseAt||'0:00','Pause for (seconds)':route?.pauseSeconds||0,'Slowdown at':route?.slowAt||'0:00','Slowdown for (seconds)':route?.slowSeconds||0,'Slowdown (%)':route?.slowdown??50,'Keep camera moving':route?.keepCameraMoving??true,Status:route?.preparing?'Preparing':route?.active?'Playing camera route':'Stopped'});},[revision]);
  return React.createElement(React.Fragment,null,React.createElement(PointTimes,{key:route?.points.length||0,route}),React.createElement(Leva,{fill:true,titleBar:{title:'Settings',filter:false},hideCopyButton:true}));
 }
 root.render(React.createElement(Settings));
}

function PointTimes({route}:{route:any}){
 useControls('Camera points',()=>Object.fromEntries((route?.points||[]).map((point:any,index:number)=>[`Point ${index+1} time`,{type:'STRING',value:point.time||'0:00',onChange:(v:string,_p:any,c:any)=>{if(!c.initial&&!route.active&&!route.preparing)point.time=v;}}])),{collapsed:false},[route?.points.length]);
 return null;
}
