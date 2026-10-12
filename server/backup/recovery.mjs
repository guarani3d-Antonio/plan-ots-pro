// Isolated rehearsal only. There is deliberately no production restore endpoint.
import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from './archive.mjs';

const identifier=s=>'"'+String(s).replaceAll('"','""')+'"';
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
export const rowFingerprint=rows=>digest(canonical(rows.map(canonical).sort()));
export const PILOT_LAB_IMAGE='supabase/postgres:17.6.1.095@sha256:4c087262afbfbb47da86e2863a52d7e424eb21ab589f732d77eeaab51be8e521';

// Never persist raw stderr: pg_restore may include COPY rows, SQL literals or
// authentication data. These fixed categories and TOC numbers are safe to show.
export function commandDiagnostic(stderr,code){
 const diagnostic={codigoSalida:Number.isInteger(code)?code:null};
 const toc=String(stderr).match(/from TOC entry (\d+);/);
 if(toc)diagnostic.entradaToc=Number(toc[1]);
 const categories=[['objeto_duplicado',/already exists/],['referencia_incompleta',/violates foreign key constraint/],['permiso_denegado',/permission denied/],['dependencia_ausente',/does not exist|could not open extension control file/],['dato_invalido',/invalid input syntax|out of range/]];
 diagnostic.categoria=categories.find(([,pattern])=>pattern.test(String(stderr)))?.[0]||'comando_fallido';
 return diagnostic;
}
export function recoveryFailure(error){
 return {correcto:false,estado:'fallida',mensaje:'La copia existe, pero el ensayo aislado no se completó.',diagnostico:{etapa:error?.recoveryStage||'laboratorio',...(error?.recoveryDiagnostic||{})}};
}
export function laboratorySessionSql(environment={}){
 const settings=environment.settings||{};
 // The first Plan-OTs archive predates captured settings. Its Supabase source
 // used UTC and extra_float_digits=0 (verified in pg_settings). Match that
 // snapshot's representation; never round rows or relax their fingerprints.
 // New archives explicitly carry their source session's settings.
 const values={TimeZone:settings.TimeZone||'UTC',DateStyle:settings.DateStyle||'ISO, MDY',IntervalStyle:settings.IntervalStyle||'postgres',extra_float_digits:settings.extra_float_digits||'0'};
 if(Object.values(values).some(v=>typeof v!=='string'||v.length>100))throw new Error('Configuración de representación inválida');
 return Object.entries(values).map(([key,value])=>`SET ${key}=${literal(value)};`).join('');
}

export async function command(binary,args,input){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',length=0,stderr='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('El laboratorio excedió el tiempo permitido'));},120000);
  child.stdout.on('data',chunk=>{length+=chunk.length;if(length>256*1024*1024){child.kill();reject(new Error('Salida del laboratorio demasiado grande'));}else output+=chunk;});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});child.stdin.on('error',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Falta instalar '+binary+' en el servicio de respaldo'));});
  child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(output);else{const error=new Error('No se pudo completar el ensayo aislado ('+binary+')');error.recoveryDiagnostic=commandDiagnostic(stderr,code);reject(error);}stderr='';});
  child.stdin.end(input);
 });
}

export function companyInsertSql(snapshot){
 const users=new Set();
 for(const edge of snapshot.relaciones||[])if(edge.esquema_padre==='auth'&&edge.padre==='users')for(const row of snapshot.tablas[edge.tabla]||[])if(row[edge.columna])users.add(row[edge.columna]);
 for(const row of [...snapshot.storage,...snapshot.buckets])if(row.owner)users.add(row.owner);
 let sql='begin;set local session_replication_role=replica;';
 // Stubs exist only in the air-gapped laboratory. Company archives contain no
 // login credentials and require the corresponding identities on real recovery.
 for(const id of users)sql+=`insert into auth.users(id) values(${literal(id)}::uuid) on conflict do nothing;`;
 const insert=(schema,table,rows,columns)=>{
  if(!rows.length)return;
  const cols=columns.map(identifier).join(',');
  const json=Buffer.from(canonical(rows)).toString('hex');
  sql+=`insert into ${identifier(schema)}.${identifier(table)}(${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::${identifier(schema)}.${identifier(table)},convert_from(decode('${json}','hex'),'UTF8')::jsonb);`;
 };
 for(const [table,rows] of Object.entries(snapshot.tablas)){
  const columns=snapshot.columnas.filter(c=>c.table_name===table&&c.is_generated!=='ALWAYS').map(c=>c.column_name);
  if(rows.length&&!columns.length)throw new Error('Faltan columnas del esquema para '+table);
  insert('public',table,rows,columns);
 }
 insert('storage','buckets',snapshot.buckets,Object.keys(snapshot.buckets[0]||{}));
 insert('storage','objects',snapshot.storage.map(({backupEntry,...row})=>row),Object.keys(snapshot.storage[0]||{}).filter(c=>c!=='backupEntry'));
 return sql+'commit;';
}

