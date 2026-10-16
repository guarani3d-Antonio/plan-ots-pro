// Servidor aislado: sirve únicamente fixtures y el build local. No usa Supabase.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const versions={a:{schema:1,id:'a123456',builtAt:100},b:{schema:1,id:'b123456',builtAt:200}};
let mode='a';const folder=resolve('dist');
const controllerProbe=`<p id="qa-controller" role="status">Controlador pendiente</p><script>function showController(){const worker=navigator.serviceWorker.controller;if(!worker)return;const channel=new MessageChannel();channel.port1.onmessage=event=>{document.getElementById('qa-controller').textContent='Controlador '+event.data.id+' ('+event.data.builtAt+')';channel.port1.close();};worker.postMessage({type:'PLANOTS_BUILD'},[channel.port2]);}navigator.serviceWorker.addEventListener('controllerchange',showController);showController();</script>`;
const page=v=>`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="planots-build" content="${v.id}"><meta name="planots-built-at" content="${v.builtAt}"><title>Prueba aislada de actualizaciones</title><script src="/registerSW.js" defer></script><style>body{font:15px system-ui;margin:0;background:#edf1f7;color:#172238}header{background:#3d589d;color:white;padding:18px}main{margin:24px auto;max-width:800px;background:white;padding:24px;border-radius:10px}textarea{display:block;width:90%;min-height:80px;margin:12px 0}button{padding:9px;border:1px solid #d6ddeb;border-radius:7px;background:white;color:#3d589d}a{color:#3d589d}</style></head><body><header>Plan-OTs · ensayo local de actualización</header><main><small>Datos ficticios · sin conexión a la base real</small><h2>Interfaz ${v.id}</h2><label>Edición de prueba<textarea aria-label="Edición de prueba" placeholder="Texto que debe permanecer mientras se ofrece una actualización"></textarea></label><button onclick="window.dispatchEvent(new Event('online'))">Comprobar versión</button><p><a href="/qa/controls" target="_blank">Controles del servidor de ensayo</a></p></main></body></html>`;
const controls=()=>`<!doctype html><html lang="es"><head><title>Controles de versiones QA</title></head><body><h2>Servidor aislado · estado ${mode}</h2><form method="post" action="/qa/scenario"><button name="mode" value="a">Entregar versión anterior A</button><button name="mode" value="b">Publicar versión nueva B</button><button name="mode" value="offline">Simular conexión fallida</button></form></body></html>`;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5185');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/qa/scenario'&&req.method==='POST'){let body='';for await(const part of req)body+=part;const selected=new URLSearchParams(body).get('mode');if(['a','b','offline'].includes(selected))mode=selected;res.writeHead(303,{Location:'/qa/controls'});res.end();return;}
  if(url.pathname==='/qa/controls'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(controls());return;}
  if(url.pathname==='/version.json'){res.setHeader('Content-Type','application/json');if(mode==='offline'){res.statusCode=503;res.end('{}');}else res.end(JSON.stringify(versions[mode]));return;}
  if(url.pathname==='/'||url.pathname==='/index.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page(versions[mode==='offline'?'b':mode]).replace('</body>',controllerProbe+'</body>'));return;}
  if(url.pathname.startsWith('/sw-version-')){res.setHeader('Content-Type','text/javascript');res.end(`self.__planotsBuild=${JSON.stringify(versions[mode==='a'?'a':'b'])};self.addEventListener('message',event=>{if(event.data?.type==='PLANOTS_BUILD')event.ports[0]?.postMessage(self.__planotsBuild);});`);return;}
  const path=resolve(folder,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(folder+sep)){res.writeHead(404);res.end();return;}
  const mime={'.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2'};
  res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end('No encontrado');}
}).listen(5185,'127.0.0.1',()=>console.log('QA de versiones: http://127.0.0.1:5185/'));
