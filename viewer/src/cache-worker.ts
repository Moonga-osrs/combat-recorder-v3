import {recoverInstanceParts} from './instance-recovery';
import {createState} from './cache-state';
import {SdMapDataLoader} from '../engine/src/mapviewer/webgl/loader/SdMapDataLoader';
import {packRecorded} from './pack-recorded';
import {SpriteLoader} from '../engine/src/rs/sprite/SpriteLoader';
import {applyRecordedCoverage} from './recorded-coverage';
let state:any,loader=new SdMapDataLoader(),chain=Promise.resolve();
self.onmessage=({data})=>{chain=chain.then(async()=>{
 try{let value:any,transfer:Transferable[]=[];const input=data.input;
  if(data.method==='init'){state=await createState(input.cache,[],[]);value=true;}
  else if(data.method==='map'){const result=await loader.load(state,input);value=result.data;transfer=result.transferables||[];state.locModelLoader.clearCache();state.objModelLoader.clearCache();state.npcModelLoader.clearCache();}
  else if(data.method==='texture'){value=state.textureLoader.getPixelsArgb(input.id,input.size,input.flipH,input.brightness);transfer=[value.buffer];}
  else if(data.method==='sprite'){
   const index=state.cacheSystem.getIndex(8),archive=input.name?index.getArchiveId(input.name):input.archive;
   const sprite=SpriteLoader.loadIntoIndexedSprites(index,archive)?.[input.sprite||0];
   if(!sprite)value=null;
   else{const pixels=new Uint8ClampedArray(sprite.subWidth*sprite.subHeight*4);for(let i=0;i<sprite.pixels.length;i++){const palette=sprite.pixels[i];if(!palette)continue;const color=sprite.palette[palette];pixels[i*4]=color>>16;pixels[i*4+1]=color>>8;pixels[i*4+2]=color;pixels[i*4+3]=255;}value={pixels,width:sprite.subWidth,height:sprite.subHeight,x:sprite.xOffset,y:sprite.yOffset};transfer=[pixels.buffer];}
  }
  else if(data.method==='replay'){const result=packRecorded(state,input);value=result.value;transfer=result.transferables;}
  else if(data.method==='coverage'){
   if(!state.originalBuild){state.originalBuild=state.sceneBuilder.buildScene.bind(state.sceneBuilder);state.sceneBuilder.buildScene=(baseX:number,baseY:number,...args:any[])=>{
    return applyRecordedCoverage(state.originalBuild(baseX,baseY,...args),baseX,baseY,state.replayCoverage);
   };}
   state.replayCoverage=input;value=true;
  }
  else if(data.method==='reset'){loader.reset();value=true;}
  else if(data.method==='instance-parts')value=recoverInstanceParts(state,input);
  else if(data.method==='map-inspect'){value={locBytes:state.sceneBuilder.getLocData(input.x,input.y)?.length||0};}
  else if(data.method==='vars'){state.varManager.values.set(input);value=true;}
  else throw Error('Unknown cache request');
  postMessage({id:data.id,value},transfer);
 }catch(error:any){postMessage({id:data.id,error:error.message});}
 });};

