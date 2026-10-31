import {PoseModelCache} from './pose-model-cache';
import {Model,computeTextureCoords} from '../engine/src/rs/model/Model';
import {SceneBuffer,createModelInfoTextureData,getModelFaces,isModelFaceTransparent,ContourGroundType} from '../engine/src/mapviewer/webgl/buffer/SceneBuffer';
import {newDrawRange} from '../engine/src/mapviewer/webgl/DrawRange';
function override(color:number,values:number[]){if(!values?.[3]||color<0)return color;let h=(color>>10)&63,s=(color>>7)&7,l=color&127,a=values[3];if(values[0]!==-1)h+=(a*(values[0]-h))>>7;if(values[1]!==-1)s+=(a*(values[1]-s))>>7;if(values[2]!==-1)l+=(a*(values[2]-l))>>7;return ((h<<10)|(s<<7)|l)&65535;}
function model(geometry:any,transform:any,state:any,poseId?:string){
 const poseCache:PoseModelCache=state.replayPoseModels??=new PoseModelCache(),poseKey=poseId&&!geometry.terrainUv?JSON.stringify([poseId,geometry._template,transform.orientation||0]):null;
 if(poseKey){const cached=poseCache.get(poseKey);if(cached)return cached;}

 const m:any=new Model(),n=geometry.x.length; m.verticesCount=n;m.usedVertexCount=n;m.faceCount=geometry.a.length;
 const rotate=!!(transform.orientation%2048);m.verticesX=!rotate&&geometry.x instanceof Float32Array?geometry.x:Float32Array.from(geometry.x);m.verticesY=geometry.y instanceof Float32Array?geometry.y:Float32Array.from(geometry.y);m.verticesZ=!rotate&&geometry.z instanceof Float32Array?geometry.z:Float32Array.from(geometry.z);
 const cache:Map<string,any>=state.replayMaterials??=new Map(),key=geometry._template;let material=key?cache.get(key):undefined;
 state.replayMaterialStats??={hits:0,misses:0};
 if(material){cache.delete(key);cache.set(key,material);Object.assign(m,material.attributes);state.replayMaterialStats.hits++;}
 else{
 state.replayMaterialStats.misses++;
 m.indices1=Int32Array.from(geometry.a);m.indices2=Int32Array.from(geometry.b);m.indices3=Int32Array.from(geometry.c);
 m.faceColors1=Int32Array.from(geometry.ca,(c:number,i:number)=>geometry.textures?.[i]>=0?c:override(c,geometry.override));
 m.faceColors2=Int32Array.from(geometry.cb,(c:number,i:number)=>geometry.textures?.[i]>=0?c:override(c,geometry.override));
 m.faceColors3=Int32Array.from(geometry.cc,(c:number,i:number)=>geometry.ca[i]===12345678?-2:geometry.textures?.[i]>=0?c:override(c,geometry.override));
 if(geometry.alpha)m.faceAlphas=Int8Array.from(geometry.alpha);if(geometry.priorities)m.faceRenderPriorities=Int8Array.from(geometry.priorities);
 if(geometry.textures){m.faceTextures=Int16Array.from(geometry.textures);m.textureCoords=geometry.textureFaces?Int8Array.from(geometry.textureFaces):undefined;m.textureMappingP=Int32Array.from(geometry.texA||[]);m.textureMappingM=Int32Array.from(geometry.texB||[]);m.textureMappingN=Int32Array.from(geometry.texC||[]);}
 const attributes:any={};for(const name of ['indices1','indices2','indices3','faceColors1','faceColors2','faceColors3','faceAlphas','faceRenderPriorities','faceTextures','textureCoords','textureMappingP','textureMappingM','textureMappingN'])attributes[name]=m[name];
 const faces=getModelFaces(m);if(geometry.alpha)for(const face of faces)face.alpha=255-(geometry.alpha[face.index]&255);
 material={attributes,opaque:faces.filter(face=>!isModelFaceTransparent(state.textureLoader,face)),alpha:faces.filter(face=>isModelFaceTransparent(state.textureLoader,face))};
 if(key){material.bytes=512+faces.length*160;for(const attr of Object.values(attributes))if(ArrayBuffer.isView(attr))material.bytes+=attr.byteLength;
 state.replayMaterialBytes??=0;if(material.bytes<=16*1024*1024){cache.set(key,material);state.replayMaterialBytes+=material.bytes;while(cache.size>512||state.replayMaterialBytes>16*1024*1024){const oldest=cache.keys().next().value!;state.replayMaterialBytes-=cache.get(oldest).bytes;cache.delete(oldest);}}}
 }
 m.replayMaterial=material;
 if(m.faceTextures&&!geometry.uvs)m.uvs=computeTextureCoords(m);
 if(geometry.uvs)m.uvs=geometry.uvs instanceof Float32Array?geometry.uvs:Float32Array.from(geometry.uvs);
 if(!geometry.uvs&&geometry.terrainUv&&m.faceTextures){m.uvs=new Float32Array(m.faceCount*6);const x=Math.floor(Math.min(...geometry.x)/128)*128,z=Math.floor(Math.min(...geometry.z)/128)*128;for(let i=0;i<m.faceCount;i++)for(const [k,index] of [m.indices1[i],m.indices2[i],m.indices3[i]].entries()){m.uvs[i*6+k*2]=(m.verticesX[index]-x)/128;m.uvs[i*6+k*2+1]=(m.verticesZ[index]-z)/128;}}
 const angle=(transform.orientation||0)*Math.PI/1024,co=Math.cos(angle),si=Math.sin(angle);
 if(rotate)for(let i=0;i<n;i++){const x=m.verticesX[i],z=m.verticesZ[i];m.verticesX[i]=x*co+z*si;m.verticesZ[i]=z*co-x*si;}
 if(poseKey)poseCache.set(poseKey,m);return m;
}
export function packRecorded(state:any,input:any){
 if(input.namespace!==undefined&&input.namespace!==state.replayNamespace){state.replayNamespace=input.namespace;state.replayPoseModels=new PoseModelCache();state.replayMaterials=new Map();state.replayMaterialBytes=0;state.replayMaterialStats={hits:0,misses:0};}

 const textureMap=state.replayTextureMap??=new Map(state.textureLoader.getTextureIds().filter((id:number)=>state.textureLoader.isSd(id)).slice(0,2047).map((id:number,i:number)=>[id,i]));
 const groups=new Map<string,any>();
 for(const [partIndex,part] of input.parts.entries()){if(!part.geometry)continue;const a=part.transform||{},worldX=input.baseX+(a.x||0)/128,worldY=input.baseY+(a.z||0)/128;
  const nextPart=input.nextParts?.[partIndex]||part,nextGeometry=nextPart.geometry||part.geometry,nextTransform=nextPart.transform||a,angle=(nextTransform.orientation||0)*Math.PI/1024,co=Math.cos(angle),si=Math.sin(angle);
  const m=model(part.geometry,a,state,part.cacheKey);
  for(const transparent of [false,true]){const all=transparent?m.replayMaterial.alpha:m.replayMaterial.opaque;if(!all.length)continue;
   const buckets=new Map<string,any>();
   if(!part.geometry.terrainUv){const rx=Math.floor(worldX/64),ry=Math.floor(worldY/64);buckets.set(rx+','+ry,{rx,ry,faces:all});}
   else for(const face of all){const index=face.index,rx=part.geometry.terrainUv?Math.floor((worldX+(m.verticesX[m.indices1[index]]+m.verticesX[m.indices2[index]]+m.verticesX[m.indices3[index]])/384)/64):Math.floor(worldX/64),ry=part.geometry.terrainUv?Math.floor((worldY+(m.verticesZ[m.indices1[index]]+m.verticesZ[m.indices2[index]]+m.verticesZ[m.indices3[index]])/384)/64):Math.floor(worldY/64),key=rx+','+ry;
    if(!buckets.has(key))buckets.set(key,{rx,ry,faces:[]});buckets.get(key).faces.push(face);
   }
   for(const [key,{rx,ry,faces}] of buckets){
   let group=groups.get(key);if(!group){group={mapX:rx,mapY:ry,nextPositions:new Float32Array(0),nextLength:0,buffer:new SceneBuffer(state.textureLoader,textureMap as any,10000)};groups.set(key,group);}
   const buffer=group.buffer,offset=buffer.indexByteOffset(),nextX=(input.baseX-rx*64)*128+(nextTransform.x||0),nextZ=(input.baseY-ry*64)*128+(nextTransform.z||0);
   buffer.addModel(m,faces,[(worldX-rx*64)*128,a.height||0,(worldY-ry*64)*128],false);
   // Match the native buffer's face/vertex order, but prepare only positions for the next pose.
   // Materials, UVs and draw commands are shared rather than packed twice.
   const required=group.nextLength+faces.length*9;if(required>group.nextPositions.length){const grown=new Float32Array(Math.max(required,group.nextPositions.length*2,4096));grown.set(group.nextPositions);group.nextPositions=grown;}
   const positions=group.nextPositions;let cursor=group.nextLength;
   for(const face of faces){const f=face.index;for(let corner=0;corner<3;corner++){const index=corner===0?m.indices1[f]:corner===1?m.indices2[f]:m.indices3[f],x=nextGeometry.x[index],z=nextGeometry.z[index];
    positions[cursor++]=Math.floor(nextX+x*co+z*si);positions[cursor++]=Math.ceil((nextTransform.height||0)+nextGeometry.y[index]);positions[cursor++]=Math.floor(nextZ+z*co-x*si);
   }}group.nextLength=cursor;
   const command={offset,elements:(buffer.indexByteOffset()-offset)/4,instances:[{sceneX:0,sceneZ:0,heightOffset:0,level:input.plane||0,contourGround:ContourGroundType.NONE,priority:0,interactType:0,interactId:0xffff}]};
   (transparent?buffer.drawCommandsAlpha:buffer.drawCommands).push(command);
   }
  }
 }
 const transferables:ArrayBuffer[]=[],textures=new Map<number,Int32Array>(),packed=[];
 for(const group of groups.values()){
  const b=group.buffer,vertices=b.vertexBuf.byteArray(),indices=Int32Array.from(b.indices),opaque=createModelInfoTextureData(b.drawCommands),alpha=createModelInfoTextureData(b.drawCommandsAlpha);
  for(const id of b.usedTextureIds)if(!input.loadedTextureIds.has(id)&&!textures.has(id)){try{textures.set(id,state.textureLoader.getPixelsArgb(id,128,true,1));}catch{}}
  const nextPositions=group.nextPositions.slice(0,group.nextLength);
  packed.push({mapX:group.mapX,mapY:group.mapY,vertices,nextPositions,indices,opaque,alpha,opaqueRanges:b.drawCommands.map((c:any)=>newDrawRange(c.offset,c.elements,c.instances.length)),alphaRanges:b.drawCommandsAlpha.map((c:any)=>newDrawRange(c.offset,c.elements,c.instances.length))});
  transferables.push(vertices.buffer,nextPositions.buffer,indices.buffer,opaque.buffer,alpha.buffer);
 }
 for(const pixels of textures.values())transferables.push(pixels.buffer);
 return {value:{groups:packed,textures,materialCache:{...state.replayMaterialStats},poseCache:state.replayPoseModels?.stats()},transferables};
}

