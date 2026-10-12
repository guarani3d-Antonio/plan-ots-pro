import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID,X509Certificate} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {writeArchive,unpackArchive,scopeSnapshot,canonical,reuseIndex} from '../server/backup/archive.mjs';
import {companyInsertSql,rowFingerprint,rehearseRecovery,command,commandDiagnostic,recoveryFailure,laboratorySessionSql} from '../server/backup/recovery.mjs';
import {databaseOptions,dumpEnvironment} from '../server/backup/database.mjs';
import pg from 'pg';

// A bare dashboard URI must still enforce TLS. Neither URL options nor ambient
// libpq settings may turn certificate checks off. Secrets stay out of argv.
const fakeConnection='postgresql://postgres.example:fake%40password@example.invalid:5432/postgres';
const secureClient=new pg.Client(databaseOptions(fakeConnection));
assert.equal(secureClient.ssl.rejectUnauthorized,true);
const secureDump=dumpEnvironment(fakeConnection,{PGSSLMODE:'disable',PGSSLROOTCERT:'wrong'});
assert.equal(secureDump.PGSSLMODE,'verify-full');
const trustedSource=new X509Certificate(await readFile(secureDump.PGSSLROOTCERT));
assert.equal(trustedSource.fingerprint256,'80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
assert.ok(secureClient.ssl.ca.includes(trustedSource.toString()));
assert.equal(secureDump.PGPASSWORD,'fake@password');assert.equal(secureDump.PGCONNECT_TIMEOUT,'15');
assert.equal(new pg.Client(databaseOptions(fakeConnection+'?sslmode=verify-full&sslrootcert=system')).ssl.rejectUnauthorized,true);
for(const suffix of ['?sslmode=disable','?sslmode=no-verify','?sslmode=require','?ssl=false','?sslrootcert=unknown'])assert.throws(()=>databaseOptions(fakeConnection+suffix));

// Diagnostic reports must identify the failed restore stage without copying
// stderr, SQL literals, credentials or the contents of a failed COPY row.
const privateFailure='pg_restore: from TOC entry 1234; 0 0 TABLE DATA public synthetic\nERROR: invalid input syntax\nCOPY synthetic, line 1: private-person@example.invalid secret-password';
assert.deepEqual(commandDiagnostic(privateFailure,1),{codigoSalida:1,entradaToc:1234,categoria:'dato_invalido'});
await assert.rejects(()=>command(process.execPath,['-e','process.stderr.write('+JSON.stringify(privateFailure)+');process.exit(1)']),error=>{
 error.recoveryStage='restaurar_dump';const report=recoveryFailure(error);
 assert.equal(report.diagnostico.etapa,'restaurar_dump');assert.equal(report.diagnostico.entradaToc,1234);
 assert.ok(!JSON.stringify(report).includes('private-person'));assert.ok(!JSON.stringify(report).includes('secret-password'));return true;
});
assert.equal(recoveryFailure(new Error('private data')).estado,'fallida');
assert.ok(!JSON.stringify(recoveryFailure(new Error('private data'))).includes('private data'));
assert.throws(()=>laboratorySessionSql({settings:{TimeZone:'x'.repeat(101)}}));

const dir=await mkdtemp(join(tmpdir(),'plan-ots-backup-test-'));
const db=new PGlite();
const creator=randomUUID(),technician=randomUUID(),a=randomUUID(),b=randomUUID();
try {
 await db.exec("create temporary table temporal_proof(value timestamptz);insert into temporal_proof values('2026-10-12T13:38:27.123456+00');SET TIME ZONE 'UTC';");
 const sourceTime=(await db.query('select to_jsonb(t) value from temporal_proof t')).rows[0].value;
 await db.exec("SET TIME ZONE 'America/Asuncion';");
 const changedZone=(await db.query('select to_jsonb(t) value from temporal_proof t')).rows[0].value;
 assert.notEqual(rowFingerprint([sourceTime]),rowFingerprint([changedZone]));
 await db.exec(laboratorySessionSql());
 const restoredTime=(await db.query('select to_jsonb(t) value from temporal_proof t')).rows[0].value;
 assert.equal(rowFingerprint([sourceTime]),rowFingerprint([restoredTime]));
 assert.ok(restoredTime.value.includes('.123456')); // Preserve microseconds.
 assert.notEqual(rowFingerprint([{value:0.1234567890123456}]),rowFingerprint([{value:0.1234567890123457}])); // No tolerance hides changed coordinates.
 await db.exec('drop table temporal_proof;');
 const key=randomBytes(32).toString('base64'),file=join(dir,'copy.potbackup');
 const sample={ot:'OT-003035',visitas:[{version:1,motivo:'Verificación',firma:'trazo'}],importe:'9007199254740993.12'};
 await writeArchive(file,[{name:'datos/snapshot.json',content:canonical(sample)},{name:'archivos/0.bin',content:Buffer.from([0,255,31,91])}],{backupId:a,tenantId:null},key);
 const restored=await unpackArchive(file,join(dir,'valid.zip'),key);
 assert.deepEqual(JSON.parse(await restored.zip.file('datos/snapshot.json').async('string')),sample);
 assert.deepEqual(await restored.zip.file('archivos/0.bin').async('nodebuffer'),Buffer.from([0,255,31,91]));
 await assert.rejects(()=>unpackArchive(file,join(dir,'wrong.zip'),randomBytes(32).toString('base64')));
 const damaged=Buffer.from(await readFile(file));damaged[55]^=1;await writeFile(join(dir,'damaged.potbackup'),damaged);
 await assert.rejects(()=>unpackArchive(join(dir,'damaged.potbackup'),join(dir,'damaged.zip'),key));
 await assert.rejects(()=>unpackArchive(file,join(dir,'small.zip'),key,10),/capacidad/);
 await assert.rejects(()=>writeArchive(join(dir,'bad.potbackup'),[{name:'../escape',content:'x'}],{},key),/Ruta/);
 await assert.rejects(()=>writeArchive(join(dir,'duplicate.potbackup'),[{name:'datos/a',content:'x'},{name:'datos/a',content:'y'}],{},key),/duplicada/);

 const snapshot={tablas:{tenants:[{id:a},{id:b}],tenant_miembros:[{tenant_id:a,user_id:creator},{tenant_id:b,user_id:technician}],profiles:[{id:creator},{id:technician}],proyectos:[{tenant_id:a,id:'p'},{tenant_id:b,id:'q'}],ordenes:[{id:'o',proyecto_id:'p'},{id:'otro',proyecto_id:'q'}],versiones:[{orden_id:'o',datos:sample},{orden_id:'otro',datos:{}}]},relaciones:[{tabla:'ordenes',columna:'proyecto_id',padre:'proyectos',clave:'id'},{tabla:'versiones',columna:'orden_id',padre:'ordenes',clave:'id'}],storage:[{bucket_id:'fotos',name:a+'/photo.jpg'},{bucket_id:'fotos',name:b+'/private.jpg'},{bucket_id:'profile-photos',name:creator+'/face.jpg'}]};
 const scoped=scopeSnapshot(snapshot,a);
 assert.equal(scoped.tablas.ordenes.length,1);assert.equal(scoped.tablas.versiones[0].datos.importe,sample.importe);
 assert.equal(scoped.tablas.profiles.length,1);assert.equal(scoped.storage.length,2);
 assert.equal(scopeSnapshot({...snapshot,tablas:{...snapshot.tablas,proyectos:[{tenant_id:a,id:'p',referencia:`storage://fotos/${b}/private.jpg`}]}},a).storage.length,2);
 assert.equal(scopeSnapshot(snapshot,null),snapshot);
 assert.throws(()=>scopeSnapshot({...snapshot,tablas:{...snapshot.tablas,nuevo_sin_alcance:[{dato:'no omitir'}]}},a),/Cobertura/);
 // Composite foreign keys must match together, not just their repeated IDs.
 const composite={tablas:{tenants:[{id:a},{id:b}],padres:[{tenant_id:a,id:'same'}],hijos:[{propietario:a,padre:'same'},{propietario:b,padre:'same'}]},storage:[],relaciones:[{restriccion:'c',tabla:'hijos',columna:'propietario',padre:'padres',clave:'tenant_id'},{restriccion:'c',tabla:'hijos',columna:'padre',padre:'padres',clave:'id'}]};
 assert.equal(scopeSnapshot(composite,a).tablas.hijos.length,1);
 const old={storage:[{bucket_id:'fotos',name:'a',updated_at:'1',metadata:{size:42},backupEntry:'archivos/0.bin'}]};
 assert.equal(reuseIndex(old,{storage:[{bucket_id:'fotos',name:'a',updated_at:'1',metadata:{size:42}}]}).size,1);
 assert.equal(reuseIndex(old,{storage:[{bucket_id:'fotos',name:'a',updated_at:'2',metadata:{size:42}}]}).size,0);
 assert.equal(reuseIndex(old,{storage:[{bucket_id:'fotos',name:'nuevo',updated_at:'1',metadata:{size:42}}]}).size,0);

 const setup=`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.plan_es_creador() returns boolean language sql stable as $$select auth.uid()='${creator}'::uuid$$;
 create table public.tenants(id uuid primary key,nombre text);
 create table public.proyectos(id uuid primary key,tenant_id uuid references public.tenants,importe numeric(30,2));
 create table public.ordenes(id uuid primary key,proyecto_id uuid references public.proyectos,datos jsonb,contador bigint);
 create table storage.buckets(id text primary key,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb);`;
 const migration=await readFile(new URL('../supabase/migrations/202610100001_backup_jobs.sql',import.meta.url),'utf8');
 const operational=await readFile(new URL('../supabase/migrations/202610110001_backup_operational.sql',import.meta.url),'utf8');
 const latestRecovery=await readFile(new URL('../supabase/migrations/202610110002_backup_latest_recovery.sql',import.meta.url),'utf8');
 await db.exec(setup);await db.exec(migration);
 await db.query('insert into auth.users values($1),($2)',[creator,technician]);
 await db.query('insert into tenants values($1,$2),($3,$4)',[a,'Prueba A',b,'Prueba B']);
 const project=randomUUID(),order=randomUUID();
 await db.query('insert into proyectos values($1,$2,$3)',[project,a,sample.importe]);
 await db.query('insert into ordenes values($1,$2,$3,$4)',[order,project,sample,'9007199254740993']);
 await db.exec(`insert into storage.buckets values('fotos',false);insert into storage.objects(bucket_id,name,metadata) values('fotos','foto.jpg','{"size":42}'),('fotos','unknown.jpg','{}');`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[creator]);await db.exec('set role authenticated');
 const uuid=randomUUID();
 await assert.rejects(()=>db.query('select plan_respaldo_solicitar($1,$2)',[a,uuid]),/Conectá/);
 await assert.rejects(()=>db.query('select plan_respaldo_programar(true,24)'),/Conectá/);
 await assert.rejects(()=>db.query('select plan_respaldo_snapshot()'),e=>e.code==='42501');
 await assert.rejects(()=>db.query('update plan_respaldo_config set activo=true'),e=>e.code==='42501');
 await db.exec("reset role;update plan_respaldo_config set destino='r2_verificado';set role authenticated;");
 const id=(await db.query('select plan_respaldo_solicitar($1,$2) id',[a,uuid])).rows[0].id;
 assert.equal((await db.query('select plan_respaldo_solicitar($1,$2) id',[a,uuid])).rows[0].id,id);
 await assert.rejects(()=>db.query('select plan_respaldo_solicitar($1,$2)',[b,uuid]),/otro alcance/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[technician]);
 assert.equal((await db.query('select * from plan_respaldos')).rows.length,0);
 await assert.rejects(()=>db.query('select plan_respaldo_solicitar($1,$2)',[a,randomUUID()]),e=>e.code==='42501');
 await assert.rejects(()=>db.query('select plan_respaldo_inventario()'),e=>e.code==='42501');
 await db.exec('reset role;set role service_role');
 const taken=(await db.query('select * from plan_respaldo_tomar()')).rows[0];assert.equal(taken.id,id);assert.ok(taken.lease);
 assert.equal((await db.query('select plan_respaldo_tomar() job')).rows[0].job,null);
 await db.exec("update plan_respaldos set lease_hasta=now()-interval '1 minute',intentos=5");
 await db.query('select plan_respaldo_tomar()');assert.equal((await db.query('select estado from plan_respaldos')).rows[0].estado,'error');
 const captured=(await db.query('select plan_respaldo_snapshot() value')).rows[0].value;
 assert.equal(captured.tablas.proyectos[0].importe,sample.importe);assert.equal(captured.tablas.ordenes[0].contador,'9007199254740993');
 assert.deepEqual(captured.tablas.ordenes[0].datos,sample);assert.equal(captured.storage.length,2);
 assert.ok(!Object.hasOwn(captured.tablas,'plan_respaldos'));
 await db.exec('reset role;alter table ordenes add column campo_nuevo text');
 const newer=(await db.query('select plan_respaldo_snapshot() value')).rows[0].value;
 assert.ok(Object.hasOwn(newer.tablas.ordenes[0],'campo_nuevo'));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[creator]);await db.exec('set role authenticated');
 const inventory=(await db.query('select plan_respaldo_inventario() value')).rows[0].value;
 assert.equal(inventory.buckets[0].bytes,42);assert.equal(inventory.buckets[0].sin_tamano,1);
 assert.ok(inventory.tablas.find(t=>t.nombre==='ordenes').columnas.includes('campo_nuevo'));
 await db.exec('reset role');await db.exec(operational);await db.exec(latestRecovery);
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select plan_respaldo_programar(true,24)'),/motor/);
 await assert.rejects(()=>db.query('select plan_respaldo_programar(false,null)'),/inválida/);
 await assert.rejects(()=>db.query('select plan_respaldo_latido()'),e=>e.code==='42501');
 await db.exec('reset role;set role service_role');await db.query('select plan_respaldo_latido()');
 assert.equal((await db.query('select plan_respaldo_listo($1) listo',[a])).rows[0].listo,false);
 await db.exec('reset role;set role authenticated');
 await assert.rejects(()=>db.query('select plan_respaldo_programar(true,24)'),/laboratorio/);
 await db.exec('reset role');
 await db.query("insert into plan_respaldos(solicitud_id,estado,corte_en,paquete_path,paquete_sha256,bytes,integridad_en,recuperacion_en) values($1,'creada',now(),'proof',$2,42,now(),now())",[randomUUID(),'a'.repeat(64)]);
 await db.exec('set role authenticated');await db.query('select plan_respaldo_programar(true,24)');
 let status=(await db.query('select plan_respaldo_estado($1) value',[a])).rows[0].value;
 assert.equal(status.listo_para_piloto,true);assert.equal(status.motor_disponible,true);
 // A later archive with intact bytes but failed rehearsal cannot borrow the
 // successful recovery of an older archive, nor enable automatic operation.
 await db.exec('reset role');
 const untested=(await db.query("insert into plan_respaldos(solicitud_id,estado,creado_en,corte_en,paquete_path,paquete_sha256,bytes,integridad_en) values($1,'creada',now()+interval '1 second',now(),'untested',$2,42,now()) returning id",[randomUUID(),'b'.repeat(64)])).rows[0].id;
 await db.exec('set role authenticated');
 status=(await db.query('select plan_respaldo_estado($1) value',[a])).rows[0].value;
 assert.equal(status.listo_para_piloto,false);assert.equal(status.puede_programar,false);
 await assert.rejects(()=>db.query('select plan_respaldo_programar(true,24)'),/última copia/);
 await db.exec('reset role');await db.query('update plan_respaldos set recuperacion_en=now() where id=$1',[untested]);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select plan_respaldo_estado($1) value',[a])).rows[0].value.listo_para_piloto,true);
 await db.exec("reset role;update plan_respaldo_config set motor_en=now()-interval '3 hours';set role authenticated");
 assert.equal((await db.query('select plan_respaldo_estado($1) value',[a])).rows[0].value.listo_para_piloto,false);
 await db.exec('reset role;set role service_role');await db.query('select plan_respaldo_latido()');await db.exec('reset role');
 await db.query("insert into plan_respaldos(solicitud_id,estado,creado_en) values($1,'incompleta',now()+interval '1 minute')",[randomUUID()]);
 await db.exec('set role service_role');
 assert.equal((await db.query('select plan_respaldo_listo($1) listo',[a])).rows[0].listo,false);
 await db.exec('reset role;set role authenticated');await db.query('select plan_respaldo_programar(false,24)');
 assert.equal((await db.query('select siguiente_en from plan_respaldo_config')).rows[0].siguiente_en,null);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[technician]);
 await assert.rejects(()=>db.query('select plan_respaldo_estado($1)',[a]),e=>e.code==='42501');
 const rehearsal=await rehearseRecovery(restored,dir,undefined);assert.equal(rehearsal.correcto,false);assert.equal(rehearsal.estado,'pendiente');
 // Execute the actual company recovery SQL in a second isolated PostgreSQL, not
 // just serialization. This checks writable columns and bigint/decimal casts.
 const lab=new PGlite();try{
  await lab.exec(setup);await lab.exec(migration);await lab.exec('alter table ordenes add column campo_nuevo text');
  const company=scopeSnapshot(newer,a);
  // Only archive-selected object metadata belongs in a scoped restore.
  company.storage=[];
  await lab.exec(companyInsertSql(company));
  const recovered=(await lab.query('select plan_respaldo_snapshot() value')).rows[0].value;
  for(const [table,rows] of Object.entries(company.tablas))assert.equal(rowFingerprint(recovered.tablas[table]||[]),rowFingerprint(rows),table);
 }finally{await lab.close();}
 console.log('OK: cifrado, alteración, claves, archivos, aislamiento, precisión, permisos, cola, inventario, recuperación SQL aislada y bloqueo de activación sin recuperación/motor vigente.');
} finally {await db.close();await rm(dir,{recursive:true,force:true});}
