import {getSceneLocs} from '../engine/src/mapviewer/webgl/loc/SceneLocs';
export function decodeInstanceChunk(value:number){return {plane:(value>>>24)&3,rotation:(value>>>1)&3,x:(value>>>14)&1023,y:(value>>>3)&2047};}
export function rotateChunkPoint(x:number,z:number,rotation:number,size=1024){switch(rotation&3){case 1:return [z,size-x];case 2:return [size-x,size-z];case 3:return [size-z,x];default:return [x,z];}}
function geometry(model:any,rotation:number){const x=new Float32Array(model.verticesX.length),z=new Float32Array(model.verticesZ.length);for(let i=0;i<x.length;i++){const rotated=rotateChunkPoint(model.verticesX[i],model.verticesZ[i],rotation,0);x[i]=rotated[0];z[i]=rotated[1];}
 return {x,y:model.contourVerticesY||model.verticesY,z,a:model.indices1,b:model.indices2,c:model.indices3,ca:model.faceColors1,cb:model.faceColors2,cc:model.faceColors3,alpha:model.faceAlphas,priorities:model.faceRenderPriorities,textures:model.faceTextures,uvs:model.uvs,textureFaces:model.textureCoords,texA:model.textureMappingP,texB:model.textureMappingM,texC:model.textureMappingN};}
/** Reconstruct missing lower floors only. Captured planes and objects take precedence. */
export function recoverInstanceParts(state:any,input:any){
 const cache:Map<string,any>=state.instanceRecoveryCache??=new Map(),key=JSON.stringify([input.chunks,input.baseX,input.baseY,input.plane]);let result=cache.get(key);
 if(!result){const parts:any[]=[],regions=new Map<string,any>();let groundFaces=0,objects=0;
 for(let destPlane=0;destPlane<input.plane;destPlane++)for(let dx=0;dx<(input.chunks[destPlane]?.length||0);dx++)for(let dz=0;dz<(input.chunks[destPlane][dx]?.length||0);dz++){
  const value=input.chunks[destPlane][dx][dz];if(value<0)continue;const chunk=decodeInstanceChunk(value),mx=Math.floor(chunk.x/8),my=Math.floor(chunk.y/8),regionKey=mx+','+my;
  let region=regions.get(regionKey);if(!region){if(!state.sceneBuilder.getTerrainData(mx,my))continue;const scene=state.sceneBuilder.buildScene(mx*64-6,my*64-6,76,76,false);region={scene,models:getSceneLocs(state.locTypeLoader,scene,6,3).locs};regions.set(regionKey,region);}
  const sx=(chunk.x&7)*8,sz=(chunk.y&7)*8,dy=(destPlane-chunk.plane)*-240,terrain:any={x:[],y:[],z:[],a:[],b:[],c:[],ca:[],cb:[],cc:[],textures:[],uvs:[],terrainUv:true};
  for(let x=sx;x<sx+8;x++)for(let z=sz;z<sz+8;z++)for(const face of region.scene.tiles[chunk.plane]?.[x+6]?.[z+6]?.tileModel?.faces||[]){
   if(face.vertices[0].hsl===12345678)continue;const start=terrain.x.length;terrain.a.push(start);terrain.b.push(start+1);terrain.c.push(start+2);terrain.textures.push(face.vertices[0].textureId);
   for(let i=0;i<3;i++){const v=face.vertices[i],point=rotateChunkPoint(v.x-(sx+6)*128,v.z-(sz+6)*128,chunk.rotation);terrain.x.push(dx*1024+point[0]);terrain.z.push(dz*1024+point[1]);terrain.y.push(v.y+dy);terrain[['ca','cb','cc'][i]].push(v.hsl);terrain.uvs.push(v.u,v.v);}
   groundFaces++;
  }
  if(terrain.a.length)parts.push({geometry:terrain,transform:{x:0,z:0,height:0}});
  for(const loc of region.models){if(loc.level!==chunk.plane||Math.floor(loc.sceneX/1024)!==(chunk.x&7)||Math.floor(loc.sceneZ/1024)!==(chunk.y&7))continue;
   const point=rotateChunkPoint(loc.sceneX-sx*128,loc.sceneZ-sz*128,chunk.rotation);parts.push({id:loc.interactId,geometry:geometry(loc.model,chunk.rotation),transform:{x:dx*1024+point[0],z:dz*1024+point[1],height:loc.sceneHeight+dy}});objects++;
  }
 }
 result={parts,groundFaces,objects,regions:regions.size};cache.set(key,result);while(cache.size>2)cache.delete(cache.keys().next().value!);
 }
 const filtered=result.parts.filter((part:any)=>part.id===undefined||!(input.exclude||[]).some((captured:any)=>captured.id===part.id&&Math.abs(captured.x-part.transform.x)<2&&Math.abs(captured.z-part.transform.z)<2&&Math.abs(captured.height-part.transform.height)<8));return {...result,parts:filtered,objects:filtered.filter((part:any)=>part.id!==undefined).length};
}
