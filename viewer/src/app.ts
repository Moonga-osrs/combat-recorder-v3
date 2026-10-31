import {CameraRoute,parseReplayTime} from './camera-route';
import {mountSettings} from '/settings-panel.js';
import {collapsePlayerStacks} from './player-stacks';
import {TilePings} from './tile-pings';
import {PreparedFrameCache} from './prepared-frame-cache';
import {installReplayCamera} from './replay-camera';
import {FrameTimings} from './frame-timings';
import {StaticWorldCache} from './static-world-cache';
import {prepareWorld} from './world-preparation';
import {openRecording} from './open-recording';
import {compatibleFrames,compatibleActors,compatiblePoseGeometry} from './interpolation';
import {PlaybackClock} from './playback-clock';
import {sceneSignature} from './scene-signature';
import {MapViewer} from '../engine/src/mapviewer/MapViewer';
import {CacheFiles} from '../engine/src/rs/cache/CacheFiles';
import {ReplayWorkerPool} from './worker-pool';
import {Recording,at,Ref} from './recording';
import {RecordedLayer,initReplayPrograms} from './recorded-layer';
import {OverheadLayer} from './overheads';
import {PlayerStateUI} from './state-ui';
const $=(id:string)=>document.getElementById(id)!;
let hideStackedPlayers=false,renderSettingsVersion=0,settingsUpdating=false;const playerStackSeed=(Math.random()*0xffffffff)>>>0;
const terrainVisibility=new Map<string,boolean>();
const frameTimings=new FrameTimings();const preparedFrameCache=new PreparedFrameCache();
let activeRecoveryGround:any[]=[];
const worldStats={mapRequests:0,restoredGroundFaces:0,restoredObjects:0};const playbackClock=new PlaybackClock();const routeClock=new PlaybackClock();const staticWorldCache=new StaticWorldCache();
const playbackStats={geometryBlends:0,legacyGeometryBlends:0,draws:0,poses:0,prepareMs:0,decodeMs:0,workerMs:0,uploadMs:0,lastPoseMs:0,interpolatedDraws:0,heldDraws:0};
let tilePings:TilePings;let replayCamera:any;let recordingGeneration=0;
let viewer:any,loading=false,loadingPromise:Promise<void>|null=null,replayPool:ReplayWorkerPool,layer:RecordedLayer,staticLayer:RecordedLayer,overheads:OverheadLayer,stateUI:PlayerStateUI,stateShown:Ref|undefined,staticTag='',staticSignature='',recording:Recording|null=null,position=0,playing=false,currentFrame:any=null,currentRef:Ref|undefined,sequence=0,coverageKey='',updating=false;
function status(text:string){$('status').textContent=text;}
function showDiagnostics(source:Recording){
 let panel=document.getElementById('capture-status');if(!panel){panel=document.createElement('p');panel.id='capture-status';$('info').after(panel);}
 const elapsed=(source.frames.at(-1)?.ms||0)-(source.frames[0]?.ms||0),rate=elapsed>0?((source.frames.length-1)*1000/elapsed).toFixed(1):'0';
 panel.textContent=`${source.complete?'Complete recording':'Incomplete recording'}  |  ${source.frames.length.toLocaleString('en-US')} samples  |  ${rate} samples/s  |  ${(source.file.size/1e6).toFixed(1)} MB\n${source.skipped} skipped 3D samples  |  ${source.eventDrops} dropped events  |  ${source.errors} unreadable rows  |  ${source.missingAssets} missing geometry assets`;
 panel.style.whiteSpace='pre-line';panel.style.fontSize='12px';panel.style.color=!source.complete||source.skipped||source.eventDrops||source.errors||source.missingAssets?'#e9b356':'#aeb5bd';
}
const preparedFrames=new Map<number,Promise<any>>();
let decodedWindowEnd=0,decodedWindowJob:Promise<any>|null=null;
const readyFrames=new Map<number,Ref>();let aheadJob:Promise<any>|null=null,bufferEpoch=0;
function resetPoseBuffer(){bufferEpoch++;decodedWindowEnd=0;decodedWindowJob=null;preparedFrames.clear();readyFrames.clear();aheadJob=null;}
function presentationRef(source:Recording,ms:number){let best:Ref|undefined=preparedFrameCache.latest(ms,ms-300)||undefined;for(const ref of readyFrames.values())if(ref.ms<=ms&&ms-ref.ms<=300&&(!best||ref.ms>best.ms))best=ref;return best&&best.ms>(currentRef?.ms??-1)?best:at(source.frames,ms);}
// One predicted pose in flight. Presentation waits for it rather than queuing competing demand work.
function prepareDecodedWindow(source:Recording){
 if(!source.prepareWindow||decodedWindowJob||decodedWindowEnd>=Math.min(source.duration,position+1000))return decodedWindowJob;
 const epoch=bufferEpoch,end=Math.min(source.duration,position+2000),job=source.prepareWindow(position,end);decodedWindowJob=job;
 job.then(()=>{if(epoch===bufferEpoch)decodedWindowEnd=end;}).catch(error=>{if(epoch===bufferEpoch)console.warn('Model buffer unavailable:',error.message);}).finally(()=>{if(epoch===bufferEpoch&&decodedWindowJob===job)decodedWindowJob=null;});return job;
}
function prepareAhead(source:Recording,_ref?:Ref){
 if(!playing||aheadJob||updating||settingsUpdating)return;void prepareDecodedWindow(source);const epoch=bufferEpoch;
 const job=(async()=>{while(playing&&recording===source&&epoch===bufferEpoch){
  preparedFrameCache.pruneBefore(position-100);const current=at(source.frames,position+Math.max(20,Math.min(80,playbackStats.prepareMs)));if(!current)return;let index=current.index??0;
  while(index<source.frames.length&&preparedFrameCache.has(source.frames[index].start))index++;
  const next=source.frames[index];if(!next||next.ms>position+500||preparedFrameCache.bytes>preparedFrameCache.budget*0.85)return;
  await prepareFrame(source,next);if(!preparedFrameCache.has(next.start))return;
 }})();aheadJob=job;job.catch(error=>{if(epoch===bufferEpoch)console.warn('Replay preparation paused:',error.message);}).finally(()=>{if(epoch===bufferEpoch&&aheadJob===job)aheadJob=null;});
}
async function warmPreparedFrames(source:Recording,signal:AbortSignal){
 const epoch=bufferEpoch;status('Preparing 3D replay buffer...');await prepareDecodedWindow(source);if(signal.aborted||epoch!==bufferEpoch||source!==recording)return;const first=at(source.frames,position);if(!first)return;
 for(let index=first.index??0;index<source.frames.length;index++){
  const ref=source.frames[index];if(ref.ms>position+200||preparedFrameCache.bytes>preparedFrameCache.budget*0.75)break;
  if(signal.aborted||epoch!==bufferEpoch||source!==recording)return;await prepareFrame(source,ref);status('Preparing 3D replay buffer...');
 }
}
let loadController:AbortController|null=null;let nextDisplayFrame:any=null;let displayFrame:any=null;const displayNextActors=new Map<any,any>();let localActor:any=null;const followPosition:any={};let cameraRoute:CameraRoute|null=null;let orbitTile:any=null;let orbitHeightOffset=0;
function nextFrameRef(source:Recording,ref:Ref){let index=(ref.index??0)+1;while(index<source.frames.length-1&&source.frames[index].ms<ref.ms+80)index++;return source.frames[index];}
function prepareFrame(source:Recording,ref:Ref){
 const cached=preparedFrameCache.get(ref.start);if(cached)return Promise.resolve(cached);
 let prepared=preparedFrames.get(ref.start);if(prepared)return prepared;
 const epoch=bufferEpoch,namespace=recordingGeneration,settingsVersion=renderSettingsVersion,collapse=hideStackedPlayers;prepared=(async()=>{const started=performance.now();
  const frame=collapsePlayerStacks(await source.frame(ref),collapse,playerStackSeed),nextRef=nextFrameRef(source,ref),nextFrame=nextRef?collapsePlayerStacks(await source.frame(nextRef),collapse,playerStackSeed):null;
  await source.preloadMeshes([...frame.actors,...nextFrame?.actors||[]].map((actor:any)=>actor.mesh));
  const parts=await Promise.all(frame.actors.map(async(a:any)=>({geometry:await source.mesh(a.mesh),transform:a,cacheKey:a.mesh})));
  const nextActors=new Map((nextFrame?.actors||[]).filter((a:any)=>a.id!==undefined).map((a:any)=>[a.id,a]));
  const nextParts=await Promise.all(parts.map(async(part:any)=>{
   const next:any=nextActors.get(part.transform.id);
   if(!compatibleFrames(frame,nextFrame,ref.ms,nextRef?.ms??ref.ms)||!compatibleActors(part.transform,next))return part;
   const geometry=await source.mesh(next.mesh),blendGeometry=compatiblePoseGeometry(part.geometry,geometry);if(blendGeometry){playbackStats.geometryBlends++;if(part.geometry?._legacyPose&&geometry?._template!==part.geometry?._template)playbackStats.legacyGeometryBlends++;}return geometry?{geometry:blendGeometry?geometry:part.geometry,transform:next}:part;
  }));
  const decoded=performance.now();await replayPool.ready;
  const packed=await replayPool.request('replay',{baseX:frame.baseX,baseY:frame.baseY,plane:frame.plane,parts,nextParts,namespace,loadedTextureIds:viewer.renderer.loadedTextureIds});
  if(epoch===bufferEpoch&&settingsVersion===renderSettingsVersion&&recording===source)readyFrames.set(ref.start,ref);
  const result={frame,nextFrame,nextRef,packed,prepareMs:performance.now()-started,decodeMs:decoded-started,workerMs:performance.now()-decoded};if(recording===source&&namespace===recordingGeneration&&settingsVersion===renderSettingsVersion)preparedFrameCache.set(ref,result);return result;
 })();preparedFrames.set(ref.start,prepared);
 while(preparedFrames.size>4){const oldest=preparedFrames.keys().next().value!;preparedFrames.delete(oldest);readyFrames.delete(oldest);}
 prepared.catch(()=>{if(preparedFrames.get(ref.start)===prepared)preparedFrames.delete(ref.start);});return prepared;
}
async function prepareStaticWorld(source:Recording,frame:any,ms:number,sceneRef:Ref|undefined,scene:any){
 const allObjects=await source.objectParts(scene,sceneRef,frame,ms),objects=allObjects.filter((part:any)=>!part.animated);let signature=sceneSignature(frame,scene,sceneRef?.start,objects,!!scene?.groundIds?.length),terrain:any=null,recovery:any=null;
 const instance=frame.instanced&&frame.plane>0&&!scene?.capturedPlanes?source.instanceViewAt(frame,ms):null,visibilityKey=[frame.baseX,frame.baseY,frame.plane,frame.worldView,...scene?.groundIds||[],scene?.groundIds?.some((id:any)=>!id)?sceneRef?.start:''].join('|');
 if(instance&&sceneRef&&!terrainVisibility.has(visibilityKey)){terrain=await source.scene(sceneRef,true);terrainVisibility.set(visibilityKey,(terrain.ground||[]).some((ground:any)=>ground.ca?.some((colour:number)=>colour>=0&&colour!==12345678)));}
 const restore=instance&&terrainVisibility.get(visibilityKey)===false;
 const overrides=restore?allObjects.concat(await source.instanceObjectOverrides(frame,ms,instance.baselineMs)):allObjects;
 if(restore)signature+='|lower-floor-v1|'+overrides.map((part:any)=>[part.id,part.x,part.z,part.height].join(',')).join('|');
 const cached=staticWorldCache.get(signature);if(cached)return cached;
 const parts=await Promise.all(objects.map(async(part:any)=>({geometry:part.meshData||await source.mesh(part.mesh),transform:part})));
 if(sceneRef&&scene?.groundIds?.length){terrain??=await source.scene(sceneRef,true);for(const ground of terrain.ground||[])parts.push({geometry:{...ground,terrainUv:true},transform:{x:0,z:0,height:0}});}
 if(restore){recovery=await (window as any).replay.pool.request('instance-parts',{chunks:instance.chunks,baseX:frame.baseX,baseY:frame.baseY,plane:frame.plane,exclude:overrides.map((part:any)=>({id:part.id,x:part.x,z:part.z,height:part.height}))});parts.push(...recovery.parts);}
 await replayPool.ready;const packet:any=await replayPool.request('replay',{namespace:recordingGeneration,baseX:frame.baseX,baseY:frame.baseY,plane:frame.plane,parts,loadedTextureIds:viewer.renderer.loadedTextureIds});packet.signature=signature;if(recovery){packet.recoveryGround=recovery.parts.filter((part:any)=>part.geometry.terrainUv).map((part:any)=>part.geometry);packet.recovery={groundFaces:recovery.groundFaces,objects:recovery.objects,regions:recovery.regions};}
 if(recording===source)staticWorldCache.set(signature,packet);return packet;
}
async function warmStaticWorlds(source:Recording,signal:AbortSignal){
 const times=[...new Set([...source.scenes.map(ref=>ref.ms),...source.objects.map(ref=>ref.ms)])].filter(ms=>ms>=position&&ms<=position+2000).sort((a,b)=>a-b);
 for(let i=0;i<times.length;i++){
  if(signal.aborted)throw Error('World preparation cancelled');const ms=times[i],ref=at(source.frames,ms);if(!ref)continue;
  const frame=await source.frame(ref,false),sceneRef=source.sceneRefAt(frame,ms),scene=sceneRef?await source.scene(sceneRef,false):null;
  await prepareStaticWorld(source,frame,ms,sceneRef,scene);if(signal.aborted)throw Error('World preparation cancelled');
  status('Preparing recorded world states '+(i+1)+' / '+times.length+'...');
 }
}
function loadWorld(){if(viewer)return Promise.resolve();if(!loadingPromise)loadingPromise=startWorld().finally(()=>loadingPromise=null);return loadingPromise;}
async function startWorld(){
 if(loading||viewer)return;loading=true;
 try{
  status('Loading the public world cache locally...');
  const [metadata,names]=await Promise.all([fetch('/cache/metadata.json').then(r=>r.json()),fetch('/cache/list.json').then(r=>r.json())]);
  const files=new Map<string,ArrayBuffer>();let done=0;
  await Promise.all(names.map(async(name:string)=>{const response=await fetch('/cache/'+name);if(!response.ok)throw Error('Cache file unavailable: '+name);const buffer=await response.arrayBuffer();const shared=new SharedArrayBuffer(buffer.byteLength);new Uint8Array(shared).set(new Uint8Array(buffer));files.set(name,shared as any);status('Loading cache files '+(++done)+' / '+names.length);}));
  const info={...metadata,name:'osrs-'+metadata.revision,game:'oldschool',environment:'live',timestamp:metadata.timestamp||'',size:0};
  const cache={info,type:'dat2',files:new CacheFiles(files),xteas:new Map()};
  const pool=new ReplayWorkerPool();
  replayPool=new ReplayWorkerPool();replayPool.initCache(cache,[],[]);
  viewer=new MapViewer(pool as any,{latest:info,caches:[info]},[],[],await caches.open('moonga-replay-map-images'),'webgl',cache as any);
  viewer.renderer.brightness=0.8;viewer.renderDistance=128;viewer.unloadDistance=2;viewer.renderer.maxLevel=0;viewer.renderer.loadNpcs=false;viewer.renderer.loadObjs=false;viewer.tooltips=false;
  $('viewport').append(viewer.renderer.canvas);await viewer.renderer.init();replayCamera=installReplayCamera(viewer,()=>!!currentFrame&&(!!cameraRoute?.active||($('camera') as HTMLSelectElement).value!=='free'),followCamera,delta=>{if(!cameraRoute?.active&&($('camera') as HTMLSelectElement).value==='tile'&&orbitTile)orbitHeightOffset+=delta;});await viewer.renderer.shadersPromise;viewer.renderer.clearMaps();viewer.renderer.initCache();viewer.renderer.fpsLimit=+($('fps-limit') as HTMLSelectElement).value;viewer.renderer.start();cameraRoute=new CameraRoute(viewer,()=>window.dispatchEvent(new Event('replay-route-change')),()=>position);viewer.replayRoute=cameraRoute;viewer.replayRouteToggle=toggleCameraRoute;viewer.replayRouteSetTime=(key:'start'|'end')=>{if(!cameraRoute||cameraRoute.active||cameraRoute.preparing)return;cameraRoute[key]=`${Math.floor(position/60000)}:${(position/1000%60).toFixed(2).padStart(5,'0')}`;window.dispatchEvent(new Event('replay-route-change'));};mountSettings(viewer);
  const timedMaps=new WeakSet<object>();
  const baseOpaque=viewer.renderer.renderOpaquePass.bind(viewer.renderer),baseAlpha=viewer.renderer.renderTransparentPass.bind(viewer.renderer);
  viewer.renderer.renderOpaquePass=()=>{if(currentRef){viewer.renderer.sceneUniformBuffer.set(7,((currentRef.cycle||0)*20+position-currentRef.ms)/1000).update();for(const map of viewer.renderer.mapManager.mapSquares.values())if(!timedMaps.has(map)){timedMaps.add(map);for(const name of ["drawCall","drawCallAlpha","drawCallLod","drawCallLodAlpha","drawCallInteract","drawCallInteractAlpha","drawCallInteractLod","drawCallInteractLodAlpha"])map[name]?.drawCall?.uniform("u_timeLoaded",-1000000);}}if(!viewer.renderer.replayInstance)baseOpaque();};viewer.renderer.renderTransparentPass=()=>{if(!viewer.renderer.replayInstance)baseAlpha();};
  const mapJobs=new Map<string,Promise<void>>(),renderer=viewer.renderer;
  renderer.queueLoadMap=(x:number,y:number)=>{
   const epoch=coverageKey,key=epoch+'|'+x+','+y;if(renderer.replayInstance){renderer.mapManager.addInvalidMap(x,y);return Promise.resolve();}
   if(mapJobs.has(key))return mapJobs.get(key);worldStats.mapRequests++;
   const task=(async()=>{await pool.ready;const data:any=await pool.queueLoad(renderer.dataLoader,{mapX:x,mapY:y,maxLevel:renderer.maxLevel,loadObjs:renderer.loadObjs,loadNpcs:renderer.loadNpcs,smoothTerrain:renderer.smoothTerrain,minimizeDrawCalls:!renderer.hasMultiDraw,loadedTextureIds:renderer.loadedTextureIds});if(epoch!==coverageKey)return;if(data&&renderer.isValidMapData(data))renderer.mapsToLoad.push(data);else renderer.mapManager.addInvalidMap(x,y);})().finally(()=>mapJobs.delete(key));
   mapJobs.set(key,task);return task;
  };
  renderer.mapManager.loadMapFunction=(x:number,y:number)=>{const epoch=coverageKey;void renderer.queueLoadMap(x,y).catch(error=>{if(epoch!==coverageKey)return;renderer.mapManager.addInvalidMap(x,y);console.warn('World region unavailable',error.message);});};
  await initReplayPrograms(viewer.renderer);staticLayer=new RecordedLayer(viewer.renderer);layer=new RecordedLayer(viewer.renderer);
  overheads=new OverheadLayer(viewer,pool);tilePings=new TilePings(viewer,overheads,()=>({source:recording,frame:currentFrame,position,extraGround:activeRecoveryGround,context:recordingGeneration+'|'+coverageKey}),tile=>{if(($('camera') as HTMLSelectElement).value!=='tile')return;orbitTile=tile;orbitHeightOffset=0;followCamera();status(`Camera centered on tile ${Math.floor(tile.x)}, ${Math.floor(tile.z)}. Right-click another tile to change the center.`);});stateUI=new PlayerStateUI(document.querySelector('aside')!);
  const frameEnd=viewer.renderer.onFrameEnd.bind(viewer.renderer);viewer.renderer.onFrameEnd=()=>{frameTimings.sample(performance.now(),playing&&!document.hidden);playbackStats.draws++;if(playing&&currentFrame){if(layer.blend>=1)playbackStats.heldDraws++;else playbackStats.interpolatedDraws++;}frameEnd();overheads.time=position;if(currentFrame&&displayFrame){for(let i=0;i<currentFrame.actors.length;i++)interpolateActor(currentFrame.actors[i],displayFrame.actors[i]);overheads.frame=displayFrame;}overheads.draw();tilePings.draw();};
  (window as any).replay={viewer,pool,replayPool,playbackStats,tilePings,frameTimings,preparedFrameCache,staticWorldCache,worldStats,get recording(){return recording;},get frame(){return currentFrame;},get position(){return position;},get layer(){return layer;}};status('Native osrs.world renderer ready. Drag to look around; WASD moves the camera.');
  let lastMetricTime=performance.now(),lastDraws=playbackStats.draws,lastPoses=playbackStats.poses;
  setInterval(()=>{const now=performance.now(),seconds=(now-lastMetricTime)/1000,drawRate=(playbackStats.draws-lastDraws)/seconds,poseRate=(playbackStats.poses-lastPoses)/seconds;$('metrics').textContent='Display: '+Math.round(drawRate)+' frames/s\nModel updates: '+poseRate.toFixed(1)+'/s\nPose delay: '+Math.round(Math.max(0,position-playbackStats.lastPoseMs))+' ms\nFrame time p95: '+frameTimings.percentile(0.95).toFixed(1)+' ms  |  stalls >50 ms: '+frameTimings.stalls+'\n3D buffer: '+Math.max(0,Math.round((preparedFrameCache.latest(position+500)?.ms??position)-position))+' ms / '+Math.round(preparedFrameCache.bytes/1048576)+' MB\nLoaded regions: '+viewer.renderer.mapManager.mapSquares.size+(worldStats.restoredGroundFaces||worldStats.restoredObjects?'\nEnvironment restored from world cache':'');lastMetricTime=now;lastDraws=playbackStats.draws;lastPoses=playbackStats.poses;},1000);
 }catch(error:any){status('Could not start replay: '+error.message);console.error(error);viewer?.renderer.stop();viewer=null;}
 finally{loading=false;}
}
$('load-world').onclick=loadWorld;
$('fps-limit').onchange=(e:any)=>{if(viewer)viewer.renderer.fpsLimit=+e.target.value;frameTimings.clear();try{localStorage.setItem('moonga-replay-fps',e.target.value);}catch{}};
try{const saved=localStorage.getItem('moonga-replay-fps');if(saved&&['0','30','60','90','120'].includes(saved))($('fps-limit') as HTMLSelectElement).value=saved;}catch{}
try{hideStackedPlayers=localStorage.getItem('moonga-replay-hide-stacked')==='true';}catch{}($('hide-stacked-players') as HTMLInputElement).checked=hideStackedPlayers;
$('hide-stacked-players').onchange=(event:any)=>{hideStackedPlayers=event.target.checked;try{localStorage.setItem('moonga-replay-hide-stacked',String(hideStackedPlayers));}catch{}
 const version=++renderSettingsVersion;resetPoseBuffer();preparedFrameCache.clear();sequence++;currentRef=undefined;if(!recording)return;settingsUpdating=true;
 show().catch(error=>status(error.message)).finally(()=>{if(version===renderSettingsVersion){settingsUpdating=false;($('play') as HTMLButtonElement).disabled=!recording?.frames.length;}});
};
$('distance').oninput=(e:any)=>{if(viewer)viewer.renderDistance=+e.target.value;};
$('recording').onchange=async(e:any)=>{
 const file=e.target.files[0];if(!file)return;cameraRoute?.reset();recordingGeneration++;renderSettingsVersion++;settingsUpdating=false;loadController?.abort();const controller=new AbortController();loadController=controller;playing=false;currentRef=undefined;stateShown=undefined;sequence++;coverageKey='';staticTag='';staticSignature='';currentFrame=null;nextDisplayFrame=null;displayFrame=null;localActor=null;displayNextActors.clear();resetPoseBuffer();activeRecoveryGround=[];tilePings?.clear();preparedFrameCache.clear();terrainVisibility.clear();frameTimings.clear();staticWorldCache.clear();recording?.dispose();recording=null;layer?.dispose();staticLayer?.dispose();if(overheads)overheads.frame=null;stateUI?.reset();($('play') as HTMLButtonElement).disabled=true;($('timeline') as HTMLInputElement).disabled=true;$('play').textContent="Play";
 try{await loadWorld();if(controller.signal.aborted)return;if(!viewer)throw Error('World renderer is unavailable');status('Indexing recording...');const next=await openRecording(file,n=>status('Indexing recording '+Math.round(n*100)+'%'),controller.signal);recording?.dispose();recording=next;showDiagnostics(next);position=next.frames[0]?.ms||0;if(next.scenes[0]&&next.scenes[0].ms-position<=1000)position=Math.max(position,next.scenes[0].ms);($('timeline') as HTMLInputElement).max=String(next.duration);($('play') as HTMLButtonElement).disabled=true;
  $('info').textContent=next.frames.length+' recorded 3D frames  |  '+next.states.length+' player states  |  '+(next.complete?'Complete':'Incomplete')+'  |  '+next.skipped+' skipped samples';await show();await prepareWorld(viewer,controller.signal,(done,total)=>status('Preparing world on GPU '+done+' / '+total+'...'));if(controller.signal.aborted)return;await warmStaticWorlds(next,controller.signal);if(controller.signal.aborted)return;await warmPreparedFrames(next,controller.signal);if(controller.signal.aborted)return;($('play') as HTMLButtonElement).disabled=!next.frames.length;($('timeline') as HTMLInputElement).disabled=false;status('World prepared locally. Ready to play.');
 }catch(error:any){if(controller.signal.aborted)return;status('Could not load recording: '+error.message);console.error(error);}
};
async function show(){
 const source=recording;if(!source||!viewer)return;const ms=position,seq=++sequence,ref=playing?presentationRef(source,ms):at(source.frames,ms);if(!ref)return;
 const prepared=await prepareFrame(source,ref),{frame,nextRef,nextFrame}=prepared,sceneTime=source.sceneRefAt(frame,ms)?ms:ref.ms,sceneRef=source.sceneRefAt(frame,sceneTime),scene=sceneRef?await source.scene(sceneRef,false):null;
 if(seq!==sequence)return;
 if(Number.isFinite(frame.brightness)&&frame.brightness>0&&frame.brightness<=2)viewer.renderer.brightness=frame.brightness;
 const knownRevision=frame.revision||source.header.gameRevision;if(knownRevision&&knownRevision!==viewer.loadedCache.info.revision)throw Error('Recording and cache revisions differ');
 const coverage={baseX:frame.baseX,baseY:frame.baseY,width:frame.captureWidth??scene?.width??104,height:frame.captureHeight??scene?.height??104,plane:frame.plane,capturedPlanes:scene?.capturedPlanes??[frame.plane],instance:!!frame.instanced,capturedTerrain:!!scene?.groundIds?.length,capturedObjects:!!sceneRef};viewer.renderer.replayInstance=!!frame.instanced;
 const key=JSON.stringify(coverage);if(key!==coverageKey){await (window as any).replay.pool.ready;await (window as any).replay.pool.request('coverage',coverage);if(seq!==sequence)return;coverageKey=key;viewer.renderer.maxLevel=frame.plane;viewer.renderer.clearMaps();viewer.renderer.mapManager.init(viewer.mapFileIndex,false);}
 const objectTag=[sceneRef?.start,at(source.objects,sceneTime)?.start,frame.baseX,frame.baseY,frame.plane].join(':');
 let packedStatic:any=null;
  if(objectTag!==staticTag){
  const packet=await prepareStaticWorld(source,frame,sceneTime,sceneRef,scene);if(packet.signature!==staticSignature)packedStatic=packet;

 }
 if(seq!==sequence)return;
 const {packed,prepareMs,decodeMs,workerMs}=prepared;Object.assign(playbackStats,{prepareMs,decodeMs,workerMs});const uploadStarted=performance.now();
 if(seq!==sequence)return;if(packedStatic){staticLayer.install(packedStatic);activeRecoveryGround=packedStatic.recoveryGround||[];worldStats.restoredGroundFaces=packedStatic.recovery?.groundFaces||0;worldStats.restoredObjects=packedStatic.recovery?.objects||0;staticSignature=packedStatic.signature;staticWorldCache.pin(staticSignature);}staticTag=objectTag;layer.install(packed);layer.start=ref.ms;layer.end=nextRef?.ms??source.duration;layer.blend=layer.end>layer.start?Math.max(0,Math.min(1,(position-layer.start)/(layer.end-layer.start))):0;if(!currentFrame)viewer.setCamera({pitch:-230,yaw:frame.camera?.[3]??1862});playbackStats.uploadMs=performance.now()-uploadStarted;playbackStats.poses++;playbackStats.lastPoseMs=ref.ms;currentFrame=frame;nextDisplayFrame=nextFrame;displayNextActors.clear();for(const a of nextFrame?.actors||[])if(a.id!==undefined)displayNextActors.set(a.id,a);displayFrame={...frame,actors:frame.actors.map((a:any)=>({...a}))};localActor=frame.actors.find((a:any)=>a.self);currentRef=ref;overheads.frame=frame;
 $('timeline').setAttribute('value',String(position));($('timeline') as HTMLInputElement).value=String(position);$('clock').textContent=Math.floor(position/60000)+':'+String(Math.floor(position/1000)%60).padStart(2,'0');
 const stateRef=at(source.states,ms);if(stateRef){const state=(await source.row(stateRef)).data;if(seq!==sequence)return;$('info').textContent=(state.player||'Local player')+'  |  '+frame.actors.length+' visible models  |  '+(state.inventory?.length||0)+' inventory items';if(stateRef!==stateShown){stateShown=stateRef;await stateUI.update(state,source);}}
 if(seq!==sequence)return;
 followCamera();
 prepareAhead(source,ref);
}
function interpolateActor(actor:any,target:any){target.x=actor.x;target.z=actor.z;target.height=actor.height;if(!compatibleFrames(currentFrame,nextDisplayFrame,layer.start,layer.end)||actor.id===undefined)return target;const next=displayNextActors.get(actor.id);if(!compatibleActors(actor,next))return target;const blend=layer.blend;target.x=actor.x+(next.x-actor.x)*blend;target.z=actor.z+(next.z-actor.z)*blend;target.height=actor.height+(next.height-actor.height)*blend;return target;}
function followCamera(){
 if(cameraRoute?.active){cameraRoute.apply(position);return;}if(!currentFrame)return;const mode=($('camera') as HTMLSelectElement).value;if(mode==='free')return;
 const context=recordingGeneration+'|'+coverageKey;if(orbitTile?.context!==context){orbitTile=null;orbitHeightOffset=0;}
 let x:number,z:number,height:number;
 if(mode==='tile'&&orbitTile){({x,z,height}=orbitTile);height+=orbitHeightOffset;}else{if(!localActor)return;const self=interpolateActor(localActor,followPosition);x=currentFrame.baseX+self.x/128;z=currentFrame.baseY+self.z/128;height=self.height/128;}
 const camera=viewer.camera,angle=(camera.yaw-1024)*Math.PI/1024,pitch=camera.pitch*Math.PI/1024,d=replayCamera?.distance??9;
 viewer.setCamera({position:[x+Math.sin(angle)*Math.cos(pitch)*d,height-1+Math.sin(pitch)*d,z+Math.cos(angle)*Math.cos(pitch)*d]});
}
async function toggleCameraRoute(){
 const route=cameraRoute,source=recording,controller=loadController;if(!route)return;
 if(route.active||route.preparing){if(route.active){routeClock.pause(performance.now());playing=false;$('play').textContent='Play';($('camera') as HTMLSelectElement).value='free';}route.stop();return;}
 try{if(!source||!controller)throw Error('Load a gameplay recording first.');const range=route.range(source.duration);
 if(playing){playbackClock.pause(performance.now());playing=false;$('play').textContent='Play';}
 route.preparing=true;const generation=++route.generation;window.dispatchEvent(new Event('replay-route-change'));
 position=range.start;playbackClock.seek(position,performance.now());resetPoseBuffer();currentRef=undefined;await show();
 if(source!==recording||generation!==route.generation)return;
 await warmPreparedFrames(source,controller.signal);if(source!==recording||generation!==route.generation)return;
 route.preparing=false;route.active=true;viewer.inputManager.keys.clear();route.apply(position);routeClock.start(0,performance.now());playbackClock.start(position,performance.now());playing=true;$('play').textContent='Pause';window.dispatchEvent(new Event('replay-route-change'));status('Playing camera route over the selected gameplay range.');
 }catch(error:any){route.stop();status(error.message);}
}
document.addEventListener('keydown',(event:KeyboardEvent)=>{
 if(!['F2','F3','F4'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
 if((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
 event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
 if(event.key==='F2')void toggleCameraRoute();else if(event.key==='F3'){cameraRoute?.add();status(`${cameraRoute?.points.length||0} camera points. F3 adds a point; F2 plays the selected gameplay range.`);}else cameraRoute?.remove();
},true);
$('play').onclick=()=>{const now=performance.now();if(playing){if(cameraRoute?.active)routeClock.pause(now);else position=Math.min(recording?.duration??position,playbackClock.pause(now));playing=false;}else{if(cameraRoute?.active)routeClock.start(cameraRoute.elapsed,now);if(recording&&position>=recording.duration){position=recording.frames[0]?.ms||0;currentRef=undefined;}playbackClock.start(position,now);playing=true;}$('play').textContent=playing?'Pause':'Play';};
// Capture before the native canvas input handler consumes keyboard events.
document.addEventListener('keydown',(event:KeyboardEvent)=>{
 if(event.code!=='Space'||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
 const target=event.target as HTMLElement|null;
 if(target?.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
 const play=$('play') as HTMLButtonElement;if(play.disabled)return;
 event.preventDefault();event.stopPropagation();if(!event.repeat)play.click();
},true);
$('timeline').oninput=(e:any)=>{cameraRoute?.stop();resetPoseBuffer();position=+e.target.value;playbackClock.seek(position,performance.now());const epoch=bufferEpoch;show().then(async()=>{if(!playing&&recording&&epoch===bufferEpoch){const source=recording,controller=loadController;if(!controller)return;($('play') as HTMLButtonElement).disabled=true;try{await warmPreparedFrames(source,controller.signal);}finally{if(epoch===bufferEpoch){($('play') as HTMLButtonElement).disabled=false;status('3D replay buffer ready.');}}}}).catch(error=>status(error.message));};
$('camera').onchange=()=>{if(cameraRoute?.active)playbackClock.start(position,performance.now());cameraRoute?.stop();viewer?.inputManager.keys.clear();followCamera();if(($('camera') as HTMLSelectElement).value==='tile')status('Right-click a ground tile to set the camera center. Drag to rotate; scroll to zoom; Q/E to move down/up.');};
function tick(time:number){if(layer)layer.blend=layer.end>layer.start?Math.max(0,Math.min(1,(position-layer.start)/(layer.end-layer.start))):0;if(recording&&playing){position=Math.min(recording.duration,cameraRoute?.active?parseReplayTime(cameraRoute.end):recording.duration,(cameraRoute?.active?cameraRoute.mediaTime(routeClock.position(time)):playbackClock.position(time)));if(cameraRoute?.active&&position>=parseReplayTime(cameraRoute.end)){cameraRoute.apply(position);routeClock.pause(time);playbackClock.seek(position,time);cameraRoute.stop();($('camera') as HTMLSelectElement).value='free';playbackClock.pause(time);playing=false;$('play').textContent='Play';}if(position>=recording.duration){playbackClock.pause(time);playing=false;$('play').textContent='Play';}const target=presentationRef(recording,position);if(!updating&&!settingsUpdating&&target!==currentRef&&(target&&preparedFrameCache.has(target.start)||!aheadJob)){updating=true;show().catch(error=>{status(error.message);playing=false;}).finally(()=>updating=false); }prepareAhead(recording);}requestAnimationFrame(tick);}requestAnimationFrame(tick);
document.addEventListener('visibilitychange',()=>{if(document.hidden)frameTimings.sample(performance.now(),false);});
status('Ready to load the local world cache.');






























