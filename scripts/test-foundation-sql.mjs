// PostgreSQL WASM real en memoria. No red, credenciales ni datos del usuario.
// node scripts/test-foundation-sql.mjs <ruta a @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const runtime = process.argv[2];
if (!runtime) throw new Error('Indicar ruta al runtime PGlite instalado (solo desarrollo).');
const { PGlite } = await import(pathToFileURL(resolve(runtime)).href);
const migration = await readFile('supabase/migrations/202609200001_multitenancy_foundation.sql','utf8');
const rollback = await readFile('supabase/rollback/202609200001_multitenancy_foundation.rollback.sql','utf8');
const legacy = await readFile('supabase/tests/legacy-foundation.sql','utf8');
const verification = await readFile('supabase/verification/202609200001_multitenancy_foundation.verify.sql','utf8');
const results = [];
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
// Excluye OID y números internos; compara definición, grants e índices legados.
const legacyCatalog = () => scalar(`select jsonb_build_object(
  'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position)
    from information_schema.columns c where table_schema='public'),
  'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname)
    from pg_policies p where schemaname='public'),
  'indexes',(select jsonb_agg(to_jsonb(i) order by tablename,indexname)
    from pg_indexes i where schemaname='public'),
  'grants',(select jsonb_agg(to_jsonb(g) order by table_name,grantee,privilege_type)
    from information_schema.role_table_grants g where table_schema='public'),
  'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal))`);
