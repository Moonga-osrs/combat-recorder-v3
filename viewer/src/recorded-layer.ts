import {uploadChanged} from './changed-buffer';
import PicoGL from 'picogl';
import {createMainProgram} from '../engine/src/mapviewer/webgl/shaders/Shaders';
export async function initReplayPrograms(renderer:any){
 const source=(alpha:boolean)=>{const [vertex,fragment]=createMainProgram(renderer.hasMultiDraw,alpha);return [vertex.replace('layout(location = 0) in uvec3 a_vertex;','layout(location = 0) in uvec3 a_vertex;\nlayout(location = 1) in vec3 a_nextPosition;\nuniform float u_replayBlend;').replace('v_color = vertex.color;','vertex.pos = mix(vertex.pos, a_nextPosition, u_replayBlend);\n    v_color = vertex.color;'),fragment];};
 renderer.replayPrograms=await renderer.app.createPrograms(source(false),source(true));
}
export class RecordedLayer {
 renderer:any;groups:any[]=[];height:any;blend=0;start=0;end=0;
 stats={poseCache:null as any,geometryBytes:0,geometryBytesAvoided:0,allocatedGroups:0,reusedGroups:0,topologyUploads:0,materialHits:0,materialMisses:0};
 constructor(renderer:any){this.renderer=renderer;const app=renderer.app;this.height=app.createTextureArray(new Int16Array(16),2,2,4,{internalFormat:PicoGL.R16I,type:PicoGL.SHORT,minFilter:PicoGL.NEAREST,magFilter:PicoGL.NEAREST,wrapS:PicoGL.CLAMP_TO_EDGE,wrapT:PicoGL.CLAMP_TO_EDGE});
  const opaque=renderer.renderOpaquePass.bind(renderer),alpha=renderer.renderTransparentPass.bind(renderer);
  renderer.renderOpaquePass=()=>{opaque();this.draw(false);};renderer.renderTransparentPass=()=>{alpha();this.draw(true);};
 }
 dispose(){for(const g of this.groups)for(const resource of g.resources)resource.delete();this.groups=[];}
 install(data:any){
  this.stats.poseCache=data.poseCache;const r=this.renderer,previous=new Map(this.groups.map(group=>[group.key,group])),installed=[];r.updateTextureArray(data.textures);
  if(data.materialCache){this.stats.materialHits=data.materialCache.hits;this.stats.materialMisses=data.materialCache.misses;}
  for(const packet of data.groups){
   if(!packet.indices.length)continue;const key=packet.mapX+','+packet.mapY;let group=previous.get(key);previous.delete(key);
   if(group&&(packet.vertices.length>group.vertexCapacity||packet.nextPositions.length>group.positionCapacity||packet.indices.length>group.indexCapacity||packet.opaque.length>group.calls[0].padded.length||packet.alpha.length>group.calls[1].padded.length)){
    for(const resource of group.resources)resource.delete();group=null;
   }
   if(!group)group=this.allocate(packet,key);else this.stats.reusedGroups++;
   const bytes=uploadChanged(group.vertex,group.lastVertices,packet.vertices)+uploadChanged(group.next,group.lastNext,packet.nextPositions);
   this.stats.geometryBytes+=bytes;this.stats.geometryBytesAvoided+=packet.vertices.byteLength+packet.nextPositions.byteLength-bytes;group.lastVertices=packet.vertices;group.lastNext=packet.nextPositions;
   if(!equalData(group.lastIndices,packet.indices)){group.indices.data(packet.indices);group.lastIndices=packet.indices;this.stats.topologyUploads++;}
   for(let i=0;i<2;i++){
    const call=group.calls[i],meta=i?packet.alpha:packet.opaque,ranges=i?packet.alphaRanges:packet.opaqueRanges;
    if(!equalData(call.lastMeta,meta)){call.padded.fill(0);call.padded.set(meta);call.info.data(call.padded);call.lastMeta=meta;}
    call.ranges=ranges;call.draw.drawRanges(...ranges);
   }
   installed.push(group);
  }
  for(const group of previous.values())for(const resource of group.resources)resource.delete();this.groups=installed;
 }
 private allocate(packet:any,key:string){
  const r=this.renderer,app=r.app,vertexCapacity=capacity(Math.ceil(packet.vertices.length/36))*36,positionCapacity=vertexCapacity/4,indexCapacity=capacity(Math.ceil(packet.indices.length/3))*3;
  const vertex=app.createInterleavedBuffer(12,vertexCapacity,PicoGL.DYNAMIC_DRAW),next=app.createVertexBuffer(PicoGL.FLOAT,3,positionCapacity,PicoGL.DYNAMIC_DRAW),indices=app.createIndexBuffer(PicoGL.UNSIGNED_INT,3,indexCapacity,PicoGL.DYNAMIC_DRAW);
  const array=app.createVertexArray().vertexAttributeBuffer(0,vertex,{type:PicoGL.UNSIGNED_INT,size:3,stride:12,integer:true}).vertexAttributeBuffer(1,next).indexBuffer(indices),resources=[array,vertex,next,indices],calls=[];
  for(const [i,meta] of [packet.opaque,packet.alpha].entries()){
   const padded=new Uint16Array(Math.max(64,capacity(meta.length))),info=app.createTexture2D(padded,16,padded.length/64,{internalFormat:PicoGL.RGBA16UI,minFilter:PicoGL.NEAREST,magFilter:PicoGL.NEAREST});resources.push(info);
   const draw=app.createDrawCall(r.replayPrograms[i],array).uniformBlock('SceneUniforms',r.sceneUniformBuffer).uniform('u_replayBlend',0).uniform('u_timeLoaded',-1000000).uniform('u_mapPos',new Float32Array([packet.mapX,packet.mapY])).uniform('u_drawIdOffset',0).texture('u_textures',r.textureArray).texture('u_textureMaterials',r.textureMaterials).texture('u_heightMap',this.height).texture('u_modelInfoTexture',info);
   calls.push({transparent:!!i,draw,ranges:[],info,padded,lastMeta:null});
  }
  this.stats.allocatedGroups++;return {key,vertexCapacity,positionCapacity,indexCapacity,vertex,next,indices,resources,calls,lastIndices:null};
 }
 draw(transparent:boolean){for(const group of this.groups)for(const call of group.calls)if(call.transparent===transparent&&call.ranges.length){call.draw.uniform('u_replayBlend',this.blend);this.renderer.draw(call.draw,call.ranges);}}
}
function capacity(size:number){return 2**Math.ceil(Math.log2(Math.max(1,size)));}
function equalData(previous:any,next:any){if(!previous||previous.length!==next.length)return false;for(let i=0;i<next.length;i++)if(previous[i]!==next[i])return false;return true;}

