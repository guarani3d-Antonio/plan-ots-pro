// Ensayo cerrado: datos ficticios, PostgreSQL en memoria y transporte simulado.
// No lee .env ni se conecta a Supabase.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const load=async(path,mocks={})=>{
 const module={exports:{}};
 const compiled=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,require:key=>{if(!(key in mocks))throw Error('Import inesperado '+key);return mocks[key]},console,structuredClone,crypto,Date,Error,navigator:{onLine:true},AbortController,AbortSignal});return module.exports;
};
const m=await load('src/services/personalDashboardModel.ts');
const projects=[{id:'obra',nombre:'Obra ficticia'},{id:'torre',nombre:'Torre',proyecto_padre_id:'obra'},{id:'unidad',nombre:'Unidad',proyecto_padre_id:'torre'},{id:'otra',nombre:'Otra empresa'}];
const row=(id,extra={})=>({id,proyecto_id:'unidad',ot:'OT-'+id,estado:'Pendiente',rubro:'Albañilería',responsable:'Ana',responsable_id:'ana',contratistas:['Empresa A','Empresa A','Empresa B'],fecha_ingreso:'2026-10-01',created_at:'2026-10-01T10:00:00Z',...extra});
const rows=[row('1'),row('2',{estado:'En proceso',fecha_fin_trabajos:'2026-10-10'}),row('3',{estado:'Cerrada',fecha_fin_trabajos:'2026-10-05'}),row('4',{estado:'Cerrada',fecha_fin_trabajos:'2026-09-30'}),row('5',{estado:'Cerrada',fecha_fin_trabajos:'2026-02-30'}),row('6',{proyecto_id:'otra',rubro:'Eléctrica',responsable_id:'otro',contratistas:[]})];
assert.equal(m.validDay('2026-02-30'),'');assert.equal(m.validDay('2026-10-19'),'2026-10-19');
const f={...m.blankFilters(),project:'obra'};
assert.equal(m.filterOrders(rows,projects,f).length,5);
assert.equal(m.filterOrders(rows,projects,{...f,search:'ALBANILERIA'}).length,5);
assert.equal(m.filterOrders(rows,projects,{...f,contractor:'Empresa A'}).length,5);
assert.equal(m.filterOrders(rows,projects,{...f,responsible:'id:otro'}).length,0);
assert.equal(m.filterOrders(rows,projects,{...f,dateField:'fin',from:'2026-10-01',to:'2026-10-09'}).length,1);
assert.equal(m.blockOrders(rows,{...m.newBlock(),condition:'pending'}).length,2);
assert.equal(m.blockOrders(rows,{...m.newBlock(),condition:'progress'}).length,1);
assert.equal(m.blockOrders(rows,{...m.newBlock(),condition:'closed'}).length,3);
assert.equal(m.blockOrders(rows,{...m.newBlock(),condition:'overdue'},'2026-10-19').length,1);
const b={...m.newBlock(),measure:'duration'};
assert.equal(m.measureOrders(rows,b).value,5);assert.equal(m.measureOrders(rows,b).sample,1);
assert.equal(m.blockOrders(rows,b).length,1); // El detalle incluye exactamente las OT que aportaron al promedio.
assert.equal(m.measureOrders([row('x')],b).value,null); // No inventar cierres con updated_at.
const groups=m.groupOrders(rows,projects,{...m.newBlock(),group:'contratista'});
assert.equal(groups.find(g=>g.key==='Empresa A').value,5);assert.equal(groups.find(g=>g.key==='Empresa B').orders.length,5);
assert.equal(m.groupOrders([row('a'),row('b',{responsable_id:'otro'})],projects,{...m.newBlock(),group:'responsable'}).length,2);
assert.equal(m.measureOrders(rows,{...m.newBlock(),measure:'entities',group:'obra'},projects).value,2);
assert.equal(m.groupOrders(rows,projects,{...m.newBlock(),group:'obra'}).find(g=>g.key==='obra').value,5);
assert.equal(m.measureOrders(rows,{...m.newBlock(),measure:'entities',group:'semana'},projects).value,1);
assert.equal(m.groupColor({...m.newBlock(),group:'estado'},'Cerrada'),m.STATUS_COLORS.Cerrada);
assert.equal(m.groupColor({...m.newBlock(),group:'rubro'},'Electricidad',1),m.groupColor({...m.newBlock(),group:'rubro'},'Electricidad',8));
const document=m.initialDocument();m.validateDocument(document);assert.equal(document.boards[0].blocks.length,8);
const broken=structuredClone(document);broken.boards[0].blocks[0].colors.accent='url(https://invalid)';assert.throws(()=>m.validateDocument(broken));
const duplicate=structuredClone(document);duplicate.boards[0].blocks.push(duplicate.boards[0].blocks[0]);assert.throws(()=>m.validateDocument(duplicate));
const invalidDates=structuredClone(document);invalidDates.boards[0].filters.from='2026-11-01';invalidDates.boards[0].filters.to='2026-10-01';assert.throws(()=>m.validateDocument(invalidDates));
const prototype=structuredClone(document);prototype.boards[0].blocks[0].type='constructor';assert.throws(()=>m.validateDocument(prototype));
let owner='a',generation=1,stored=null,fail=false,wait;
const security={identityId:()=>owner,sessionTicket:()=>generation,assertSession:t=>{if(t!==generation)throw Error('Sesión cambió')}};
const api={from:()=>({select(){return this},eq(_key,id){assert.equal(id,owner);return this},async maybeSingle(){if(wait)await wait;return {data:stored,error:fail?{message:'Falla ficticia'}:null}}}),rpc:async(_name,args)=>{if(wait)await wait;return {data:3,error:fail?{message:'DASHBOARD_CONFLICT'}:null}}};
const service=await load('src/services/personalDashboardService.ts',{'../db/supabase':{supabase:api},'../security/sessionScope':security,'./personalDashboardModel':m});
assert.equal((await service.loadPersonalDashboards('a')).revision,0);
assert.equal((await service.savePersonalDashboards('a',document,2)).revision,3);
await assert.rejects(()=>service.loadPersonalDashboards('b'),/cuenta cambió/);
fail=true;await assert.rejects(()=>service.savePersonalDashboards('a',document,2),/otra ventana/);
await assert.rejects(()=>service.loadPersonalDashboards('a'),/No se pudieron cargar/);fail=false;
stored={config:{version:99},revision:2};await assert.rejects(()=>service.loadPersonalDashboards('a'),/versión/);stored=null;
let release;wait=new Promise(r=>release=r);const stale=service.savePersonalDashboards('a',document,2);generation++;owner='b';release();await assert.rejects(()=>stale,/Sesión cambió/);

