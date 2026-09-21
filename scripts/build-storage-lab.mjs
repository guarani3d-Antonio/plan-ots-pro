import {readFile,writeFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/schema-before.json','utf8'));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const policies=baseline.policies.filter(p=>p.schemaname==='storage').map(p=>`create policy ${q(p.policyname)} on storage.objects for ${p.cmd} to ${p.roles.map(q).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`).join('\n');
await writeFile('supabase/tests/storage-foundation.sql',`-- Metadata mínima de Storage. No simula binarios ni API HTTP.\ncreate schema storage;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table storage.buckets(id text primary key,public boolean not null default false);
insert into storage.buckets values('planos',true),('fotos',true),('exports',false);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner uuid,owner_id text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
${policies}\n`);
const phase2=await readFile('supabase/migrations/202609200002_multitenancy_enforcement.sql','utf8');
const start=phase2.indexOf('create function public.plan_crear_proyecto(');
const rpc=phase2.slice(start,phase2.indexOf('end $$;',start)+7).replace('create function','create or replace function');
await writeFile('supabase/rollback/202609210003_private_storage.rollback.sql',`-- Restaurar políticas/funciones de fase 2. No publica buckets ni elimina objetos.
begin;
set local lock_timeout='5s';
drop policy plan_objects_read on storage.objects;
drop policy plan_objects_insert on storage.objects;
drop policy plan_objects_delete on storage.objects;
drop trigger plan_validar_archivos on public.fotos;
drop trigger plan_validar_archivos on public.proyectos;
drop function public.plan_validar_archivos();
drop function public.plan_storage_permitido(text,text,text);
drop function public.plan_archivo_de_proyecto(text,text,uuid);
drop function public.plan_storage_proyecto(text,text);
drop function public.plan_storage_path(text,text);
drop table public.plan_archivos_legados;
${rpc}
${policies}
commit;\n`);
console.log('Fixture y rollback Storage preparados desde el catálogo capturado.');
