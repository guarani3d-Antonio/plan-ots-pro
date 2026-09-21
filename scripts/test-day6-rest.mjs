// Solo clave pública y cuentas ficticias existentes. Sin credencial administrativa.
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const url='https://iqgbyqyoovzvhhdjawnt.supabase.co',env=await readFile('.env.local','utf8');
const anonKey=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];assert(anonKey);
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const credentials=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json','utf8'));
const clients={},results=[];
const projects=['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002'];
const tenants=['10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
const orders=['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'];
const ok=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const denied=r=>assert.equal(r.error?.code,'42501');
async function test(name,fn){try{await fn();results.push({name,ok:true});console.log('OK '+name);}catch(e){results.push({name,ok:false,error:e.message.split('\n')[0]});console.log('FAIL '+name+': '+e.message.split('\n')[0]);}}
try{
 for(const c of credentials){const client=createClient(url,anonKey,opts);ok(await client.auth.signInWithPassword({email:c.email,password:c.password}));clients[c.key]=client;}
 const creator=clients['platform-creator'],tech=clients['e1-tecnico-1'],sup=clients['e1-supervisor'];
 // Importes ficticios para la demostración; únicamente cuatro OTs ya identificadas.
 for(let i=0;i<4;i++)ok(await clients[i<2?'e1-admin':'e2-admin'].from('ordenes').update({costo:(i+1)*125000}).eq('id',orders[i]).select('id').single());
 for(const c of credentials)await test(`${c.key}: contexto efectivo y costos protegidos en REST`,async()=>{
  const client=clients[c.key],context=ok(await client.rpc('plan_contexto_acceso'));
  const visible=c.key==='platform-creator'?[0,1,2,3]:c.key.includes('admin')||c.key.includes('supervisor')?(c.key.startsWith('e1')?[0,1]:[2,3]):[(c.key.startsWith('e1')?0:2)+(c.key.endsWith('tecnico-2')?1:0)];
  assert.deepEqual(context.obras.filter(p=>projects.includes(p.id)).map(p=>p.id).sort(),visible.map(i=>projects[i]).sort());
  const rows=ok(await client.from('ordenes').select('id,costo,orden_costos(costo)').in('id',orders));
  assert.equal(rows.length,visible.length);
  for(const row of rows){assert.equal(row.costo,null);const cost=Array.isArray(row.orden_costos)?row.orden_costos[0]?.costo:row.orden_costos?.costo;const allowed=context.obras.find(p=>p.id===projects[orders.indexOf(row.id)]).ver_costos;assert.equal(cost??null,allowed?(orders.indexOf(row.id)+1)*125000:null);}
  const direct=ok(await client.from('orden_costos').select('orden_id').in('orden_id',orders));assert.equal(direct.length,visible.filter(i=>context.obras.find(p=>p.id===projects[i])?.ver_costos).length);
 });
 await test('técnico no escribe costo ni tabla privada',async()=>{denied(await tech.from('ordenes').update({costo:999}).eq('id',orders[0]));denied(await tech.from('orden_costos').update({costo:999}).eq('orden_id',orders[0]));});
 await test('filtro de costo público no revela el importe privado',async()=>assert.equal(ok(await tech.from('ordenes').select('id').eq('costo',125000)).length,0));
 await test('técnico no accede a snapshots con costo; supervisor sí',async()=>{
  const id=randomUUID();try{ok(await sup.from('versiones').insert({id,proyecto_id:projects[0],nombre:'QA día 6 temporal',snapshot:{ordenes:[{costo:125000}]}}));assert.equal(ok(await tech.from('versiones').select('*').eq('id',id)).length,0);assert.equal(ok(await sup.from('versiones').select('snapshot').eq('id',id)).length,1);}
  finally{ok(await sup.from('versiones').delete().eq('id',id));}
 });
 await test('Creador revoca y restaura membresía sin renovar JWT técnico',async()=>{
  const email=credentials.find(c=>c.key==='e1-tecnico-1').email;
  try{ok(await creator.rpc('plan_admin_miembro',{p_tenant:tenants[0],p_email:email,p_rol:'tecnico',p_activo:false}));assert.equal(ok(await tech.rpc('plan_contexto_acceso')).obras.length,0);assert.equal(ok(await tech.from('ordenes').select('id')).length,0);}
  finally{ok(await creator.rpc('plan_admin_miembro',{p_tenant:tenants[0],p_email:email,p_rol:'tecnico',p_activo:true}));}
 });
 await test('rebajar supervisor revoca costo con el mismo JWT',async()=>{
  const email=credentials.find(c=>c.key==='e1-supervisor').email;
  try{ok(await creator.rpc('plan_admin_miembro',{p_tenant:tenants[0],p_email:email,p_rol:'viewer',p_activo:true}));assert.equal(ok(await sup.from('orden_costos').select('orden_id')).length,0);assert(ok(await sup.rpc('plan_contexto_acceso')).obras.every(p=>!p.editar&&!p.ver_costos));}
  finally{ok(await creator.rpc('plan_admin_miembro',{p_tenant:tenants[0],p_email:email,p_rol:'supervisor',p_activo:true}));}
 });
 await test('admin de empresa no crea empresas ni asigna permisos de Creador',async()=>{denied(await clients['e1-admin'].rpc('plan_admin_empresa',{p_nombre:'NO'}));denied(await clients['e1-admin'].rpc('plan_admin_miembro',{p_tenant:tenants[1],p_email:credentials.find(c=>c.key==='e2-lector').email,p_rol:'administrador'}));});
 await test('anónimo no invoca contexto ni administración ni lee costos',async()=>{const a=createClient(url,anonKey,opts);denied(await a.rpc('plan_contexto_acceso'));denied(await a.rpc('plan_admin_empresa',{p_nombre:'NO'}));denied(await a.from('orden_costos').select('*'));});
 await test('cuatro fixtures conservan sus costos tras rechazos y revocaciones',async()=>{const values=ok(await creator.from('orden_costos').select('orden_id,costo').in('orden_id',orders));assert.equal(values.length,4);for(const row of values)assert.equal(row.costo,(orders.indexOf(row.orden_id)+1)*125000);});
}catch(e){results.push({name:'preparación',ok:false,error:e.message.split('\n')[0]});}
finally{const report={testedAt:new Date().toISOString(),scope:'Auth, REST y RPC reales con cuentas ficticias. Sin clave service_role. Cuatro importes sintéticos permanecen para pruebas web.',passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/estabilizacion-2026-09-20/dia-6/rest-tests.json',JSON.stringify(report,null,2)+'\n');console.log(`${report.passed}/${report.total}`);if(results.some(r=>!r.ok))process.exitCode=1;}
