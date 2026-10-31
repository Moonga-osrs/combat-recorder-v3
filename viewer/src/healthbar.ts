/** Public RuneLite healthScale is the observed bar scale, not the NPC's maximum HP. */
export function healthBarGeometry(ratio:number,scale:number){
 if(!Number.isFinite(ratio)||!Number.isFinite(scale)||ratio<0||scale<=0)return null;
 const width=Math.max(1,Math.floor(scale)),fraction=Math.max(0,Math.min(1,ratio/scale));
 return {width,filled:ratio>0?Math.max(1,Math.floor(width*fraction)):0,height:5};
}
