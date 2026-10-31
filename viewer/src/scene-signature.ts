/** Reuse unchanged scene geometry; legacy inline geometry has no content ID and must be refreshed. */
export function sceneSignature(frame:any,scene:any,checkpoint:number|undefined,objects:any[],includeTerrain=!!frame.instanced){
 const groundIds=includeTerrain?scene?.groundIds||[]:[];
 const legacy=objects.some(part=>!part.mesh)||groundIds.some(id=>!id);
 return [frame.baseX,frame.baseY,frame.plane,frame.worldView,!!frame.instanced,legacy?checkpoint:'',...objects.map(part=>[part.key,part.mesh,part.x,part.z,part.height,part.orientation].join(',')),...groundIds].join('|');
}
