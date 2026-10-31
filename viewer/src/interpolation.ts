/** Interpolate observed adjacent poses only; never smooth across scene changes or capture gaps. */
export function compatibleFrames(frame:any,next:any,start:number,end:number){
 return !!next&&end>start&&end-start<=100&&['baseX','baseY','plane','worldView','instanced'].every(key=>frame[key]===next[key]);
}
export function compatibleActors(actor:any,next:any){
 return !!next&&actor.id!==undefined&&actor.id===next.id&&['x','z','height'].every(key=>Number.isFinite(actor[key])&&Number.isFinite(next[key]))&&Math.hypot(next.x-actor.x,next.z-actor.z)<=256&&Math.abs(next.height-actor.height)<=256;
}

/** Legacy full meshes have pose-specific IDs: compare actual topology/materials before blending. */
export function compatiblePoseGeometry(current:any,next:any){
 if(!current||!next)return false;if(current._template&&current._template===next._template)return true;
 if(!current._legacyPose||!next._legacyPose)return false;
 for(const field of ['x','y','z'])if(current[field]?.length!==next[field]?.length)return false;
 for(const field of ['a','b','c','ca','cb','cc','alpha','priorities','textures','textureFaces','texA','texB','texC','override','uvs']){
  const a=current[field],b=next[field];if(a===b)continue;if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
 }
 return true;
}
