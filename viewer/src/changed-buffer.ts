/** Exact byte comparison; only upload changed blocks, with a bounded call count. */
export function uploadChanged(buffer:any,previous:Uint8Array|Float32Array|null,next:Uint8Array|Float32Array){
 if(!previous||previous.byteLength!==next.byteLength){buffer.data(next);return next.byteLength;}
 const a=new Uint32Array(previous.buffer,previous.byteOffset,previous.byteLength/4),b=new Uint32Array(next.buffer,next.byteOffset,next.byteLength/4),ranges:number[][]=[];const words=4096;
 for(let start=0;start<b.length;start+=words){const end=Math.min(start+words,b.length);let changed=false;for(let i=start;i<end;i++)if(a[i]!==b[i]){changed=true;break;}if(!changed)continue;const last=ranges[ranges.length-1];if(last&&last[1]===start)last[1]=end;else ranges.push([start,end]);}
 if(ranges.length>8){buffer.data(next);return next.byteLength;}
 let bytes=0;const unit=4/next.BYTES_PER_ELEMENT;for(const [start,end] of ranges){buffer.data(next.subarray(start*unit,end*unit),start*4);bytes+=(end-start)*4;}return bytes;
}
