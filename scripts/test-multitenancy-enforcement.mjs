// Prueba la fase 2 con PostgreSQL WASM real. Auth/JWT se simulan en SQL.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const runtime=process.argv[2];
if(!runtime) throw new Error('Indicar ruta al runtime PGlite.');
const {PGlite}=await import(pathToFileURL(resolve(runtime)).href);
const [legacy,phase1,phase2,verification,rollback,seed]=await Promise.all([
  readFile('supabase/tests/legacy-foundation.sql','utf8'),
  readFile('supabase/migrations/202609200001_multitenancy_foundation.sql','utf8'),
  readFile('supabase/migrations/202609200002_multitenancy_enforcement.sql','utf8'),
  readFile('supabase/verification/202609200002_multitenancy_enforcement.verify.sql','utf8'),
  readFile('supabase/rollback/202609200002_multitenancy_enforcement.rollback.sql','utf8'),
  readFile('supabase/seeds/20260920_fictional_tenants.sql','utf8'),
]);
const db=new PGlite(), results=[];
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
async function check(name,fn){try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}}
async function asUser(n,fn,role='authenticated'){
  await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${uid(n)}',true);`);
  try{return await fn();}finally{await db.exec('rollback');}
}
const denied=(sql,code='42501')=>assert.rejects(()=>db.query(sql),e=>e.code===code);
try{
  await db.exec(legacy);
  await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,11)n;
    insert into public.proyectos(id,nombre,plano_url,created_by) values('${uid(190)}','Legado','fixture','${uid(1)}');`);
  await db.exec(phase1);
  await db.exec(phase2);
  await db.exec(`insert into public.tenants(id,slug,nombre) values('${uid(101)}','empresa-1','Empresa 1'),('${uid(102)}','empresa-2','Empresa 2');
    insert into public.plataforma_administradores(user_id) values('${uid(11)}');
    insert into public.tenant_miembros(tenant_id,user_id,rol) values
      ('${uid(101)}','${uid(1)}','administrador'),('${uid(101)}','${uid(2)}','tecnico'),('${uid(101)}','${uid(3)}','viewer'),
      ('${uid(102)}','${uid(4)}','administrador'),('${uid(102)}','${uid(5)}','tecnico');`);

  await check('admin crea obra y tenant se asigna automáticamente',()=>asUser(1,async()=>{
    await db.query(`insert into proyectos(id,nombre,plano_url,created_by) values('${uid(201)}','Obra A','fixture',auth.uid())`);
    assert.equal(await scalar(`select tenant_id from proyectos where id='${uid(201)}'`),uid(101));
    assert.equal(await scalar(`select tenant_id from proyecto_miembros where proyecto_id='${uid(201)}' and user_id=auth.uid()`),uid(101));
  }));
  await db.exec(`insert into proyectos(id,nombre,plano_url,created_by,tenant_id) values('${uid(201)}','Obra A','fixture','${uid(1)}','${uid(101)}'),('${uid(202)}','Obra B','fixture','${uid(4)}','${uid(102)}');`);
  await check('supervisor agrega técnico y viewer coherentes',()=>asUser(1,async()=>{
    await db.query(`insert into proyecto_miembros(proyecto_id,user_id,rol) values('${uid(201)}','${uid(2)}','tecnico'),('${uid(201)}','${uid(3)}','viewer')`);
    assert.equal(await scalar(`select count(*) from proyecto_miembros where proyecto_id='${uid(201)}' and tenant_id='${uid(101)}'`),3);
  }));
  await db.exec(`insert into proyecto_miembros(proyecto_id,user_id,rol) values('${uid(201)}','${uid(2)}','tecnico'),('${uid(201)}','${uid(3)}','viewer'),('${uid(202)}','${uid(5)}','tecnico');`);
  await check('miembro ajeno no ve obra A',()=>asUser(4,async()=>assert.equal(await scalar(`select count(*) from proyectos where id='${uid(201)}'`),0)));
  await check('miembro ajeno no ve orden de obra A',async()=>{
    await db.exec(`insert into ordenes(id,proyecto_id,ot,created_by) values('${uid(301)}','${uid(201)}','OT-A','${uid(1)}')`);
    await asUser(4,async()=>assert.equal(await scalar(`select count(*) from ordenes where id='${uid(301)}'`),0));
  });
  await check('técnico edita su obra',()=>asUser(2,async()=>{
    await db.query(`insert into ordenes(id,proyecto_id,ot,created_by) values('${uid(302)}','${uid(201)}','OT-T',auth.uid())`);
    await db.query(`update ordenes set ot='OT-T2' where id='${uid(302)}'`);
    assert.equal(await scalar(`select ot from ordenes where id='${uid(302)}'`),'OT-T2');
  }));
  await check('viewer lee pero no crea órdenes',()=>asUser(3,async()=>{
    assert.equal(await scalar(`select count(*) from ordenes where id='${uid(301)}'`),1);
    await denied(`insert into ordenes(proyecto_id,ot,created_by) values('${uid(201)}','NO',auth.uid())`);
  }));
  await check('técnico no escribe en obra de otra empresa',()=>asUser(2,()=>denied(`insert into ordenes(proyecto_id,ot,created_by) values('${uid(202)}','NO',auth.uid())`)));
  await check('no se agrega usuario de otra empresa',()=>asUser(1,()=>denied(`insert into proyecto_miembros(proyecto_id,user_id,rol) values('${uid(201)}','${uid(4)}','viewer')`)));
  await check('rol de obra no supera rol viewer de empresa',()=>asUser(1,()=>denied(`update proyecto_miembros set rol='tecnico' where proyecto_id='${uid(201)}' and user_id='${uid(3)}'`)));
  await check('empresa de una obra es inmutable',()=>asUser(1,()=>denied(`update proyectos set tenant_id='${uid(102)}' where id='${uid(201)}'`)));
  await check('FK compuesta rechaza foto con orden de otra obra',async()=>{
    await db.exec(`insert into ordenes(id,proyecto_id,ot,created_by) values('${uid(303)}','${uid(202)}','OT-B','${uid(4)}')`);
    await assert.rejects(()=>db.query(`insert into fotos(proyecto_id,orden_id,uploaded_by) values('${uid(201)}','${uid(303)}','${uid(1)}')`),e=>e.code==='23503');
  });
  await check('FK compuesta rechaza comentario con orden de otra obra',()=>assert.rejects(()=>db.query(`insert into comentarios_ot(proyecto_id,orden_id,user_id) values('${uid(201)}','${uid(303)}','${uid(1)}')`),e=>e.code==='23503'));
  await check('revocar membresía de empresa corta proyecto y orden',async()=>{
    await db.exec(`update tenant_miembros set activo=false where user_id='${uid(2)}'`);
    await asUser(2,async()=>{assert.equal(await scalar(`select count(*) from proyectos where id='${uid(201)}'`),0);assert.equal(await scalar(`select count(*) from ordenes where id='${uid(301)}'`),0);});
    await db.exec(`update tenant_miembros set activo=true where user_id='${uid(2)}'`);
  });
  await check('desactivar empresa corta acceso',async()=>{
    await db.exec(`update tenants set activo=false where id='${uid(101)}'`);
    await asUser(1,async()=>assert.equal(await scalar(`select count(*) from proyectos where id='${uid(201)}'`),0));
    await db.exec(`update tenants set activo=true where id='${uid(101)}'`);
  });
  await check('creador ve ambas empresas y obras',()=>asUser(11,async()=>assert.equal(await scalar(`select count(*) from proyectos where tenant_id is not null`),2)));
  await check('obra legada solo sigue visible a miembro histórico',async()=>{
    await asUser(1,async()=>assert.equal(await scalar(`select count(*) from proyectos where id='${uid(190)}'`),1));
    await asUser(4,async()=>assert.equal(await scalar(`select count(*) from proyectos where id='${uid(190)}'`),0));
  });
  await check('anon no tiene tablas ni helpers',async()=>{
    assert.equal(await scalar(`select has_table_privilege('anon','public.proyectos','SELECT')`),false);
    assert.equal(await scalar(`select has_function_privilege('anon','public.plan_es_miembro_proyecto(uuid)','EXECUTE')`),false);
  });
  await check('políticas de dominio solo nombran authenticated',async()=>{
    assert.equal(await scalar(`select count(*) from pg_policies where schemaname='public' and tablename in ('proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs') and roles<>array['authenticated']::name[]`),0);
  });
  await check('verificación operativa acepta fase 2',()=>db.exec(verification));
  await check('rollback vacío restaura fase 1 y compatibilidad',async()=>{
    const rb=new PGlite();
    try{
      await rb.exec(legacy);await rb.exec(phase1);await rb.exec(phase2);await rb.exec(rollback);
      const value=async sql=>Object.values((await rb.query(sql)).rows[0])[0];
      assert.equal(await value(`select to_regprocedure('public.plan_es_miembro_proyecto(uuid)')`),null);
      assert.notEqual(await value(`select to_regprocedure('public.plan_proteger_tenant_transicion()')`),null);
      assert.equal(await value(`select count(*) from pg_constraint where conname='fotos_proyecto_orden_fkey'`),0);
      await rb.exec(`insert into auth.users values('${uid(91)}'); set role authenticated; select set_config('request.jwt.claim.sub','${uid(91)}',false); insert into proyectos(id,nombre,plano_url,created_by) values('${uid(291)}','Legado rollback','fixture',auth.uid()); reset role;`);
      assert.equal(await value(`select count(*) from proyecto_miembros where proyecto_id='${uid(291)}'`),1);
    }finally{await rb.close();}
  });
  await check('seed crea exactamente 2 empresas, 4 obras y 10 usuarios tenant',async()=>{
    const seeded=new PGlite();
    try{
      await seeded.exec(legacy);await seeded.exec(phase1);await seeded.exec(phase2);
      const emails=['creador@plan-ots.test','admin@empresa1.plan-ots.test','supervisor@empresa1.plan-ots.test','tecnico1@empresa1.plan-ots.test','tecnico2@empresa1.plan-ots.test','lector@empresa1.plan-ots.test','admin@empresa2.plan-ots.test','supervisor@empresa2.plan-ots.test','tecnico1@empresa2.plan-ots.test','tecnico2@empresa2.plan-ots.test','lector@empresa2.plan-ots.test'];
      for(let i=0;i<emails.length;i++) await seeded.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),emails[i]]);
      await seeded.exec(seed);
      const count=async table=>Object.values((await seeded.query(`select count(*) from public.${table}`)).rows[0])[0];
      assert.equal(await count('tenants'),2);assert.equal(await count('proyectos'),4);
      assert.equal(await count('tenant_miembros'),10);assert.equal(await count('proyecto_miembros'),14);
      assert.equal(Object.values((await seeded.query("select count(*) from proyectos where plano_url='pending://plan-upload-required'")).rows[0])[0],4);
    }finally{await seeded.close();}
  });
}catch(error){results.push({name:'preparación/ejecución de suite',ok:false,error:error.message});await db.exec('rollback').catch(()=>{});}
finally{
  const version=await scalar('select version()');await db.close();
  const report={scope:'PostgreSQL WASM local con auth.uid simulado; no prueba REST, JWT, Storage ni catálogo completo.',version,phase2Sha256:createHash('sha256').update(phase2).digest('hex'),passed:results.filter(x=>x.ok).length,total:results.length,results};
  await mkdir('docs/estabilizacion-2026-09-20/dia-3',{recursive:true});
  await writeFile('docs/estabilizacion-2026-09-20/dia-3/phase2-lab-tests.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(results.some(x=>!x.ok))process.exitCode=1;
}
