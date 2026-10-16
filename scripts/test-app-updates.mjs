import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=await readFile('public/registerSW.js','utf8');
const a={schema:1,id:'a123456',builtAt:100},b={schema:1,id:'b123456',builtAt:200};
function element(){return {children:[],dataset:{},hidden:false,disabled:false,textContent:'',listeners:{},setAttribute(){},append(...c){this.children.push(...c);},addEventListener(n,f){this.listeners[n]=f;}};}
async function boot({current=a,remote=a,remembered=null,serviceWorker=false,dirty=false}={}){
 const elements=[],events={},store=new Map([['work-pending','PRESERVAR']]);if(remembered)store.set('planots-last-verified-build',JSON.stringify(remembered));
 const state={remote,reloads:0,updates:0,messages:[],fetches:[],registered:null};
 const sw={listeners:{},addEventListener(n,f){this.listeners[n]=f;},removeEventListener(n){delete this.listeners[n];},register:async(path,options)=>{state.registered={path,options};return registration;}};
 const registration={installing:null,waiting:serviceWorker?{postMessage(message){state.messages.push(message);queueMicrotask(()=>sw.listeners.controllerchange?.());}}:null,update:async()=>{state.updates++;},addEventListener(){}};
 const win={location:{href:'https://qa.test/?release=old&portal=demo#id=conservar',reload(){state.reloads++;}},addEventListener(n,f){events[n]=f;},dispatchEvent:()=>!dirty};
 const document={head:element(),body:element(),visibilityState:'visible',querySelector(q){return {content:q.includes('built-at')?String(current?.builtAt||0):current?.id||''};},createElement(){const e=element();elements.push(e);return e;}};
 const context={window:win,document,navigator:serviceWorker?{serviceWorker:sw}:{},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},history:{state:{preserve:1},replaceState(s,unused,url){state.url=String(url);state.history=s;}},URL,Event,AbortController,setTimeout,clearTimeout,setInterval(){},Date,JSON,Number,console,fetch:async(url,options)=>{state.fetches.push({url,options});if(state.remote instanceof Error)throw state.remote;if(String(url).startsWith('https:'))return new Response(`<meta name="planots-build" content="${state.remote.id}"><meta name="planots-built-at" content="${state.remote.builtAt}">`,{headers:{'content-type':'text/html'}});return {ok:true,headers:{get:()=>state.remote==='HTML'?'text/html':'application/json'},json:async()=>state.remote};}};
 vm.runInNewContext(source,context);const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};await flush();
 return {state,events,store,notice:elements[0],label:elements[1],button:elements[2],flush,context};
}
let qa=await boot();assert.equal(qa.notice.dataset.state,'current');assert.equal(qa.state.reloads,0);assert.equal(qa.button.hidden,true);assert.match(qa.state.url,/release=a123456/);assert.match(qa.state.url,/portal=demo#id=conservar/);assert.equal(qa.state.history.preserve,1);assert.equal(qa.state.fetches[0].options.cache,'no-store');assert.equal(qa.state.fetches[0].options.credentials,'omit');
qa=await boot({remote:new Error('DNS NXDOMAIN')});assert.equal(qa.notice.dataset.state,'offline');assert.match(qa.label.textContent,/copia guardada/);assert.equal(qa.state.reloads,0);assert.equal(qa.store.get('work-pending'),'PRESERVAR');
qa.state.remote=b;qa.events.online();await qa.flush();assert.equal(qa.notice.dataset.state,'update');assert.equal(qa.state.reloads,0);assert.equal(qa.store.get('work-pending'),'PRESERVAR');
qa=await boot({remote:a,current:b,remembered:b});assert.equal(qa.notice.dataset.state,'rollback');await qa.button.listeners.click();await qa.flush();assert.equal(qa.state.reloads,0);assert.equal(JSON.parse(qa.store.get('planots-last-verified-build')).id,b.id);
qa=await boot({remote:a,current:b});assert.equal(qa.notice.dataset.state,'rollback');assert.equal(qa.state.reloads,0);
qa=await boot({remote:'HTML'});assert.equal(qa.notice.dataset.state,'offline');
qa=await boot({remote:b,serviceWorker:true});assert.equal(qa.notice.dataset.state,'update');assert.equal(qa.state.reloads,0);assert.equal(qa.state.registered.options.updateViaCache,'none');await qa.button.listeners.click();await qa.flush();assert.equal(qa.state.reloads,1);assert.equal(qa.state.messages[0].type,'SKIP_WAITING');assert.equal(qa.store.get('work-pending'),'PRESERVAR');
vm.runInNewContext(source,qa.context);await qa.flush();assert.equal(qa.state.reloads,1); // no doble registro al repetir el script
qa=await boot({remote:b,serviceWorker:true,dirty:true});await qa.button.listeners.click();await qa.flush();assert.equal(qa.notice.dataset.state,'dirty');assert.equal(qa.state.reloads,0);assert.equal(qa.state.messages.length,0);assert.equal(qa.store.get('work-pending'),'PRESERVAR');

// Se ejecutan los handlers que Workbox serializa en el service worker real.
const config=await readFile('vite.config.ts','utf8'),ast=ts.createSourceFile('vite.config.ts',config,ts.ScriptTarget.Latest,true);
const handlers={};function visit(node){if(ts.isPropertyAssignment(node)&&['cacheKeyWillBeUsed','fetchDidSucceed','handlerDidError'].includes(node.name.getText(ast)))handlers[node.name.getText(ast)]=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);
const html=n=>new Response(`<meta name="planots-built-at" content="${n}">`,{headers:{'content-type':'text/html'}});
const cache={match:async()=>html(200)},scope={URL,Response,caches:{open:async()=>cache,match:async()=>html(200)},self:{location:{origin:'https://qa.test'}}};
const handler=name=>vm.runInNewContext(`(${handlers[name]})`,scope);
const request={url:'https://qa.test/?release=old&portal=demo'};
assert.equal(await handler('cacheKeyWillBeUsed')({request}),'https://qa.test/?portal=demo');
await assert.rejects(handler('fetchDidSucceed')({request,response:html(100)}),/anterior/);
await assert.rejects(handler('fetchDidSucceed')({request,response:new Response('Servidor caído',{status:503})}),/válida/);
await assert.rejects(handler('fetchDidSucceed')({request,response:new Response('<html>antiguo</html>')}),/anterior/);
assert.match(await (await handler('fetchDidSucceed')({request,response:html(300)})).text(),/300/);
assert.match(await (await handler('handlerDidError')()).text(),/200/);

const manifest=JSON.parse(await readFile('dist/version.json','utf8')),index=await readFile('dist/index.html','utf8'),sw=await readFile('dist/sw.js','utf8');
assert.match(index,new RegExp(`name="planots-build" content="${manifest.id}"`));assert.match(index,new RegExp(`name="planots-built-at" content="${manifest.builtAt}"`));
assert.equal((index.match(/src="\/registerSW.js"/g)||[]).length,1);assert.match(sw,/NetworkFirst/);assert.doesNotMatch(sw,/url:"registerSW\.js"/);assert.doesNotMatch(sw,/url:"version\.json"/);
const headers=await readFile('public/_headers','utf8');for(const path of ['/','/index.html','/version.json','/registerSW.js'])assert.ok(headers.includes(`${path}\n  Cache-Control: no-cache, no-store, must-revalidate`));
await mkdir('output/app-update-20261015',{recursive:true});await writeFile('output/app-update-20261015/pruebas.json',JSON.stringify({resultado:'PASS',controles:['DNS fallido visible, sin recarga ni pérdida de trabajo','reconexión detecta versión nueva','sin actualización silenciosa ni bucles','actualización explícita y espera del controlador','respuesta antigua no sustituye una versión más reciente','URLs conservan portal, hash y estado','manifest y HTML identifican la misma compilación','registro y manifest fuera del precache','HTML con red primero y copia offline de respaldo']},null,2));console.log('PASS: actualización explícita, modo offline visible y protección contra respuestas antiguas.');
