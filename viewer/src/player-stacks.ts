/** Seeded player ranking keeps each tile's random choice stable across frames and seeks. */
export function collapsePlayerStacks(frame:any,enabled:boolean,seed:number){
 if(!enabled)return frame;const winners=new Map<string,any>(),players=new Set<any>();
 const rank=(id:string)=>{let hash=seed>>>0;for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);hash^=hash>>>16;return hash>>>0;};
 for(const actor of frame.actors){
  if(!(actor.self||actor.kind==='player'||!actor.kind&&/^p\d+(?::\d+)?$/.test(String(actor.id)))||!Number.isFinite(actor.x)||!Number.isFinite(actor.z))continue;
  players.add(actor);const key=[actor.worldView??frame.worldView,actor.plane??frame.plane,Math.floor(actor.x/128),Math.floor(actor.z/128)].join(':'),previous=winners.get(key);
  if(!previous||actor.self&&!previous.self||!previous.self&&!actor.self&&(rank(String(actor.id))<rank(String(previous.id))||rank(String(actor.id))===rank(String(previous.id))&&String(actor.id)<String(previous.id)))winners.set(key,actor);
 }
 const visible=new Set(winners.values()),hiddenIds=new Set<string>();for(const actor of players)if(!visible.has(actor))hiddenIds.add(String(actor.id));
 const actors=frame.actors.filter((actor:any)=>{
  if(players.has(actor))return visible.has(actor);
  if(actor.kind==='actorGfx'){const id=String(actor.id),split=id.indexOf(':gfx:');if(split>=0&&hiddenIds.has(id.slice(0,split)))return false;}
  return true;
 });return {...frame,actors,hiddenPlayers:players.size-visible.size};
}
