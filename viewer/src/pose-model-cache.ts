/** Bounded worker-local immutable model cache; positions are applied during packing. */
export class PoseModelCache {
 private entries=new Map<string,{model:any,bytes:number}>();bytes=0;hits=0;misses=0;
 constructor(readonly budget=16*1024*1024,readonly limit=512){}
 get size(){return this.entries.size;}
 get(key:string){const entry=this.entries.get(key);if(!entry){this.misses++;return null;}this.entries.delete(key);this.entries.set(key,entry);this.hits++;return entry.model;}
 set(key:string,model:any){let bytes=512+(model.faceCount||0)*160;for(const value of Object.values(model))if(ArrayBuffer.isView(value))bytes+=value.byteLength;
  if(bytes>this.budget)return;const old=this.entries.get(key);if(old){this.bytes-=old.bytes;this.entries.delete(key);}this.entries.set(key,{model,bytes});this.bytes+=bytes;
  while(this.bytes>this.budget||this.entries.size>this.limit){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.bytes;this.entries.delete(first);}
 }
 stats(){return {hits:this.hits,misses:this.misses,bytes:this.bytes,size:this.size};}
}
