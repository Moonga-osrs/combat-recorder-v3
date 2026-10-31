/** Share sequential file reads across the many mesh resources belonging to one pose. */
export class FileBlocks {
 private pages=new Map<number,Promise<Uint8Array>>();private decoder=new TextDecoder();reads=0;
 constructor(private file:Blob,private size=1024*1024,private capacity=16){}
 private page(index:number){
  let pending=this.pages.get(index);if(pending){this.pages.delete(index);this.pages.set(index,pending);return pending;}
  this.reads++;pending=this.file.slice(index*this.size,(index+1)*this.size).arrayBuffer().then(data=>new Uint8Array(data));this.pages.set(index,pending);
  while(this.pages.size>this.capacity)this.pages.delete(this.pages.keys().next().value!);return pending;
 }
 async text(start:number,end:number){
  if(start<0||end<start||end>this.file.size)throw Error('Invalid recording byte range');if(start===end)return '';
  const first=Math.floor(start/this.size),last=Math.floor((end-1)/this.size),pages=await Promise.all(Array.from({length:last-first+1},(_,i)=>this.page(first+i)));
  if(first===last)return this.decoder.decode(pages[0].subarray(start-first*this.size,end-first*this.size));
  const bytes=new Uint8Array(end-start);let written=0;
  for(let i=0;i<pages.length;i++){const base=(first+i)*this.size,chunk=pages[i].subarray(Math.max(0,start-base),Math.min(pages[i].length,end-base));bytes.set(chunk,written);written+=chunk.length;}
  return this.decoder.decode(bytes);
 }
}