const validateForeignKeys=`do $$declare f record;bad bigint;begin
 for f in select con.oid,sn.nspname schema,s.relname tabla,pn.nspname parent_schema,p.relname parent,
 (select string_agg(format('c.%I is not null',a.attname),' and ') from unnest(con.conkey) k join pg_attribute a on a.attrelid=s.oid and a.attnum=k) required,
 (select string_agg(format('p.%I=c.%I',b.attname,a.attname),' and ') from unnest(con.conkey,con.confkey) k(child,parent) join pg_attribute a on a.attrelid=s.oid and a.attnum=k.child join pg_attribute b on b.attrelid=p.oid and b.attnum=k.parent) relation
 from pg_constraint con join pg_class s on s.oid=con.conrelid join pg_namespace sn on sn.oid=s.relnamespace join pg_class p on p.oid=con.confrelid join pg_namespace pn on pn.oid=p.relnamespace where con.contype='f' and sn.nspname in ('public','storage')
 loop execute format('select count(*) from %I.%I c where %s and not exists(select 1 from %I.%I p where %s)',f.schema,f.tabla,f.required,f.parent_schema,f.parent,f.relation) into bad;if bad>0 then raise exception 'Referencias incompletas';end if;end loop;end$$;`;

export async function startLaboratory(environment,image){
 if(!/^supabase\/postgres:[a-zA-Z0-9_.-]+@sha256:[a-f0-9]{64}$/.test(image))throw new Error('Se requiere una imagen oficial fijada por digest');
 const name='plan-ots-lab-'+randomUUID();let started=false;
 const exec=(args,input)=>command('docker',['exec','-i',name,...args],input);
 const sql=input=>exec(['psql','-X','-q','-t','-A','--set=ON_ERROR_STOP=1','-U','postgres','-d','postgres'],laboratorySessionSql(environment)+input);
 const close=()=>started?command('docker',['rm','--force',name]):Promise.resolve();
 try{
  // Supabase defaults to supabase_admin and /etc/postgresql, and ships init
  // migrations. Use an empty, private database instead; restore the archive's
  // schema, never a preinstalled schema that could conceal missing objects.
  // Local trust applies only to this disposable container: no ports or network.
  await command('docker',['run','--pull=never','--detach','--name',name,'--network','none','--memory','1g','--cpus','1',
   '--tmpfs','/var/lib/postgresql/data','--tmpfs','/docker-entrypoint-initdb.d',
   '-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres','-e','POSTGRES_HOST_AUTH_METHOD=trust',image,
   'postgres','-D','/var/lib/postgresql/data','-c','listen_addresses=',
   '-c','unix_socket_directories=/var/run/postgresql','-c','shared_preload_libraries=pg_stat_statements',
   '-c','vault.getkey_script=/usr/lib/postgresql/bin/pgsodium_getkey.sh']);started=true;
  let ready=false;for(let i=0;i<60;i++){try{await sql('select 1;');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)throw new Error('El laboratorio no está disponible');
  const major=Number((await sql("select current_setting('server_version_num')::int/10000;")).trim());
  if(major!==environment.postgresMajor)throw new Error('La versión del laboratorio debe coincidir con PostgreSQL de origen');
  let prep='drop schema public cascade;create schema public;';
  for(const role of environment.roles){if(!/^[a-zA-Z0-9_ -]+$/.test(role))throw new Error('Nombre de rol requiere revisión del laboratorio');prep+=`do $$begin if not exists(select 1 from pg_roles where rolname=${literal(role)}) then execute ${literal('create role '+identifier(role)+' nologin')};end if;end$$;`;}
  for(const ext of environment.extensiones){prep+=`create schema if not exists ${identifier(ext.schema)};create extension if not exists ${identifier(ext.name)} with schema ${identifier(ext.schema)} version ${literal(ext.version)};`;}
  await sql(prep);
  // IF NOT EXISTS alone would silently accept an incompatible extension.
  const installed=JSON.parse((await sql("select coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)), '[]'::jsonb) from pg_extension e join pg_namespace n on n.oid=e.extnamespace;")).trim());
  for(const expected of environment.extensiones)if(!installed.some(e=>e.name===expected.name&&e.schema===expected.schema&&e.version===expected.version))throw new Error('Extensión del laboratorio incompatible: '+expected.name);
  return {name,exec,sql,close,major};
 }catch(error){await close().catch(()=>{});throw error;}
}

export async function rehearseRecovery({zip,manifest},dir,image){
 if(!image)return {correcto:false,estado:'pendiente',mensaje:'Falta configurar el laboratorio aislado; la integridad del paquete sí fue comprobada.'};
 const snapshot=JSON.parse(await zip.file('datos/snapshot.json').async('string'));
 const dump=manifest.tenantId?'base/esquema.dump':'base/plataforma.dump';
 if(!zip.file(dump))throw new Error('Falta el esquema de recuperación');
 await writeFile(join(dir,'restore.dump'),await zip.file(dump).async('nodebuffer'),{mode:0o600,flag:'wx'});
 let lab,stage='iniciar_laboratorio';
 try {
  lab=await startLaboratory(snapshot.entorno,image);const {name,exec,sql}=lab;
  await command('docker',['cp',join(dir,'restore.dump'),name+':/tmp/restore.dump']);
  const existingSchemas=new Set(['public',...snapshot.entorno.extensiones.map(e=>e.schema)]);
  const list=(await exec(['pg_restore','--list','/tmp/restore.dump'])).split('\n').filter(line=>!([...existingSchemas].some(schema=>line.includes(' SCHEMA - '+schema+' '))));
  await writeFile(join(dir,'restore.list'),list.join('\n'),{mode:0o600});await command('docker',['cp',join(dir,'restore.list'),name+':/tmp/restore.list']);
  stage='restaurar_dump';
  await exec(['pg_restore','--exit-on-error','--no-owner','--use-list=/tmp/restore.list','-U','postgres','-d','postgres','/tmp/restore.dump']);
  stage='insertar_empresa';
  if(manifest.tenantId)await sql(companyInsertSql(snapshot));
  stage='validar_referencias';await sql(validateForeignKeys);
  stage='comparar_tablas';
  const recovered=JSON.parse((await sql('select public.plan_respaldo_snapshot();')).trim());
  for(const [table,rows] of Object.entries(snapshot.tablas))if(rowFingerprint(recovered.tablas[table]||[])!==rowFingerprint(rows)){const error=new Error('Los datos recuperados no coinciden');error.recoveryDiagnostic={categoria:'huellas_distintas',...( /^[a-z_][a-z0-9_]{0,62}$/.test(table)?{tabla:table}:{})};throw error;}
  stage='comparar_identidades';
  for(const [table,count] of Object.entries(snapshot.entorno.authConteos||{}))if(Number((await sql(`select count(*) from auth.${identifier(table)};`)).trim())!==Number(count))throw new Error('Las identidades recuperadas no coinciden');
  const objects=rows=>rows.map(({backupEntry,...row})=>row);
  stage='comparar_storage';
  if(rowFingerprint(objects(recovered.storage))!==rowFingerprint(objects(snapshot.storage))||rowFingerprint(recovered.buckets)!==rowFingerprint(snapshot.buckets))throw new Error('El inventario Storage recuperado no coincide');
  // Rehydrate each original byte stream into an isolated directory. Objects are
  // already hash-checked by unpackArchive; they are never uploaded to production.
  stage='reconstruir_archivos';
  for(let i=0;i<snapshot.storage.length;i++){const o=snapshot.storage[i];const entry=zip.file(o.backupEntry);if(!entry)throw new Error('Falta archivo de Storage');const file=join(dir,'recovered-'+i+'.bin');await writeFile(file,await entry.async('nodebuffer'),{mode:0o600,flag:'wx'});const proof=manifest.entries.find(e=>e.name===o.backupEntry);if(!proof||digest(await readFile(file))!==proof.sha256)throw new Error('El archivo recuperado no coincide');}
  return {correcto:true,estado:'comprobada',metodo:'PostgreSQL aislado sin red y reconstrucción de archivos',tablas:Object.keys(snapshot.tablas).length,archivos:snapshot.storage.length,identidades:manifest.tenantId?'Referencias con identidades de prueba; requiere cuentas originales para restaurar empresa':'Conteos Auth del corte comprobados',alcance:'Recuperación de datos y archivos; no certifica despliegue, conectividad ni login de una plataforma nueva'};
 } catch(error){error.recoveryStage=stage;throw error;} finally {if(lab)await lab.close().catch(()=>{});}
}
