/** LRU decoded meshes, bounded by retained bytes and pending/ready entry count. */
export class MeshResourceCache extends Map<string,Promise<any>> {
 private weights=new Map<string,Set<ArrayBufferLike>>();private buffers=new Map<ArrayBufferLike,number>();bytes=0;hits=0;misses=0;
 constructor(readonly budget=64*1024*1024,readonly limit=8192){super();}
 get(key:string){const value=super.get(key);if(value){this.hits++;super.delete(key);super.set(key,value);}else this.misses++;return value;}
 set(key:string,pending:Promise<any>){this.delete(key);super.set(key,pending);this.trim();pending.then(mesh=>{
  if(super.get(key)!==pending)return;const buffers=new Set<ArrayBufferLike>();for(const value of Object.values(mesh||{}))if(ArrayBuffer.isView(value))buffers.add(value.buffer);this.weights.set(key,buffers);for(const buffer of buffers){const refs=this.buffers.get(buffer)||0;if(!refs)this.bytes+=buffer.byteLength;this.buffers.set(buffer,refs+1);}this.trim();
 },()=>{if(super.get(key)===pending)this.delete(key);});return this;}
 delete(key:string){for(const buffer of this.weights.get(key)||[]){const refs=this.buffers.get(buffer)!;if(refs===1){this.buffers.delete(buffer);this.bytes-=buffer.byteLength;}else this.buffers.set(buffer,refs-1);}this.weights.delete(key);return super.delete(key);}
 clear(){super.clear();this.weights.clear();this.buffers.clear();this.bytes=0;}
 private trim(){while(this.size>this.limit||this.bytes>this.budget)this.delete(this.keys().next().value!);}
}
