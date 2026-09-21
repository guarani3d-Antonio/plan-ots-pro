-- Día 5. Políticas y referencias privadas. Los buckets se cambian a privados
-- mediante Storage API tras aplicar esta transacción; no se muta su metadata SQL.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Ejecutar mediante postgres'; end if;
  if to_regprocedure('public.plan_crear_proyecto(text,text,text,text,text[],text[],uuid)') is null then raise exception 'Falta fase 2'; end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname not in
    ('Miembros pueden ver planos','Supervisores pueden subir planos','Supervisores pueden eliminar planos',
     'Miembros pueden ver fotos','Técnicos pueden subir fotos','Propietario puede eliminar fotos',
     'Miembros pueden ver exports','Miembros pueden subir exports','Propietario puede eliminar exports')) then
    raise exception 'Política Storage inesperada: revisar antes de sustituir';
  end if;
end $$;

-- Asignación congelada de referencias legadas: un cliente no puede concederse
-- acceso a un objeto ajeno insertando su URL en proyectos/fotos/snapshots.
create table public.plan_archivos_legados (
  bucket_id text not null check(bucket_id in ('planos','fotos','exports')),
  object_name text not null,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  primary key(bucket_id,object_name,proyecto_id)
);
alter table public.plan_archivos_legados enable row level security;
revoke all on public.plan_archivos_legados from public,anon,authenticated;
grant select on public.plan_archivos_legados to authenticated;
create policy archivos_legados_select on public.plan_archivos_legados for select to authenticated
using(case when bucket_id='exports' then public.plan_es_supervisor_proyecto(proyecto_id) else public.plan_es_miembro_proyecto(proyecto_id) end);

create function public.plan_storage_path(p_ref text,p_bucket text)
returns text language plpgsql immutable security invoker set search_path=pg_catalog,pg_temp as $$
declare v text; result bytea:=''::bytea; i int:=1; ch text;
begin
  if p_bucket not in ('planos','fotos','exports') or p_ref is null then return null; end if;
  if starts_with(p_ref,'storage://'||p_bucket||'/') then
    return substr(p_ref,length('storage://'||p_bucket||'/')+1);
  end if;
  if starts_with(p_ref,'https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/public/'||p_bucket||'/') then
    v:=substr(p_ref,length('https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/public/'||p_bucket||'/')+1);
  else return null; end if;
  v:=split_part(v,'?',1);
  while i<=length(v) loop
    ch:=substr(v,i,1);
    if ch='%' then result:=result||decode(substr(v,i+1,2),'hex');i:=i+3;
    else result:=result||convert_to(ch,'UTF8');i:=i+1;end if;
  end loop;
  return convert_from(result,'UTF8');
exception when others then return null;
end $$;

-- Solo objetos existentes referenciados por filas de dominio. Las referencias
-- históricas de snapshots/videos también se preservan, sin abrir huérfanos.
insert into public.plan_archivos_legados(bucket_id,object_name,proyecto_id)
select distinct b.bucket, o.name, refs.proyecto_id
from (
  select p.id proyecto_id,v #>> '{}' ref from public.proyectos p cross join lateral jsonb_path_query(to_jsonb(p),'$.** ? (@.type() == "string")') v
  union all
  select t.proyecto_id,v #>> '{}' from public.ordenes t cross join lateral jsonb_path_query(to_jsonb(t),'$.** ? (@.type() == "string")') v
  union all
  select t.proyecto_id,v #>> '{}' from public.fotos t cross join lateral jsonb_path_query(to_jsonb(t),'$.** ? (@.type() == "string")') v
  union all
  select t.proyecto_id,v #>> '{}' from public.versiones t cross join lateral jsonb_path_query(to_jsonb(t),'$.** ? (@.type() == "string")') v
) refs
cross join (values('planos'),('fotos'),('exports')) b(bucket)
join storage.objects o on o.bucket_id=b.bucket and o.name=public.plan_storage_path(refs.ref,b.bucket)
where refs.proyecto_id in (select id from public.proyectos where tenant_id is null)
on conflict do nothing;
insert into public.plan_archivos_legados(bucket_id,object_name,proyecto_id)
select 'fotos',o.name,f.proyecto_id from public.fotos f join storage.objects o on o.bucket_id='fotos' and o.name=f.file_path
where f.proyecto_id in (select id from public.proyectos where tenant_id is null)
on conflict do nothing;

