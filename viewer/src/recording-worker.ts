import {MeshResourceCache} from './mesh-resource-cache';
import {Recording} from './recording';
let recording:Recording;let windowGeneration=0;
self.onmessage=async({data})=>{
 try{
  if(data.method==='index'){
   recording=new Recording(data.file);recording.meshCache=new MeshResourceCache(128*1024*1024);let last=0;
   await recording.index(n=>{const now=performance.now();if(now-last>100){postMessage({progress:n});last=now;}});
   const {frames,scenes,states,objects,meshes,templates,icons,duration,header,views,complete,skipped,errors,eventDrops,ticks,hitEvents,missingAssets,effectStarts}=recording;
   postMessage({id:data.id,value:{frames,scenes,states,objects,meshCount:meshes.size,templateCount:templates.size,icons,duration,header,views,complete,skipped,errors,eventDrops,ticks,hitEvents,missingAssets,effectStarts}});
  }else if(data.method==='prepare-window'){
   const source=recording,generation=++windowGeneration,ids=new Set<string>();for(const ref of source.frames){if(generation!==windowGeneration)break;if(ref.ms<data.start)continue;if(ref.ms>data.end)break;const frame=await source.frame(ref,false);for(const actor of frame.actors||[])if(actor.mesh)ids.add(actor.mesh);}
   const ordered=[...ids];for(let i=0;i<ordered.length&&generation===windowGeneration;i+=32){await source.preloadMeshes(ordered.slice(i,i+32));await new Promise(resolve=>setTimeout(resolve,0));}
   postMessage({id:data.id,value:{end:data.end,meshes:ids.size,bytes:source.meshCache.bytes}});
  }else if(data.method==='meshes')postMessage({id:data.id,value:await Promise.all(data.ids.map((id:string)=>recording.mesh(id)))});
  else if(data.method==='mesh')postMessage({id:data.id,value:await recording.mesh(data.idValue)});
  else if(data.method==='scene')postMessage({id:data.id,value:await recording.scene(data.ref,data.includeGround)});
  else throw Error('Unknown recording request');
 }catch(error:any){postMessage({id:data.id,error:error.message});}
};
