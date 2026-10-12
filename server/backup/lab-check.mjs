// A single synthetic preflight: no Supabase connection, credentials or R2 calls.
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {startLaboratory,rehearseRecovery,command,PILOT_LAB_IMAGE} from './recovery.mjs';
import {writeArchive,unpackArchive,canonical} from './archive.mjs';

const environment={postgresMajor:17,roles:['anon','authenticated','service_role'],extensiones:[
 {name:'pg_stat_statements',schema:'extensions',version:'1.11'},
 {name:'pgcrypto',schema:'extensions',version:'1.3'},
 {name:'supabase_vault',schema:'vault',version:'0.3.1'},
 {name:'uuid-ossp',schema:'extensions',version:'1.1'},
],authConteos:{users:'1'},settings:{TimeZone:'UTC',extra_float_digits:'3'}};
const image=process.env.BACKUP_LAB_IMAGE||PILOT_LAB_IMAGE;
const dir=await mkdtemp(join(tmpdir(),'plan-ots-lab-preflight-'));let source,stage='inicio';
try{
 stage='arranque y extensiones';source=await startLaboratory(environment,image);
 stage='datos ficticios';
 await source.sql(`create schema auth;create schema storage;
 create table auth.users(id uuid primary key);insert into auth.users values('10000000-0000-4000-8000-000000000001');
 create table public.lab_ot(id bigint generated always as identity primary key,usuario uuid references auth.users(id),importe numeric(30,8),texto text,pos_x double precision,visita_en timestamptz);
 insert into public.lab_ot(usuario,importe,texto,pos_x,visita_en) values('10000000-0000-4000-8000-000000000001',9007199254740993.12345678,'Prueba ficticia: acento, firma y evidencia',0.1234567890123456,'2026-10-12T13:38:27.123456+00');
 alter table public.lab_ot enable row level security;grant select on public.lab_ot to authenticated;
 create policy lectura on public.lab_ot for select to authenticated using(usuario=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
 create table storage.buckets(id text primary key);insert into storage.buckets values('fotos');
 create table storage.objects(id uuid primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb);
 insert into storage.objects values('20000000-0000-4000-8000-000000000001','fotos','ficticia.bin','{"size":4}');
 create function public.plan_respaldo_snapshot() returns jsonb language sql stable as $$select jsonb_build_object(
 'tablas',jsonb_build_object('lab_ot',(select jsonb_agg(jsonb_build_object('id',id::text,'usuario',usuario,'importe',importe::text,'texto',texto,'pos_x',pos_x,'visita_en',visita_en)) from public.lab_ot)),
 'storage',(select jsonb_agg(to_jsonb(o)) from storage.objects o),'buckets',(select jsonb_agg(to_jsonb(b)) from storage.buckets b))$$;`);
 const snapshot=JSON.parse((await source.sql('select public.plan_respaldo_snapshot();')).trim());snapshot.entorno=environment;snapshot.storage[0].backupEntry='archivos/0.bin';
 stage='exportación ficticia';
 await source.exec(['pg_dump','--format=custom','--no-owner','--schema=public','--schema=auth','--schema=storage','-U','postgres','-d','postgres','--file=/tmp/fixture.dump']);
 const dump=join(dir,'fixture.dump');await command('docker',['cp',source.name+':/tmp/fixture.dump',dump]);await source.close();source=null;
 stage='cifrado ficticio';
 const key=randomBytes(32).toString('base64'),file=join(dir,'fixture.potbackup');
 await writeArchive(file,[{name:'datos/snapshot.json',content:canonical(snapshot)},{name:'base/plataforma.dump',content:await readFile(dump)},{name:'archivos/0.bin',content:Buffer.from([0,255,31,91])}],{backupId:randomUUID(),tenantId:null},key);
 const checked=await unpackArchive(file,join(dir,'fixture.zip'),key);
 stage='restauración y comparación ficticias';const proof=await rehearseRecovery(checked,dir,image);
 if(!proof.correcto)throw new Error('No se comprobó la recuperación');
 console.log(JSON.stringify({correcto:true,tipo:'preflight-sin-datos-reales',image,postgresMajor:environment.postgresMajor,extensiones:environment.extensiones,...proof}));
}catch{console.error('Preflight fallido en: '+stage+'. No se leyeron datos ni archivos de Supabase y no se escribió en R2.');process.exitCode=1;}
finally{if(source)await source.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
