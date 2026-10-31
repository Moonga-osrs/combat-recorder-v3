/** Replace only the observed floor; retain other floors and unobserved surroundings. */
export function applyRecordedCoverage(scene:any,baseX:number,baseY:number,coverage:any){
 if(!coverage)return scene;const planes=new Set(coverage.capturedPlanes||[coverage.plane]);
 const inside=(x:number,y:number)=>x>=coverage.baseX&&x<coverage.baseX+coverage.width&&y>=coverage.baseY&&y<coverage.baseY+coverage.height,seen=new Set();
 const clear=(tile:any)=>{
  if(!tile||seen.has(tile))return;seen.add(tile);if(tile.linkedBelowTile)clear(tile.linkedBelowTile);
  if(!planes.has(tile.level))return;
  if(inside(baseX+tile.x,baseY+tile.y)){
   if(coverage.capturedTerrain)tile.tileModel=undefined;
   if(coverage.capturedObjects!==false){tile.floorDecoration=undefined;tile.wall=undefined;tile.wallDecoration=undefined;}
  }
  if(coverage.capturedObjects!==false)tile.locs=tile.locs.filter((loc:any)=>{
   if(!planes.has(loc.level))return true;
   const minX=baseX+(loc.startX??Math.floor(loc.x/128)),maxX=baseX+(loc.endX??Math.floor(loc.x/128)),minY=baseY+(loc.startY??Math.floor(loc.y/128)),maxY=baseY+(loc.endY??Math.floor(loc.y/128));
   return maxX<coverage.baseX||minX>=coverage.baseX+coverage.width||maxY<coverage.baseY||minY>=coverage.baseY+coverage.height;
  });
 };
 for(const level of scene.tiles)for(const column of level)for(const tile of column)clear(tile);return scene;
}
