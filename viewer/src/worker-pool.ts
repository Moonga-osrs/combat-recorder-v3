export class ReplayWorkerPool {
 size=1;worker=new Worker('/cache-worker.js',{type:'module'});sequence=0;pending=new Map<number,any>();ready:Promise<any>=Promise.resolve();
 constructor(){this.worker.onmessage=({data})=>{const job=this.pending.get(data.id);if(!job)return;this.pending.delete(data.id);if(data.error)job.reject(Error(data.error));else job.resolve(data.value);};this.worker.onerror=e=>{for(const job of this.pending.values())job.reject(Error(e.message));this.pending.clear();};}
 request(method:string,input:any){return new Promise((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,input});});}
 initCache(cache:any,objSpawns:any[],npcSpawns:any[]){this.ready=this.request('init',{cache,objSpawns:[],npcSpawns:[]});}
 initLoader(){return this.ready;}
 resetLoader(){return this.ready.then(()=>this.request('reset',null));}
 queueLoad(loader:any,input:any){return this.ready.then(()=>this.request('map',input));}
 queueLoadTexture(id:number,size:number,flipH:boolean,brightness:number){return this.ready.then(()=>this.request('texture',{id,size,flipH,brightness}));}
 loadCachedMapImages(){return Promise.resolve(new Map());}
 setVars(vars:Int32Array){return this.ready.then(()=>this.request('vars',vars));}
 terminate(){this.worker.terminate();}
}