create function public.plan_storage_proyecto(p_bucket text,p_name text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare parts text[]:=string_to_array(p_name,'/'); v_id uuid; v_tenant uuid;
begin
  if p_bucket not in ('planos','fotos','exports') or cardinality(parts)<3
    or p_name like '%..%' or strpos(p_name,chr(92))>0 or ''=any(parts)
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
  v_id:=parts[2]::uuid;
  select tenant_id into v_tenant from public.proyectos where id=v_id and deleted_at is null;
  if not found or parts[1]<>coalesce(v_tenant::text,'legacy') then return null;end if;
  if p_bucket='fotos' then
    if cardinality(parts)<4 or parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
    if not exists(select 1 from public.ordenes where id=parts[3]::uuid and proyecto_id=v_id and deleted_at is null) then return null;end if;
  end if;
  return v_id;
end $$;

create function public.plan_storage_permitido(p_bucket text,p_name text,p_action text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto uuid;
begin
  if auth.uid() is null or p_action not in ('read','write','delete') then return false;end if;
  v_proyecto:=public.plan_storage_proyecto(p_bucket,p_name);
  if v_proyecto is not null then
    if p_bucket='exports' or (p_bucket='planos' and p_action<>'read') or p_action='delete' then
      return public.plan_es_supervisor_proyecto(v_proyecto);
    elsif p_action='write' then return public.plan_puede_editar_proyecto(v_proyecto);
    else return public.plan_es_miembro_proyecto(v_proyecto);end if;
  end if;
  if p_action<>'read' then return false;end if;
  return exists(select 1 from public.plan_archivos_legados a join public.proyectos p on p.id=a.proyecto_id
    where a.bucket_id=p_bucket and a.object_name=p_name and p.deleted_at is null and
    case when p_bucket='exports' then public.plan_es_supervisor_proyecto(p.id) else public.plan_es_miembro_proyecto(p.id) end);
end $$;

create function public.plan_archivo_de_proyecto(p_bucket text,p_name text,p_proyecto uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(public.plan_storage_proyecto(p_bucket,p_name)=p_proyecto,false)
    or exists(select 1 from public.plan_archivos_legados where bucket_id=p_bucket and object_name=p_name and proyecto_id=p_proyecto);
$$;

create function public.plan_validar_archivos()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
declare v_path text;
begin
  if current_user in ('postgres','service_role') then return new;end if;
  if tg_table_name='fotos' then
   if tg_op='INSERT' or new.file_url is distinct from old.file_url or new.file_path is distinct from old.file_path then
    v_path:=public.plan_storage_path(new.file_url,'fotos');
    if v_path is null or v_path<>new.file_path or not public.plan_archivo_de_proyecto('fotos',v_path,new.proyecto_id) then
      raise exception 'El archivo no pertenece a esta obra' using errcode='42501';end if;
    if public.plan_storage_proyecto('fotos',v_path) is not null and split_part(v_path,'/',3)<>new.orden_id::text then
      raise exception 'El archivo no pertenece a esta orden' using errcode='42501';end if;
   end if;
  elsif tg_table_name='proyectos' then
    if new.plano_url is distinct from old.plano_url then
      v_path:=public.plan_storage_path(new.plano_url,'planos');
      if v_path is null or not public.plan_archivo_de_proyecto('planos',v_path,new.id) then
        raise exception 'El plano no pertenece a esta obra' using errcode='42501';end if;
    end if;
    if new.plano_thumb_url is distinct from old.plano_thumb_url and new.plano_thumb_url is not null then
      v_path:=public.plan_storage_path(new.plano_thumb_url,'planos');
      if v_path is null or not public.plan_archivo_de_proyecto('planos',v_path,new.id) then
        raise exception 'La miniatura no pertenece a esta obra' using errcode='42501';end if;
    end if;
  end if;
  return new;
end $$;
create trigger plan_validar_archivos before insert or update on public.fotos for each row execute function public.plan_validar_archivos();
create trigger plan_validar_archivos before update on public.proyectos for each row execute function public.plan_validar_archivos();

-- Reserva una obra antes de subir su archivo: el nombre del objeto ya incluye
-- el tenant y la obra existentes. No permite apuntar a archivos de otra obra.
create or replace function public.plan_crear_proyecto(
  p_nombre text,p_plano_url text,p_cliente text default null,p_descripcion text default null,
  p_rubros text[] default '{}',p_tecnicos text[] default '{}',p_tenant_id uuid default null
) returns public.proyectos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_tenant uuid:=coalesce(p_tenant_id,public.plan_tenant_id()); v_result public.proyectos;
begin
  if auth.uid() is null or v_tenant is null or not public.plan_puede_crear_proyecto(v_tenant)
    or not exists(select 1 from public.tenants where id=v_tenant and activo) then
    raise exception 'No tiene permiso para crear obras en esta empresa' using errcode='42501';end if;
  if nullif(btrim(p_nombre),'') is null or p_plano_url is distinct from 'pending://plan-upload-required' then
    raise exception 'Reservar obra con nombre y plano pendiente antes de subir el archivo' using errcode='22023';end if;
  insert into public.proyectos(nombre,plano_url,cliente,descripcion,rubros,tecnicos,tenant_id,created_by)
  values(btrim(p_nombre),p_plano_url,p_cliente,p_descripcion,coalesce(p_rubros,'{}'),coalesce(p_tecnicos,'{}'),v_tenant,auth.uid()) returning * into v_result;
  return v_result;
end $$;

revoke all on function public.plan_storage_path(text,text),public.plan_storage_proyecto(text,text),
  public.plan_storage_permitido(text,text,text),public.plan_archivo_de_proyecto(text,text,uuid),public.plan_validar_archivos()
  from public,anon,authenticated;
grant execute on function public.plan_storage_path(text,text),public.plan_storage_proyecto(text,text),
  public.plan_storage_permitido(text,text,text),public.plan_archivo_de_proyecto(text,text,uuid) to authenticated;

do $$ declare p record;begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy %I on storage.objects',p.policyname);
  end loop;
end $$;
create policy plan_objects_read on storage.objects for select to authenticated
using(public.plan_storage_permitido(bucket_id,name,'read'));
create policy plan_objects_insert on storage.objects for insert to authenticated
with check(owner_id=auth.uid()::text and public.plan_storage_permitido(bucket_id,name,'write'));
create policy plan_objects_delete on storage.objects for delete to authenticated
using(public.plan_storage_permitido(bucket_id,name,'delete') or
  (bucket_id='fotos' and owner_id=auth.uid()::text and public.plan_storage_permitido(bucket_id,name,'write')));
-- Sin UPDATE: no sobrescritura, movimiento ni cambio de propietario vía cliente.
commit;
