import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=await readFile('supabase/migrations/202609270018_creator_directories.sql','utf8');
const auth=await readFile('supabase/migrations/202609200002_multitenancy_enforcement.sql','utf8');
const one=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
const datos={nombre:'Cliente prueba',identificacion:'DOC-001',contacto:'Contacto',telefono:'0981',correo:'prueba@example.test',domicilio:'Domicilio',tipo_inmueble:'residencial_altura',direccion_obra:'Dirección de la obra',piso:'4',unidad:'401',sector:''};
async function actor(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`);}
async function rejected(fn,code){await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}
const alta=(p,req,c=null,d=datos)=>one('select plan_alta_cliente_obra($1,$2,$3,$4)',[id(p),id(req),c,d]);
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values ${[1,2,3,4,5].map(n=>`('${id(n)}')`).join(',')};
 create table tenants(id uuid primary key,activo boolean default true);insert into tenants values('${id(10)}',true),('${id(20)}',true);
 create table proyectos(id uuid primary key,tenant_id uuid,nombre text,deleted_at timestamptz,unique(tenant_id,id));
 insert into proyectos values('${id(11)}','${id(10)}','Torre A',null),('${id(12)}','${id(10)}','Torre B',null),('${id(13)}','${id(10)}','Torre C',null),('${id(21)}','${id(20)}','Otra empresa',null);
 create table proyecto_miembros(proyecto_id uuid,tenant_id uuid,user_id uuid,rol text);
 insert into proyecto_miembros values('${id(11)}','${id(10)}','${id(1)}','supervisor'),('${id(12)}','${id(10)}','${id(1)}','supervisor'),('${id(11)}','${id(10)}','${id(2)}','tecnico'),('${id(13)}','${id(10)}','${id(3)}','supervisor'),('${id(21)}','${id(20)}','${id(4)}','supervisor');
 create table tenant_miembros(tenant_id uuid,user_id uuid,rol text,activo boolean default true);
 insert into tenant_miembros values('${id(10)}','${id(1)}','supervisor',true),('${id(10)}','${id(2)}','tecnico',true),('${id(10)}','${id(3)}','supervisor',true),('${id(20)}','${id(4)}','supervisor',true);
 create function plan_es_creador() returns boolean language sql stable as $$select auth.uid()='${id(5)}'::uuid$$;
 create table ordenes(id uuid primary key,proyecto_id uuid,created_at timestamptz default now());`);
 await db.exec(auth.slice(auth.indexOf('create function public.plan_puede_editar_proyecto'),auth.indexOf('create function public.plan_puede_crear_proyecto')));
 await db.exec(sql.slice(sql.indexOf('create table public.plan_clientes'),sql.indexOf('-- Los miembros conservan')));
 await db.exec(sql.slice(sql.indexOf('create function public.plan_clientes_para_obra'),sql.indexOf('create function public.plan_bloquear_reubicacion_cliente')));
 await db.exec('revoke all on function plan_clientes_para_obra(uuid) from public;grant execute on function plan_clientes_para_obra(uuid) to authenticated;');
 await db.exec(await readFile('supabase/migrations/202610020024_clients_from_ot.sql','utf8'));
 await actor(1);const a=await alta(11,100);assert.equal(a.nombre,datos.nombre);assert.equal(a.unidad,'401');console.log('PASS alta atómica y retorno para vincular OT');
 const retry=await alta(11,100);assert.equal(retry.ubicacion_id,a.ubicacion_id);console.log('PASS reintento sin duplicar');
 const b=await alta(12,101,a.cliente_id,{...datos,unidad:'502'});assert.equal(b.cliente_id,a.cliente_id);assert.equal(b.unidad,'502');console.log('PASS mismo cliente en otra obra supervisada sin repetir ficha');
 const c=await alta(11,102,a.cliente_id,{...datos,unidad:'402'});assert.notEqual(c.ubicacion_id,a.ubicacion_id);
 assert.equal((await db.query('select * from plan_clientes_para_obra($1)',[id(11)])).rows.length,2);console.log('PASS varias ubicaciones disponibles por obra');
 await rejected(()=>alta(11,103), '23505');
 await rejected(()=>alta(11,104,null,{...datos,identificacion:'OTRO',direccion_obra:'x'.repeat(501)}),'23514');
 await db.exec('reset role');assert.equal(Number(await one('select count(*) from plan_clientes')),1);assert.equal(Number(await one('select count(*) from plan_cliente_ubicaciones')),3);console.log('PASS duplicado rechazado y rollback completo ante ubicación inválida');
 await actor(1);await rejected(()=>alta(13,105),'42501');await rejected(()=>alta(21,106),'42501');console.log('PASS denegado otra torre y otra empresa');
 await actor(2);await rejected(()=>alta(11,107),'42501');assert.equal((await db.query('select * from plan_clientes_para_obra($1)',[id(11)])).rows.length,2);assert.equal(Number(await one('select count(*) from plan_clientes')),0);console.log('PASS técnico reutiliza solo directorio autorizado, sin alta ni lectura global');
 await actor(3);assert.equal((await db.query('select * from plan_clientes_gestion_obra($1)',[id(13)])).rows.length,0);await rejected(()=>alta(13,108,a.cliente_id),'42501');console.log('PASS ID de cliente ajeno no permite vinculación ni lectura');
 await actor(4);await rejected(()=>alta(21,109,a.cliente_id),'42501');
 await db.exec(`reset role;update tenant_miembros set activo=false where user_id='${id(1)}'`);await actor(1);await rejected(()=>alta(11,110),'42501');console.log('PASS revocación de membresía inmediata');
 await db.exec('reset role;set role anon');await rejected(()=>alta(11,111),'42501');console.log('PASS anónimo sin ejecución');
 await db.exec('reset role');await db.exec(await readFile('supabase/rollback/202610020024_clients_from_ot.rollback.sql','utf8'));assert.equal(Number(await one('select count(*) from plan_clientes')),1);console.log('PASS rollback conserva los datos');
} finally{await db.close();}