const db=new PGlite(),sql=await readFile('supabase/migrations/202610190001_personal_dashboards.sql','utf8');
const a='10000000-0000-4000-8000-000000000001',z='10000000-0000-4000-8000-000000000002';
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(sql);await db.query('insert into auth.users values($1),($2)',[a,z]);
 const asUser=async(id,fn)=>{await db.exec(`set role authenticated;select set_config('test.uid','${id}',false)`);try{return await fn()}finally{await db.exec('reset role')}};
 await asUser(a,async()=>{
  const r=await db.query('select plan_guardar_dashboards_personales($1,0) as rev',[document]);assert.equal(r.rows[0].rev,1);
  await assert.rejects(()=>db.query('select plan_guardar_dashboards_personales($1,0)',[document]),/DASHBOARD_CONFLICT/);
  const update=await db.query('select plan_guardar_dashboards_personales($1,1) as rev',[document]);assert.equal(update.rows[0].rev,2);
  await assert.rejects(()=>db.query('select plan_guardar_dashboards_personales($1,1)',[document]),/DASHBOARD_CONFLICT/);
  assert.equal((await db.query('select * from plan_dashboards_personales')).rows.length,1);
  await assert.rejects(()=>db.query('update plan_dashboards_personales set revision=900'),/permission denied/);
 });
 await asUser(z,async()=>{
  assert.equal((await db.query('select * from plan_dashboards_personales')).rows.length,0);
  const own=structuredClone(document);own.boards[0].name='Cuenta B privada';
  await db.query('select plan_guardar_dashboards_personales($1,0)',[own]);
  const result=await db.query('select user_id,config from plan_dashboards_personales');assert.equal(result.rows.length,1);assert.equal(result.rows[0].user_id,z);
 });
 await asUser(a,async()=>{assert.equal((await db.query('select config from plan_dashboards_personales')).rows[0].config.boards[0].name,'Seguimiento de obra');});
 await db.exec("set role anon;select set_config('test.uid','',false)");
 await assert.rejects(()=>db.query('select plan_guardar_dashboards_personales($1,0)',[document]),/permission denied/);await db.exec('reset role');
 await db.exec(await readFile('supabase/rollback/202610190001_personal_dashboards.sql','utf8'));assert.equal((await db.query('select count(*) as n from plan_dashboards_personales')).rows[0].n,2);
}finally{await db.close()}
console.log('PASS dashboards: filtros anidados, búsquedas, fechas válidas, indicadores, agrupaciones sin duplicados, promedios, colores estables, validación, sesión, errores y conflictos. SQL real en PGlite: privacidad de dos cuentas, sin escritura directa, CAS, anonimato y reversión conservando preferencias. Sin conexión externa.');
