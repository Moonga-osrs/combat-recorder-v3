/** Small immutable GPU-ready replay chunks. Future chunks are never presented early. */
export class PreparedFrameCache {
 private entries=new Map<number,{ref:any,value:any,bytes:number}>();bytes=0;hits=0;
 constructor(readonly budget=192*1024*1024,readonly limit=128){}
 get size(){return this.entries.size;}
 has(key:number){return this.entries.has(key);}
 get(key:number){const entry=this.entries.get(key);if(!entry)return null;this.hits++;this.entries.delete(key);this.entries.set(key,entry);return entry.value;}
 latest(ms:number,minMs=-Infinity){let best:any=null;for(const entry of this.entries.values())if(entry.ref.ms<=ms&&entry.ref.ms>=minMs&&(!best||entry.ref.ms>best.ms))best=entry.ref;return best;}
 set(ref:any,value:any){const buffers=new Set<ArrayBufferLike>();for(const group of value.packed.groups)for(const name of ['vertices','nextPositions','indices','opaque','alpha'])if(group[name])buffers.add(group[name].buffer);for(const pixels of value.packed.textures.values())buffers.add(pixels.buffer);let bytes=0;for(const buffer of buffers)bytes+=buffer.byteLength;if(bytes>this.budget)return;
 this.remove(ref.start);this.entries.set(ref.start,{ref,value,bytes});this.bytes+=bytes;while(this.bytes>this.budget||this.size>this.limit)this.remove(this.entries.keys().next().value!);
 }
 pruneBefore(ms:number){for(const [key,entry] of this.entries)if(entry.ref.ms<ms)this.remove(key);}
 private remove(key:number){const entry=this.entries.get(key);if(entry){this.bytes-=entry.bytes;this.entries.delete(key);}}
 clear(){this.entries.clear();this.bytes=0;this.hits=0;}
}
