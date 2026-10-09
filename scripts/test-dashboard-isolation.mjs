import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';
const dir = 'tmp/dashboard-isolation';
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/mock.ts`, `
export let rows = {}, calls = [], failure = false;
export function fixture(data, fail=false) { rows=data; calls=[]; failure=fail; }
export const supabase = { from(table) {
  const call={table, filters:[], range:null}; calls.push(call);
  const query={ select(){return query}, is(k,v){call.filters.push([k,v]);return query}, order(){return query},
    range(from,to){call.range=[from,to];return query},
    then(resolve){const data=(rows[table]??[]).filter(r=>call.filters.every(([k,v])=>(r[k]??null)===v));return Promise.resolve(failure?{data:null,error:{message:'QA network failure'}}:{data:call.range?data.slice(call.range[0],call.range[1]+1):data,error:null}).then(resolve)} };
  return query;
} };
`);
await writeFile(`${dir}/entry.ts`, `export {loadDashboardData} from '../../src/services/dashboardDataService';export {bindIdentity} from '../../src/security/sessionScope';export {fixture,calls} from './mock';`);
await build({ configFile:false, plugins:[{name:'mock-db',enforce:'pre',resolveId(source){if(source.endsWith('/db/supabase'))return new URL('../tmp/dashboard-isolation/mock.ts',import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/,'')}}], build:{lib:{entry:`${dir}/entry.ts`,formats:['es'],fileName:'fixture'},outDir:dir,emptyOutDir:false,minify:false} });
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const qa = await import('../tmp/dashboard-isolation/fixture.js');
qa.bindIdentity('creator');
const projects = Array.from({length:1001},(_,i)=>({id:`p${i}`,nombre:`Obra ${i}`,tenant_id:i%2?'A':'B',deleted_at:null}));
const orders = projects.map((p,i)=>({id:`o${i}`,proyecto_id:p.id,estado:i%2?'Pendiente':'Cerrada',deleted_at:null,orden_costos:[]}));
qa.fixture({proyectos:projects,ordenes:[...orders,{id:'orphan',proyecto_id:'deleted-work',deleted_at:null},{id:'deleted',proyecto_id:'p0',deleted_at:'2026-10-09'}]});
const creator = await qa.loadDashboardData();
assert.equal(creator.proyectos.length,1001);assert.equal(creator.ordenes.length,1001);
assert.equal(qa.calls.filter(c=>c.table==='proyectos').length,2);
assert.equal(qa.calls.filter(c=>c.table==='ordenes').length,2);
assert(creator.proyectos.some(p=>p.tenant_id==='A')&&creator.proyectos.some(p=>p.tenant_id==='B'));
assert(qa.calls.every(c=>c.filters.every(([key])=>key==='deleted_at')),'Dashboard must not inherit company or active-plan filters');
qa.bindIdentity('technician');
// Simulates the rows returned by RLS, not a client-side security override.
qa.fixture({proyectos:[projects[1]],ordenes:[orders[1]]});
assert.equal((await qa.loadDashboardData()).ordenes.length,1);
qa.fixture({proyectos:[],ordenes:[orders[1]]});
assert.equal((await qa.loadDashboardData()).ordenes.length,0);
qa.fixture({},true);await assert.rejects(qa.loadDashboardData(),/QA network failure/);
console.log('Dashboard: independent company/plan scope, pagination beyond 1000, deleted/orphan exclusion, restricted-account rows, and visible error propagation passed.');
