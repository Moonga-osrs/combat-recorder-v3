const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
function shader(file,seen=new Set()){
 if(seen.has(file))throw Error('Recursive shader include: '+file);const next=new Set(seen).add(file);
 return fs.readFileSync(file,'utf8').replace(/^\s*#include\s+["<]([^">]+)[">];?\s*$/gm,(_,name)=>shader(path.resolve(path.dirname(file),name),next));
}
const plugins=[{name:'engine-adapters',setup(b){
 b.onResolve({filter:/^\/settings-panel\.js$/},()=>({path:'/settings-panel.js',external:true}));
 b.onResolve({filter:/WebGPUMapViewerRenderer$/},()=>({path:'webgpu-disabled',namespace:'adapter'}));
 b.onLoad({filter:/.*/,namespace:'adapter'},()=>({contents:'export class WebGPUMapViewerRenderer {static isSupported(){return false;} constructor(){throw Error("This replay uses the native WebGL2 renderer.");}}',loader:'js'}));
 b.onLoad({filter:/\.glsl$/},args=>({contents:shader(args.path),loader:'text'}));
 b.onLoad({filter:/[\\/]Bzip2.ts$/},()=>({contents:`const bzip2=require('bzip2');export class Bzip2 {static async initWasm(){}static decompress(data,size){const b=new Uint8Array(data.length+4);b.set([66,90,104,49]);b.set(data,4);return new Int8Array(bzip2.simple(bzip2.array(b)));}}`,loader:'ts'}));
}}];
async function build(){fs.mkdirSync(path.join(root,'dist'),{recursive:true});for(const name of ['app','cache-worker','recording-worker','settings-panel'])await esbuild.build({absWorkingDir:root,entryPoints:[`src/${name}.ts`],bundle:true,format:'esm',target:'es2022',platform:'browser',outfile:`dist/${name}.js`,plugins,sourcemap:true,logLevel:'warning'});fs.cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});}
build().catch(e=>{console.error(e);process.exitCode=1;});

