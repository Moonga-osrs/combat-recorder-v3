const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),cacheRoot=process.env.MOONGA_CACHE_DIR||path.join(process.env.LOCALAPPDATA||path.join(require('os').homedir(),'.local','share'),'Moonga','world-cache','2752');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.map':'application/json'};
const server=http.createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-cache');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 let url;try{url=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);return res.end();}
 let file;if(url==='/cache/list.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify((fs.existsSync(cacheRoot)?fs.readdirSync(cacheRoot):[]).filter(n=>/^main_file_cache\.(dat2|idx\d+)$/.test(n))));}
 if(url==='/cache/metadata.json')file=path.join(cacheRoot,'world-cache.json');
 else if(/^\/cache\/main_file_cache\.(dat2|idx\d+)$/.test(url))file=path.join(cacheRoot,path.basename(url));
 else{file=path.resolve(root,'dist','.'+(url==='/'?'/index.html':url));if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);return res.end();}}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);});
});
server.listen(Number(process.env.PORT||8793),'127.0.0.1',()=>console.log('Moonga Combat Replay v3: http://127.0.0.1:'+(process.env.PORT||8793)));
