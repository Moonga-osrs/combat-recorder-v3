// Recover delayed ground-effect starts in older recordings without changing their files.
export class EffectVisibility {
 starts=new Map<string,number>();
 private pending=new Map<string,any[]>();
 private seen=new Set<string>();
 private previous=new Map<string,number>();
 private key(view:any,plane:any,id:any,x:any,z:any){return [view,plane,id,x,z].join(':');}
 observe(row:any){
  const d=row.data;
  if(row.type==='effect'&&d?.local){const key=this.key(d.worldView,d.plane,d.id,d.local.x,d.local.y),list=this.pending.get(key)||[];list.push({cycle:row.cycle,start:d.startCycle});this.pending.set(key,list);}
  if(row.type!=='frame3d')return;
  const context=[d.worldView,d.baseX,d.baseY,d.plane].join(':'),previous=this.previous.get(context)??-Infinity;
  for(const a of d.actors||[]){if(a.kind!=='groundGfx'||this.seen.has(a.id))continue;this.seen.add(a.id);
   if(Number.isFinite(a.startCycle)){this.starts.set(a.id,a.startCycle);continue;}
   const key=this.key(d.worldView,d.plane,a.gfxId,a.x,a.z),events=this.pending.get(key)||[],candidates=events.filter(e=>e.cycle>=previous&&e.cycle<=row.cycle);
   // Ambiguous old events are left unchanged rather than inventing visibility.
   if(candidates.length===1&&Number.isFinite(candidates[0].start))this.starts.set(a.id,candidates[0].start);
  }
  this.previous.set(context,row.cycle);
  // Creation events are only needed until their first sampled frame.
  for(const [key,events] of this.pending){const recent=events.filter(e=>e.cycle>=row.cycle);if(recent.length)this.pending.set(key,recent);else this.pending.delete(key);}
 }
}
export function visibleEffects(frame:any,cycle:number,starts:Map<string,number>){
 return {...frame,actors:(frame.actors||[]).filter((a:any)=>{const start=a.startCycle??starts.get(a.id);return start===undefined||start<=cycle;})};
}
