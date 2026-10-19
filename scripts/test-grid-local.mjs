import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {create} from 'zustand';
const load=async(path,mocks={})=>{
  const module={exports:{}};
  const compiled=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{module,exports:module.exports,require:key=>{if(!(key in mocks))throw Error('Import no previsto: '+key);return mocks[key]},console,Error,navigator:{onLine:true},AbortController,AbortSignal,URL,Headers,Request,Response,atob,crypto});
  return module.exports;
};
const calculations=await load('src/utils/calculos.ts');
const model=await load('src/services/gridModel.ts',{'../utils/calculos':calculations});
const pagination=await load('src/services/paginatedRead.ts');
const security=await load('src/security/sessionScope.ts');
const mapper=await load('src/data/ordenMapper.ts');
const nav=await load('src/services/gridNavigation.ts');
assert.equal(model.normalizarBusqueda('  REFACCIÓN   Muñoz  '),'refaccion munoz');
assert.equal(model.normalizarBusqueda(['Albañilería',{unidad:'Torre Ñ'}]),'albanileria torre n');
assert(model.compararValores('OT-2','OT-10')<0);
assert(model.compararValores(9,10)<0);
const closed={estado:'No aplica',fecha_ingreso:'2026-10-01',fecha_fin_trabajos:'2026-10-11'};
assert.equal(model.diasOrden(closed),10);
const all=Array.from({length:1350},(_,i)=>({id:String(i).padStart(5,'0'),rubro:i%2?'Eléctrica':'Albañilería'}));
const visited=new Set();
for(let page=1;page<=18;page++){
 const p=model.paginaGrilla(all,page);assert.equal(p.items.length,75);assert.equal(p.total,18);
 p.items.forEach(r=>{assert(!visited.has(r.id));visited.add(r.id)});
 assert.equal(model.agruparOrdenes(p.items,'rubro').reduce((n,[,v])=>n+v.length,0),75);
}
assert.equal(visited.size,1350);assert.equal(model.paginaGrilla([],999).page,1);
const ranges=[];
const loaded=await pagination.leerPaginas((from,to)=>{ranges.push([from,to]);return Promise.resolve({data:all.slice(from,to+1),error:null})});
assert.equal(loaded.length,1350);assert.equal(ranges.length,3);
const capped=await pagination.leerPaginas(async(from)=>({data:all.slice(from,from+100),error:null,count:all.length}));
assert.equal(capped.length,1350); // Cupo servidor de 100 aunque se pidieron 500.
await assert.rejects(()=>pagination.leerPaginas(async from=>({data:from?[]:all.slice(0,100),count:1350,error:null})),/lista cambió/);
await assert.rejects(()=>pagination.leerPaginas(async from=>from?{data:null,error:{message:'Fallo simulado'}}:{data:all.slice(0,500),error:null}),/Fallo simulado/);
let valid=true,calls=0;
await assert.rejects(()=>pagination.leerPaginas(async()=>{calls++;valid=false;return {data:all.slice(0,500),error:null}},()=>{if(!valid)throw Error('Sesión reemplazada')}),/Sesión reemplazada/);
assert.equal(calls,1);
security.bindIdentity('cuenta-ficticia');
let fail=false,hold,firstPage;
const source=all.map((r,i)=>({...r,proyecto_id:i<900?'obra-a':'obra-b',ot:`OT-${i+1}`,estado:'Pendiente',prioridad:'Media',campos:{},created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',orden_costos:[]}));
const query=()=>{
 let ids=[],from=0,to=499;
 const q={select(){return q},in(_key,value){ids=value;return q},is(){return q},order(){return q},range(a,b){from=a;to=b;return q},then(resolve,reject){
   const run=async()=>{if(hold){const wait=hold;hold=null;firstPage?.();await wait}if(fail&&from>0)return {data:null,error:{message:'Error de página'}};return {data:source.filter(r=>ids.includes(r.proyecto_id)).slice(from,to+1),error:null}};
   return run().then(resolve,reject);
 }};return q;
};
const store=await load('src/stores/ordenesStore.ts',{
 zustand:{create},uuid:{v4:()=>crypto.randomUUID()},'../db/supabase':{supabase:{from:query}},
 './authStore':{useAuthStore:{getState:()=>({user:{id:'cuenta-ficticia'}})}},
 './accessStore':{exigirPermiso:()=>{},tienePermiso:()=>true},'../security/sessionScope':security,
 '../data/ordenMapper':mapper,'../services/paginatedRead':pagination,
});
const state=store.useOrdenesStore;
await state.getState().cargarOrdenesDeProyectos(['obra-a','obra-b']);
assert.equal(state.getState().ordenes.length,1350);assert.equal(state.getState().cargando,false);
// Un fallo intermedio conserva el conjunto anterior completo; nunca publica media copia.
fail=true;await state.getState().cargarOrdenesDeProyectos(['obra-a','obra-b']);
assert.equal(state.getState().ordenes.length,1350);assert.match(state.getState().error,/Error de página/);fail=false;
// Una consulta posterior gana aunque termine antes que la consulta anterior.
let release;hold=new Promise(r=>release=r);const reached=new Promise(r=>firstPage=r);
const older=state.getState().cargarOrdenesDeProyectos(['obra-a']);await reached;
await state.getState().cargarOrdenesDeProyectos(['obra-b']);release();await older;
assert.equal(state.getState().ordenes.length,450);assert(state.getState().ordenes.every(o=>o.proyecto_id==='obra-b'));
// Una actualización de ficha no reduce el alcance de la grilla.
await state.getState().cargarOrdenesDeProyectos(['obra-a','obra-b']);
state.getState().agregarOActualizarOrden({...state.getState().ordenes[0],rubro:'Rubro actualizado'});
assert.equal(state.getState().ordenes.length,1350);
hold=new Promise(r=>release=r);const captured=new Promise(r=>firstPage=r);
const concurrent=state.getState().cargarOrdenesDeProyectos(['obra-a','obra-b']);await captured;
const edited=state.getState().ordenes[0],removed=state.getState().ordenes[1];
state.getState().agregarOActualizarOrden({...edited,rubro:'Actualización durante lectura',updated_at:'2030-01-01T00:00:00Z'});
state.getState().aplicarEliminacionRemota(removed.id);
state.getState().agregarOActualizarOrden({...edited,id:'nueva-durante-lectura',ot:'OT-NUEVA'});
release();await concurrent;
assert.equal(state.getState().ordenes.find(o=>o.id===edited.id).rubro,'Actualización durante lectura');
assert(!state.getState().ordenes.some(o=>o.id===removed.id));
assert(state.getState().ordenes.some(o=>o.id==='nueva-durante-lectura'));
assert.equal(nav.leerRutaGrilla({detalle:'ot-a',editor:'ot-a',tab:'datos'}).detalle,'ot-a');
assert.equal(nav.leerRutaGrilla({informe:{ordenId:'ot-a',tipo:'inventado'}}).informe,null);
assert.equal(nav.leerRutaInforme({tipo:'visita',documentoId:'doc-a'}).documentoId,'doc-a');
console.log('PASS Grilla local: 1350 OT completas, 18 páginas sin pérdidas/duplicados, normalización, orden numérico/días, grupos, error intermedio, sesión, consultas concurrentes y actualización de ficha sin perder otras obras.');
