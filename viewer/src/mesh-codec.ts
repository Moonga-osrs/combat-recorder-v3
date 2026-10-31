import {unzlibSync} from 'fflate';
const fields=['x','y','z','a','b','c','ca','cb','cc','alpha','textures','textureFaces','texA','texB','texC','override','priorities','uvs'];
const widths=[4,4,4,4,4,4,4,4,4,1,2,1,4,4,4,4,1,4];
function legacyGeometry(geometry:any){
 const result={...geometry};let size=0;const present=fields.map((key,id)=>({key,id,value:geometry[key]})).filter(field=>Array.isArray(field.value)||ArrayBuffer.isView(field.value));
 for(const field of present)size+=(field.value.length*widths[field.id]+3)&~3;
 const buffer=typeof SharedArrayBuffer!=='undefined'?new SharedArrayBuffer(size):new ArrayBuffer(size);let offset=0;
 for(const {key,id,value} of present){const array=id<=2||id===17?new Float32Array(buffer,offset,value.length):widths[id]===1?new Int8Array(buffer,offset,value.length):widths[id]===2?new Int16Array(buffer,offset,value.length):new Int32Array(buffer,offset,value.length);array.set(value);result[key]=array;offset=(offset+value.length*widths[id]+3)&~3;}
 return result;
}
export function decodeMesh(resource:any){
 if(resource.geometry)return legacyGeometry(resource.geometry);if(resource.encoding!=='m3d1-zlib')throw Error('Unknown mesh encoding: '+resource.encoding);
 return decodeInflated(unzlibSync((Uint8Array as any).fromBase64?(Uint8Array as any).fromBase64(resource.payload):Uint8Array.from(atob(resource.payload),c=>c.charCodeAt(0))));
}
function decodeInflated(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<12||view.getUint32(0,true)!==0x3144334d||view.getUint32(4,true)!==1)throw Error('Invalid mesh header');
 // One shared immutable allocation per resource; worker messages can reuse it without cloning every face.
 const buffer=typeof SharedArrayBuffer!=='undefined'?new SharedArrayBuffer(bytes.length):new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);
 const mesh:any={};let offset=12;for(let i=0,n=view.getUint32(8,true);i<n;i++){
  if(offset+8>bytes.length)throw Error('Truncated mesh field');const id=view.getUint32(offset,true),length=view.getUint32(offset+4,true);offset+=8;
  if(id>=fields.length||length>100000000||offset+length*widths[id]>bytes.length)throw Error('Invalid mesh field');
  mesh[fields[id]]=id<=2||id===17?new Float32Array(buffer,offset,length):widths[id]===1?new Int8Array(buffer,offset,length):widths[id]===2?new Int16Array(buffer,offset,length):new Int32Array(buffer,offset,length);offset=(offset+length*widths[id]+3)&~3;
 }
 return mesh;
}
