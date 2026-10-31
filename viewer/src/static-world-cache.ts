/** Prepared render packets only; prefetching never activates future objects. */
export class StaticWorldCache {
 private entries=new Map<string,{packet:any,bytes:number}>();private pinned='';bytes=0;hits=0;
 constructor(readonly budget=256*1024*1024){}
 get size(){return this.entries.size;}
 get(key:string){const entry=this.entries.get(key);if(!entry)return null;this.hits++;this.entries.delete(key);this.entries.set(key,entry);return entry.packet;}
 pin(key:string){this.pinned=key;}
 clear(){this.entries.clear();this.bytes=0;this.hits=0;this.pinned='';}
 set(key:string,packet:any){
  const old=this.entries.get(key);if(old){this.bytes-=old.bytes;this.entries.delete(key);}
  let bytes=0;for(const group of packet.groups)for(const name of ['vertices','nextPositions','indices','opaque','alpha'])bytes+=group[name]?.byteLength||0;
  for(const pixels of packet.textures.values())bytes+=pixels.byteLength;
  for(const ground of packet.recoveryGround||[])for(const value of Object.values(ground))if(ArrayBuffer.isView(value))bytes+=value.byteLength;else if(Array.isArray(value))bytes+=value.length*8;
  if(bytes>this.budget)return;
  this.entries.set(key,{packet,bytes});this.bytes+=bytes;
  for(const [candidate,entry] of this.entries){if(this.bytes<=this.budget)break;if(candidate===this.pinned)continue;this.entries.delete(candidate);this.bytes-=entry.bytes;}
 }
}
