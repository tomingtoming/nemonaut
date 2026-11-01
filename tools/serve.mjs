import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try {let p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(p===root)p=path.join(root,'index.html');if(!p.startsWith(root+path.sep))throw Error();const b=await readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(0,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