async function check(name, fn) {
  try { await fn(); results.push({name,ok:true}); }
  catch(e) { results.push({name,ok:false,error:e.message}); }
}
async function asUser(n, fn, role='authenticated') {
  await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${uid(n)}',true);`);
  try { return await fn(); } finally { await db.exec('rollback'); }
}
async function denied(sql,code='42501') {
  await assert.rejects(()=>db.query(sql), e=>e.code===code);
}
try {
  await db.exec(legacy);
  const before = await legacyCatalog();
  await db.exec(migration);
  await check('verificación operativa acepta fundamento vacío',()=>db.exec(verification));
  await check('rollback vacío devuelve schema legado', async()=>{
    await db.exec(rollback);
    assert.equal(await scalar("select to_regclass('public.tenants')"),null);
    assert.deepEqual(await legacyCatalog(),before);
    assert.equal(await scalar("select count(*) from information_schema.columns where table_schema='public' and column_name='tenant_id'"),0);
  });
  await db.exec(migration);
  await check('verificación detecta grant anon accidental',async()=>{
    await db.exec('grant execute on function public.plan_tenant_id() to anon');
    try { await assert.rejects(()=>db.exec(verification), /EXECUTE incorrecto/); }
    finally { await db.exec('rollback; revoke execute on function public.plan_tenant_id() from anon'); }
  });
  await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,11) n;
    insert into public.tenants(id,slug,nombre) values ('${uid(101)}','empresa-1','Empresa de prueba 1'),('${uid(102)}','empresa-2','Empresa de prueba 2');
    insert into public.plataforma_administradores(user_id) values('${uid(11)}');
    insert into public.tenant_miembros(tenant_id,user_id,rol)
      select '${uid(101)}',id,case when id='${uid(1)}' then 'administrador' else 'tecnico' end from auth.users where id in ('${uid(1)}','${uid(2)}');
    insert into public.tenant_miembros(tenant_id,user_id,rol) values ('${uid(102)}','${uid(3)}','administrador');`);
  for(const fn of ['plan_es_creador()','plan_tenant_id()',`plan_es_admin_tenant(uuid)`]) {
    await check(`anon sin EXECUTE ${fn}`,async()=>assert.equal(await scalar(`select has_function_privilege('anon','public.${fn}','EXECUTE')`),false));
  }
  await check('invocación anon rechazada en SQL',()=>asUser(4,()=>denied('select public.plan_tenant_id()'),'anon'));
  for(const [n,count] of [[1,1],[2,1],[3,1],[4,0],[11,2]]) {
    await check(`visibilidad tenants usuario ${n}`,()=>asUser(n,async()=>assert.equal(await scalar('select count(*) from tenants'),count)));
  }
  await check('técnico solo lee membresía propia',()=>asUser(2,async()=>assert.equal(await scalar('select count(*) from tenant_miembros'),1)));
  await check('admin lee miembros de su empresa',()=>asUser(1,async()=>assert.equal(await scalar('select count(*) from tenant_miembros'),2)));
  await check('tabla temporal no suplanta identidad de empresa',()=>asUser(2,async()=>{
    await db.exec(`create temp table tenant_miembros(tenant_id uuid,user_id uuid,activo boolean); insert into pg_temp.tenant_miembros values('${uid(102)}','${uid(2)}',true)`);
    assert.equal(await scalar('select public.plan_tenant_id()'),uid(101));
  }));
  await check('admin empresa 1 no administra empresa 2',()=>asUser(1,async()=>assert.equal(await scalar(`select plan_es_admin_tenant('${uid(102)}')`),false)));
  await check('identidad sin membresía no es creador',()=>asUser(4,async()=>assert.equal(await scalar('select plan_es_creador()'),false)));
  for(const table of ['tenants','tenant_miembros','plataforma_administradores']) {
    await check(`sin escritura directa ${table}`,()=>asUser(11,()=>denied(`delete from public.${table}`)));
    await check(`anon sin SELECT ${table}`,()=>asUser(4,()=>denied(`select * from public.${table}`),'anon'));
  }
  await check('cuenta no se asigna a dos empresas activas',()=>denied(`insert into tenant_miembros(tenant_id,user_id,rol) values('${uid(102)}','${uid(2)}','tecnico')`,'23505'));
  await db.exec(`update tenants set activo=false where id='${uid(101)}'`);
  await check('tenant desactivado invalida tenant_id',()=>asUser(1,async()=>assert.equal(await scalar('select plan_tenant_id()'),null)));
  await check('tenant desactivado invalida administrador',()=>asUser(1,async()=>assert.equal(await scalar(`select plan_es_admin_tenant('${uid(101)}')`),false)));
  await check('tenant desactivado oculta membresías',()=>asUser(1,async()=>assert.equal(await scalar('select count(*) from tenant_miembros'),0)));
  await db.exec(`update tenants set activo=true where id='${uid(101)}'; update tenant_miembros set activo=false where user_id='${uid(2)}'`);
  await check('revocación invalida helper',()=>asUser(2,async()=>assert.equal(await scalar('select plan_tenant_id()'),null)));
  await db.exec(`update plataforma_administradores set activo=false where user_id='${uid(11)}'`);
  await check('creador desactivado pierde acceso',()=>asUser(11,async()=>assert.equal(await scalar('select count(*) from tenants'),0)));
  await db.exec(`update plataforma_administradores set activo=true where user_id='${uid(11)}'`);
  await check('cliente legado crea obra y trigger crea supervisor',()=>asUser(1,async()=>{
    await db.query(`insert into proyectos(id,nombre,plano_url,created_by) values('${uid(201)}','Obra sintética','fixture.pdf','${uid(1)}')`);
    assert.equal(await scalar(`select rol from proyecto_miembros where proyecto_id='${uid(201)}'`),'supervisor');
    await db.query(`update proyectos set nombre='Nombre editado' where id='${uid(201)}'`);
    assert.equal(await scalar(`select nombre from proyectos where id='${uid(201)}'`),'Nombre editado');
  }));
  await db.exec(`insert into proyectos(id,nombre,plano_url,created_by) values('${uid(201)}','Obra sintética','fixture.pdf','${uid(1)}');`);
  await check('cliente no reasigna tenant de proyecto',()=>asUser(1,()=>denied(`update proyectos set tenant_id='${uid(102)}' where id='${uid(201)}'`)));
  await check('cliente no inyecta tenant al crear proyecto',()=>asUser(1,()=>denied(`insert into proyectos(nombre,plano_url,created_by,tenant_id) values('Ataque','fixture.pdf','${uid(1)}','${uid(102)}')`)));
  await check('cliente no reasigna tenant de membresía',()=>asUser(1,()=>denied(`update proyecto_miembros set tenant_id='${uid(102)}' where proyecto_id='${uid(201)}'`)));
  await check('cliente no inyecta tenant al agregar miembro',()=>asUser(1,()=>denied(`insert into proyecto_miembros(proyecto_id,user_id,rol,tenant_id) values('${uid(201)}','${uid(4)}','tecnico','${uid(102)}')`)));
  await check('rollback con datos se detiene',async()=>{
    try { await assert.rejects(()=>db.exec(rollback), /Rollback detenido/); } finally { await db.exec('rollback'); }
    assert.equal(await scalar('select count(*) from tenants'),2);
    assert.equal(await scalar('select count(*) from proyectos'),1);
  });
} catch(error) {
  results.push({name:'preparación/ejecución de suite',ok:false,error:error.message});
  await db.exec('rollback').catch(()=>{});
} finally {
  const version = await scalar('select version()');
  await db.close();
  const report={scope:'PostgreSQL WASM 17 local; auth.uid simulado, dos tablas legadas reconstruidas. No prueba JWT, REST, Storage ni concurrencia real.',version,migrationSha256:createHash('sha256').update(migration).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};
  await mkdir('docs/estabilizacion-2026-09-20/dia-2',{recursive:true});
  await writeFile('docs/estabilizacion-2026-09-20/dia-2/sql-tests.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(results.some(r=>!r.ok)) process.exitCode=1;
}
