import {Recording} from './recording';
export async function openRecording(file:File,progress:(n:number)=>void,signal?:AbortSignal){
 const worker=new Worker('/recording-worker.js',{type:'module'}),pending=new Map<number,any>();let sequence=0,closed=false;
 const request=(method:string,input:any)=>new Promise<any>((resolve,reject)=>{if(closed){reject(Error('Recording closed'));return;}const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,...input});});
 worker.onmessage=({data})=>{if(data.progress!==undefined){progress(data.progress);return;}const item=pending.get(data.id);if(!item)return;pending.delete(data.id);if(data.error)item.reject(Error(data.error));else item.resolve(data.value);};
 worker.onerror=event=>{for(const item of pending.values())item.reject(Error(event.message||'Recording worker stopped'));pending.clear();close();};
 const close=()=>{closed=true;worker.terminate();for(const item of pending.values())item.reject(Error('Recording closed'));pending.clear();signal?.removeEventListener('abort',close);};
 if(signal?.aborted){close();throw Error('Recording load cancelled');}signal?.addEventListener('abort',close,{once:true});
 try{
  const index=await request('index',{file}),recording=new Recording(file);Object.assign(recording,index);
  recording.prepareWindow=(start,end)=>request('prepare-window',{start,end});recording.meshProvider=id=>request('mesh',{idValue:id});recording.meshBatchProvider=ids=>request('meshes',{ids});recording.sceneProvider=(ref,includeGround)=>request('scene',{ref,includeGround});recording.dispose=close;
  return recording;
 }catch(error){close();throw error;}
}
