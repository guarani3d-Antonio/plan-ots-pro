-- Metadata mínima de Storage. No simula binarios ni API HTTP.
create schema storage;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table storage.buckets(id text primary key,public boolean not null default false);
insert into storage.buckets values('planos',true),('fotos',true),('exports',false);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner uuid,owner_id text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
create policy "Miembros pueden ver planos" on storage.objects for SELECT to "public" using (((bucket_id = 'planos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Supervisores pueden subir planos" on storage.objects for INSERT to "public" with check (((bucket_id = 'planos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Supervisores pueden eliminar planos" on storage.objects for DELETE to "public" using (((bucket_id = 'planos'::text) AND (auth.uid() = owner)));
create policy "Miembros pueden ver fotos" on storage.objects for SELECT to "public" using (((bucket_id = 'fotos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Técnicos pueden subir fotos" on storage.objects for INSERT to "public" with check (((bucket_id = 'fotos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Propietario puede eliminar fotos" on storage.objects for DELETE to "public" using (((bucket_id = 'fotos'::text) AND (auth.uid() = owner)));
create policy "Miembros pueden ver exports" on storage.objects for SELECT to "public" using (((bucket_id = 'exports'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Miembros pueden subir exports" on storage.objects for INSERT to "public" with check (((bucket_id = 'exports'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Propietario puede eliminar exports" on storage.objects for DELETE to "public" using (((bucket_id = 'exports'::text) AND (auth.uid() = owner)));
