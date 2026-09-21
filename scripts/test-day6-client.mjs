import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const results=[];
const shared={navigator:{onLine:true},AbortController,AbortSignal,URL,Headers,Request,Response,atob,setTimeout,clearTimeout,console};
async function load(path,mocks={},extra={}){
 const source=await readFile(path,'utf8'),module={exports:{}};
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{...shared,...extra,module,exports:module.exports,require:key=>{if(!(key in mocks))throw Error('Import no autorizado '+key);return mocks[key];}});
 return module.exports;
}
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message.split('\n')[0]});}}
const security=await load('src/security/sessionScope.ts');
const token=id=>'x.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.x';
const options=id=>({headers:{authorization:'Bearer '+token(id)}});
const endpoint='https://example.test/rest/v1/ordenes';
await test('sin identidad: no envía peticiones de datos',async()=>{let calls=0;const f=security.createSessionFetch(async()=>{calls++;return new Response('{}');});await assert.rejects(()=>f(endpoint,options('A')));assert.equal(calls,0);});
await test('token de otra identidad no sale a la red',async()=>{security.bindIdentity('A');let calls=0;const f=security.createSessionFetch(async()=>{calls++;return new Response('{}');});await assert.rejects(()=>f(endpoint,options('B')));assert.equal(calls,0);});
await test('respuesta de A retrasada después de cambiar a B se descarta',async()=>{security.bindIdentity('A');let finish;const f=security.createSessionFetch(()=>new Promise(r=>finish=r));const pending=f(endpoint,options('A'));security.bindIdentity('B');finish(new Response('{"private":"A"}'));await assert.rejects(()=>pending);});
await test('cambio de cuenta aborta señal de petición en curso',async()=>{security.bindIdentity('A');let signal;const f=security.createSessionFetch(async(_i,o)=>{signal=o.signal;security.bindIdentity('B');return new Response('{}');});await assert.rejects(()=>f(endpoint,options('A')));assert(signal.aborted);});
await test('respuesta vigente y vacía conserva contrato HTTP',async()=>{security.bindIdentity('A');let cache;const f=security.createSessionFetch(async(_i,o)=>{cache=o.cache;return new Response(null,{status:204});});assert.equal((await f(endpoint,options('A'))).status,204);assert.equal(cache,'no-store');});
await test('offline no permite nuevas peticiones ni fallback',async()=>{shared.navigator.onLine=false;await assert.rejects(()=>security.createSessionFetch(fetch)(endpoint,options('A')));shared.navigator.onLine=true;});
await test('almacenamiento local tiene clave diferente por identidad',async()=>{security.bindIdentity('A');const a=security.scopedKey('contratistas');security.bindIdentity('B');assert.notEqual(security.scopedKey('contratistas'),a);});
const dbBomb=new Proxy({},{get(){throw Error('Se accedió al legado sin identidad');}});
await test('sync no lee ni modifica la cola legada',async()=>{const sync=await load('src/sync/SyncManager.ts',{'../db/dexie':{db:dbBomb},'../security/sessionScope':security,'../db/supabase':{supabase:{}},'../data/ordenMapper':{},'../services/storageService':{},'../services/fotosService':{}});await sync.procesarSyncQueue();});
const mapper=await load('src/data/ordenMapper.ts');
const create=init=>{let state;const set=patch=>state={...state,...(typeof patch==='function'?patch(state):patch)};state=init(set,()=>state);return Object.assign(()=>state,{getState:()=>state,setState:set});};
await test('validación iniciada sin red puede reintentarse al reconectar',async()=>{
 let calls=0;
 const access=await load('src/stores/accessStore.ts',{'zustand':{create},'../db/supabase':{supabase:{rpc:async()=>{calls++;return {data:{creador:false,empresas:[],obras:[]},error:null};}}},'../security/sessionScope':security});
 security.bindIdentity('A');shared.navigator.onLine=false;
 await access.useAccessStore.getState().refresh();assert.equal(access.useAccessStore.getState().disponible,false);assert.equal(calls,0);
 shared.navigator.onLine=true;await access.useAccessStore.getState().refresh();assert.equal(calls,1);assert.equal(access.useAccessStore.getState().disponible,true);
});
let response={data:[],error:null},allow=true,privateCalls=0;
const remote={from(){privateCalls++;const q={};for(const m of ['select','insert','update','delete','eq','in','is','order','single'])q[m]=()=>q;q.then=(ok,bad)=>Promise.resolve(typeof response==='function'?response():response).then(ok,bad);return q;}};
const store=await load('src/stores/ordenesStore.ts',{'zustand':{create},'uuid':{v4:()=> 'new-id'},'../db/supabase':{supabase:remote},'./authStore':{useAuthStore:{getState:()=>({user:{id:'A'}})}},'./accessStore':{exigirPermiso:()=>{if(!allow)throw Error('denied');}},'../security/sessionScope':security,'../data/ordenMapper':mapper});
const st=store.useOrdenesStore;
await test('fallo de lectura vacía las órdenes y no lee caché',async()=>{security.bindIdentity('A');st.setState({ordenes:[{id:'old',proyecto_id:'P'}]});response={data:null,error:{message:'Sin permiso'}};await st.getState().cargarOrdenes('P');assert.equal(st.getState().ordenes.length,0);assert(st.getState().error);});
await test('rechazo de creación no publica OT ni encola',async()=>{response={data:null,error:{message:'rechazado'}};await assert.rejects(()=>st.getState().crearOrdenEnPosicion('P',.2,.3));assert.equal(st.getState().ordenes.length,0);});
await test('rechazo de edición conserva estado confirmado',async()=>{st.setState({ordenes:[{id:'old',proyecto_id:'P',ot:'Original'}]});await assert.rejects(()=>st.getState().actualizarOrden('old',{ot:'Falso'}));assert.equal(st.getState().ordenes[0].ot,'Original');});
await test('rechazo de borrado conserva la orden visible',async()=>{await assert.rejects(()=>st.getState().eliminarOrden('old'));assert.equal(st.getState().ordenes.length,1);});
await test('rol lector rechaza mutación antes de pedirla al servidor',async()=>{allow=false;const before=privateCalls;await assert.rejects(()=>st.getState().actualizarOrden('old',{ot:'NO'}));assert.equal(privateCalls,before);allow=true;});
await test('lectura tardía no repuebla store tras limpiar/cambiar obra',async()=>{security.bindIdentity('A');let done;response=()=>new Promise(r=>done=r);const pending=st.getState().cargarOrdenes('P');await Promise.resolve();st.getState().limpiar();done({data:[{id:'old',proyecto_id:'P',ot:'NO'}],error:null});await pending;assert.equal(st.getState().ordenes.length,0);});
await test('costo viene de relación protegida; cero se conserva',async()=>{assert.equal(mapper.rowToOrden({costo:null,orden_costos:{costo:0}}).costo,0);assert.equal(mapper.rowToOrden({costo:null,orden_costos:null}).costo,undefined);assert.equal(mapper.ordenPatchToRow({costo:0},{updated_at:'x'}).costo,0);});
await test('fotos pendientes legadas no se leen en modo conectado',async()=>{const f=await load('src/services/fotosService.ts',{'../db/supabase':{supabase:{}},'../db/dexie':{db:dbBomb},'../security/sessionScope':security,'../stores/accessStore':{exigirPermiso:()=>{}},'./storageService':{}});assert.equal((await f.cargarFotosPendientesDeOrden('old')).length,0);await assert.rejects(()=>f.encolarFotoOffline({},'o','p','ANTES'));});
const report={testedAt:new Date().toISOString(),scope:'Módulos TypeScript reales con red/stores simulados. No sustituye navegador ni Supabase real.',passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/estabilizacion-2026-09-20/dia-6/client-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
