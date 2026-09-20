// Recuperación local con las filas privadas capturadas. Solo imprime conteos/hash.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const dir='.backups.local/2026-09-20-dia4/';
const bytes=await readFile(dir+'domain-data-rest.json');const data=JSON.parse(bytes);
const tables=['proyectos','proyecto_miembros','campos_definicion','ordenes','fotos','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs','tenants','tenant_miembros','plataforma_administradores'];
const db=new PGlite();
const run=async path=>db.exec(await readFile(path,'utf8'));
const dump=async()=>{
  const output={};
  for(const t of tables)output[t]=(await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]') rows from (select to_jsonb(t) r from public.${t} t) q`)).rows[0].rows;
  return output;
};
try{
  await run('supabase/tests/captured-domain.sql');await run('supabase/migrations/202609200001_multitenancy_foundation.sql');
  const ids=new Set();
  for(const t of tables)for(const row of data[t])for(const k of ['created_by','updated_by','uploaded_by','user_id','invitado_por','eliminado_por'])if(row[k])ids.add(row[k]);
  for(const id of ids)await db.query('insert into auth.users(id) values($1) on conflict do nothing',[id]);
  for(const t of tables)await db.exec(`alter table public.${t} disable trigger user`);
  for(const t of tables)if(data[t].length)await db.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t},$1::jsonb)`,[JSON.stringify(data[t])]);
  for(const t of tables)await db.exec(`alter table public.${t} enable trigger user`);
  const original=await dump();
  await run('supabase/migrations/202609200002_multitenancy_enforcement.sql');
  await run('supabase/verification/202609200002_multitenancy_enforcement.verify.sql');
  const creds=JSON.parse(await readFile(dir+'test-credentials.local.json','utf8'));
  for(const c of creds)await db.query('insert into auth.users(id,email) values($1,$2)',[c.id,c.email]);
  await run('supabase/seeds/20260920_fictional_tenants.sql');
  await db.query(`insert into ordenes(proyecto_id,ot,ubicacion,rubro,responsable,prioridad,plano_ref_url) values('11000000-0000-4000-8000-000000000001','QA','Sector A','Prueba','Prueba','Media','/fixtures/plano-prueba.svg')`);
  await run('supabase/rollback/20260920_fictional_tenants.rollback.sql');
  await run('supabase/rollback/202609200002_multitenancy_enforcement.rollback.sql');
  assert.deepEqual(await dump(),original);
  const report={testedAt:new Date().toISOString(),scope:'Restauración de filas de dominio en PostgreSQL local y ciclo fase2/seed/reversión. Auth simulado. No restaura archivos Storage ni usuarios Auth remotos.',backupSha256:createHash('sha256').update(bytes).digest('hex'),legacyRowsPreserved:true,counts:Object.fromEntries(tables.map(t=>[t,data[t].length]))};
  await writeFile('docs/estabilizacion-2026-09-20/dia-4/recovery-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error('Recuperación fallida:',e.code??'',e.message);process.exitCode=1;}finally{await db.close();}
