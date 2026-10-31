import {EffectVisibility,visibleEffects} from './effect-visibility';
import {MeshResourceCache} from './mesh-resource-cache';
import {decodeMesh} from './mesh-codec';
import {FileBlocks} from './file-blocks';
export type Ref={start:number,end:number,ms:number,cycle:number,type:string,index?:number,baseX?:number,baseY?:number,plane?:number,worldView?:number};
export function at<T extends {ms:number}>(list:T[],ms:number):T|undefined{let l=0,r=list.length;while(l<r){const m=(l+r)>>1;if(list[m].ms<=ms)l=m+1;else r=m;}return l?list[l-1]:undefined;}
export class Recording {
 file:File;frames:Ref[]=[];scenes:Ref[]=[];states:Ref[]=[];objects:Ref[]=[];meshes=new Map<string,Ref>();icons=new Map<string,Ref>();templates=new Map<string,Ref>();templateCache=new Map<string,Promise<any>>();duration=0;header:any={};views:any[]=[];complete=false;skipped=0;errors=0;
 sceneCache=new Map<number,Promise<any>>();cache=new Map<number,Promise<any>>();meshCache=new MeshResourceCache();
 prepareWindow:((start:number,end:number)=>Promise<any>)|null=null;
 meshBatchProvider:((ids:string[])=>Promise<any[]>)|null=null;
 meshProvider:((id:string)=>Promise<any>)|null=null;dispose=()=>{};
 sceneProvider:((ref:Ref,includeGround:boolean)=>Promise<any>)|null=null;
 eventDrops=0;missingAssets=0;meshCount=0;templateCount=0;
 effectVisibility=new EffectVisibility();effectStarts=this.effectVisibility.starts;
 ticks:Ref[]=[];hitEvents=new Map<string,any[]>();
 blocks:FileBlocks;
 constructor(file:File){this.file=file;this.blocks=new FileBlocks(file);}
 async index(progress:(n:number)=>void){
  const decoder=new TextDecoder(),reader=this.file.stream().getReader(),meshRefs=new Set<string>(),templateRefs=new Set<string>();let offset=0,start=0,parts:Uint8Array[]=[],length=0;
  const consume=(bytes:Uint8Array)=>{if(!bytes.length)return;try{const row=JSON.parse(decoder.decode(bytes)),ref={start,end:start+bytes.length,ms:row.ms||0,cycle:row.cycle||0,type:row.type};this.duration=Math.max(this.duration,ref.ms);
   if(row.type==='frame3d'||row.type==='scene3d'||row.type==='object3d')for(const part of [...row.data.actors||[],...row.data.ground||[],...row.data.objects||[],...row.data.parts||[]])if(part.mesh)meshRefs.add(part.mesh);
   if(row.type==='mesh'&&row.data.template)templateRefs.add(row.data.template);
   if(row.type==='scene3d'||row.type==='object3d')Object.assign(ref,{baseX:row.data.baseX,baseY:row.data.baseY,plane:row.data.plane,worldView:row.data.worldView});
   this.effectVisibility.observe(row);
   if(row.type==='tick')this.ticks.push(ref);
   if(row.type==='hitsplat'&&row.data?.actor){const actor=row.data.actor,id=(actor.kind==='player'?'p':'n')+actor.index,list=this.hitEvents.get(id)||[];list.push({key:actor.key,name:actor.name,worldView:actor.worldView,plane:actor.world?.plane,amount:row.data.amount,type:row.data.type,startMs:ref.ms,expiresMs:ref.ms+Math.max(0,(row.data.disappearsCycle-ref.cycle)*20)});this.hitEvents.set(id,list);}
   if(row.type==='header')this.header=row.data;
   else if(row.type==='frame3d')this.frames.push(ref);else if(row.type==='scene3d')this.scenes.push(ref);else if(row.type==='player_state')this.states.push(ref);else if(row.type==='object3d')this.objects.push(ref);else if(row.type==='mesh_template')this.templates.set(row.data.id,ref);else if(row.type==='mesh')this.meshes.set(row.data.id,ref);else if(row.type==='item_icon')this.icons.set(row.data.key,ref);
   else if(row.type==='end'){this.complete=!!row.data.complete;this.eventDrops=row.data.dropped||0;}else if(row.type==='visual_summary')this.skipped=row.data.skippedFrames||0;
   if(row.data?.views)this.views.push({ms:ref.ms,views:row.data.views.map((w:any)=>({id:w.id,baseX:w.baseX,baseY:w.baseY,plane:w.plane,instance:w.instance,...(Array.isArray(w.chunks)?{chunks:w.chunks}:{})}))});
  }catch{this.errors++;}};
  while(true){const {done,value}=await reader.read();if(done)break;let chunkStart=0;for(let i=0;i<value.length;i++)if(value[i]===10){const tail=value.subarray(chunkStart,i);let line=tail;if(parts.length){line=new Uint8Array(length+tail.length);let n=0;for(const p of parts){line.set(p,n);n+=p.length;}line.set(tail,n);}consume(line);parts=[];length=0;start=offset+i+1;chunkStart=i+1;}if(chunkStart<value.length){const tail=value.slice(chunkStart);parts.push(tail);length+=tail.length;}offset+=value.length;progress(offset/this.file.size);}
  if(length){const line=new Uint8Array(length);let n=0;for(const p of parts){line.set(p,n);n+=p.length;}consume(line);}
  this.missingAssets=[...meshRefs].filter(id=>!this.meshes.has(id)).length+[...templateRefs].filter(id=>!this.templates.has(id)).length;
  this.meshCount=this.meshes.size;this.templateCount=this.templates.size;
  for(const list of [this.frames,this.scenes,this.states,this.objects,this.views,this.ticks])list.sort((a,b)=>a.ms-b.ms);this.frames.forEach((r,index)=>r.index=index);
 }
 row(ref:Ref){if(!this.cache.has(ref.start)){this.cache.set(ref.start,this.blocks.text(ref.start,ref.end).then(t=>JSON.parse(t)));while(this.cache.size>16)this.cache.delete(this.cache.keys().next().value!);}return this.cache.get(ref.start)!;}
 instanceViewAt(frame:any,ms:number){for(let i=this.views.length-1;i>=0;i--){const snapshot=this.views[i];if(snapshot.ms>ms)continue;const found=snapshot.views.find((view:any)=>view.id===frame.worldView&&view.baseX===frame.baseX&&view.baseY===frame.baseY&&view.chunks);if(found)return {...found,baselineMs:snapshot.ms};}return null;}
 async instanceObjectOverrides(frame:any,ms:number,baselineMs:number){const observed=new Map<any,any[]>();for(const ref of this.objects){if(ref.ms<baselineMs)continue;if(ref.ms>ms)break;if(['baseX','baseY','plane','worldView'].some(key=>ref[key]!==undefined&&ref[key]!==frame[key]))continue;const event=(await this.row(ref)).data;if(['baseX','baseY','plane','worldView'].some(key=>event[key]!==undefined&&event[key]!==frame[key]))continue;if(event.action==='reset')observed.clear();else if(event.action==='spawn')observed.set(event.key,event.parts||[]);
 // Keep last-known positions after despawn, so default cache objects cannot reappear there.
 }return [...observed.values()].flat();}
 sceneRefAt(frame:any,ms:number){const ref=at(this.scenes,ms);return ref&&!['baseX','baseY','plane','worldView'].some(key=>ref[key]!==undefined&&ref[key]!==frame[key])?ref:undefined;}
 mesh(id:string){if(!id||(!this.meshProvider&&!this.meshes.has(id)))return Promise.resolve(null);const cached=this.meshCache.get(id);if(cached)return cached;const pending=this.meshProvider?this.meshProvider(id):this.row(this.meshes.get(id)!).then(async r=>{const data=r.data,pose=decodeMesh(data);if(!data.template)return {...pose,_template:id,_legacyPose:!!data.geometry};if(!this.templateCache.has(data.template)){const ref=this.templates.get(data.template);if(!ref)throw Error("Missing mesh template");this.templateCache.set(data.template,this.row(ref).then(r=>decodeMesh(r.data)));while(this.templateCache.size>128)this.templateCache.delete(this.templateCache.keys().next().value!);}return {...await this.templateCache.get(data.template),...pose,_template:data.template};});this.meshCache.set(id,pending);return pending;}
 async preloadMeshes(ids:string[]){const missing=[...new Set(ids.filter(id=>id&&(this.meshBatchProvider||this.meshes.has(id))))].filter(id=>!this.meshCache.has(id));if(!missing.length)return;
 if(!this.meshBatchProvider){await Promise.all(missing.map(id=>this.mesh(id)));return;}
 const batch=this.meshBatchProvider(missing);for(let i=0;i<missing.length;i++)this.meshCache.set(missing[i],batch.then(meshes=>meshes[i]));await batch;
 }
 scene(ref:Ref,includeGround=true){const key=ref.start*2+(includeGround?1:0);if(!this.sceneCache.has(key)){this.sceneCache.set(key,this.sceneProvider?this.sceneProvider(ref,includeGround):this.row(ref).then(async row=>({...row.data,objects:(row.data.objects||[]).map((part:any)=>part.meshData?{...part,meshData:decodeMesh({geometry:part.meshData})}:part),groundIds:(row.data.ground||[]).map((g:any)=>g.mesh||null),ground:includeGround?await Promise.all((row.data.ground||[]).map(async(g:any)=>g.mesh?await this.mesh(g.mesh):decodeMesh({geometry:g}))):[]})));while(this.sceneCache.size>2)this.sceneCache.delete(this.sceneCache.keys().next().value!);}return this.sceneCache.get(key)!;}
 async frame(ref:Ref,includeOverheads=true){const data=visibleEffects((await this.row(ref)).data,ref.cycle,this.effectStarts);if(data.instanced===undefined){const view=at(this.views,ref.ms)?.views.find((v:any)=>v.id===data.worldView&&v.baseX===data.baseX&&v.baseY===data.baseY);data.instanced=view?.instance;}return includeOverheads?this.legacyOverheads(data,ref.ms):data;}
 async objectParts(scene:any,ref:Ref|undefined,frame:any,ms:number){
  const parts=new Map<any,any[]>();let legacy=0;for(const part of scene?.objects||[]){const key=part.key??'legacy-'+legacy++;if(!parts.has(key))parts.set(key,[]);parts.get(key)!.push(part);}
  const start=scene?.startedMs??ref?.ms??0;
  for(const eventRef of this.objects){if(eventRef.ms<start)continue;if(eventRef.ms>ms)break;const event=(await this.row(eventRef)).data;
   if(['baseX','baseY','plane','worldView'].some(k=>event[k]!==undefined&&event[k]!==frame[k]))continue;
   if(event.action==='reset')parts.clear();else if(event.action==='despawn')parts.delete(event.key);else if(event.action==='spawn')parts.set(event.key,event.parts||[]);
  }
  return [...parts.values()].flat();
 }
 async legacyOverheads(frame:any,ms:number){
  if(!frame.actors?.some((a:any)=>/^[pn]\d+$/.test(a.id)&&(a.hitsplats===undefined||a.healthScale===undefined)))return frame;
  const tick=at(this.ticks,ms);if(!tick)return frame;
  const snapshot=(await this.row(tick)).data,observed=new Map((snapshot.actors||[]).map((a:any)=>[(a.kind==='player'?'p':'n')+a.index,a]));
  return {...frame,actors:await Promise.all(frame.actors.map(async(actor:any)=>{
   if(!/^[pn]\d+$/.test(actor.id))return actor;const state:any=observed.get(actor.id);
   if(!state||state.name!==actor.name||state.worldView!==frame.worldView||state.world?.plane!==frame.plane)return actor;
   const hits=(this.hitEvents.get(actor.id)||[]).filter(h=>h.key===state.key&&h.worldView===frame.worldView&&h.plane===frame.plane&&h.startMs<=ms+100&&h.expiresMs>ms).map(h=>({amount:h.amount,type:h.type,startMs:h.startMs,expiresMs:h.expiresMs}));
   const geometry=actor.logicalHeight===undefined?await this.mesh(actor.mesh):null;
   const modelHeight=geometry?.y?.reduce((height:number,y:number)=>Math.max(height,-y),0);
   return {...actor,logicalHeight:actor.logicalHeight??modelHeight,healthRatio:actor.healthRatio??state.healthRatio,healthScale:actor.healthScale??state.healthScale,hitsplats:actor.hitsplats??hits};
  }))};
 }
}







