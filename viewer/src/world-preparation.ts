export function worldRegions(x:number,y:number,distance:number){
 const radius=distance+32,result:{x:number,y:number}[]=[];
 for(let mx=Math.floor((x-radius)/64);mx<=Math.floor((x+radius)/64);mx++)for(let my=Math.floor((y-radius)/64);my<=Math.floor((y+radius)/64);my++)if(mx>=0&&my>=0&&mx<100&&my<200)result.push({x:mx,y:my});
 return result.sort((a,b)=>Math.hypot(a.x*64+32-x,a.y*64+32-y)-Math.hypot(b.x*64+32-x,b.y*64+32-y));
}
export async function prepareWorld(viewer:any,signal:AbortSignal,progress:(done:number,total:number)=>void){
 const renderer=viewer.renderer,manager=renderer.mapManager;if(renderer.replayInstance){progress(1,1);return;}
 const regions=worldRegions(viewer.camera.pos[0],viewer.camera.pos[2],viewer.renderDistance);
 for(let i=0;i<regions.length;i++){
  if(signal.aborted)throw Error('World preparation cancelled');const {x,y}=regions[i],id=(x<<8)|y;
  if(!manager.getMap(x,y)&&!manager.invalidMapIds.has(id)){
   manager.loadingMapIds.add(id);await renderer.queueLoadMap(x,y);
   const started=performance.now();
   while(!manager.getMap(x,y)&&!manager.invalidMapIds.has(id)){
    if(signal.aborted)throw Error('World preparation cancelled');if(performance.now()-started>30000)throw Error('World region did not finish preparing');
    await new Promise(resolve=>requestAnimationFrame(resolve));
   }
  }
  progress(i+1,regions.length);
 }
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
}
