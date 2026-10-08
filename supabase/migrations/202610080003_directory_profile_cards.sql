begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

-- Una imagen por ficha compartida; no se copia por cada OT.
create table public.plan_directorio_fotos (
  tipo text not null check(tipo in ('obra','cliente','contratista')),
  ficha_id uuid not null,
  file_path text not null unique,
  actualizado_en timestamptz not null default now(),
  primary key(tipo,ficha_id)
);
alter table public.plan_directorio_fotos enable row level security;
revoke all on public.plan_directorio_fotos from public,anon,authenticated;

create function public.plan_directorio_acceso(p_tipo text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;
begin
  if auth.uid() is null then return false; end if;
  if p_tipo='obra' then
    select tenant_id into tid from public.proyectos where id=p_id and proyecto_padre_id is null and deleted_at is null;
  elsif p_tipo='cliente' then
    select tenant_id into tid from public.plan_clientes where id=p_id;
  elsif p_tipo='contratista' then
    select tenant_id into tid from public.plan_contratistas where id=p_id;
  else return false; end if;
  if tid is null or not exists(select 1 from public.tenants where id=tid and activo) then return false; end if;
  if public.plan_es_creador() then return true; end if;
  if p_tipo='obra' then
    -- La ficha de obra ya se consulta desde cualquiera de sus planos autorizados.
    return public.plan_es_miembro_proyecto(p_id) or exists(
      select 1 from public.proyectos p where p.proyecto_padre_id=p_id and p.tenant_id=tid
        and p.deleted_at is null and public.plan_es_miembro_proyecto(p.id));
  elsif p_tipo='cliente' then
    return exists(select 1 from public.plan_cliente_ubicaciones u join public.proyectos p on p.id=u.proyecto_id
      where u.cliente_id=p_id and u.tenant_id=tid and u.activo and p.deleted_at is null
        and public.plan_puede_editar_proyecto(p.id));
  else
    return exists(select 1 from public.proyectos p where p.tenant_id=tid and p.deleted_at is null
      and public.plan_es_miembro_proyecto(p.id));
  end if;
end $$;

create function public.plan_directorio_archivo_permitido(p_name text,p_escritura boolean default false) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare kind text; fid uuid;
begin
  if p_name is null or p_name !~ '^(obra|cliente|contratista)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
  kind:=split_part(p_name,'/',1); fid:=split_part(p_name,'/',2)::uuid;
  if not public.plan_directorio_acceso(kind,fid) then return false; end if;
  if p_escritura then return public.plan_es_creador(); end if;
  return public.plan_es_creador() or exists(select 1 from public.plan_directorio_fotos
    where tipo=kind and ficha_id=fid and file_path=p_name);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('directory-photos','directory-photos',false,2097152,array['image/jpeg']);
create policy plan_directory_photos_read on storage.objects for select to authenticated
  using(bucket_id='directory-photos' and public.plan_directorio_archivo_permitido(name,false));
create policy plan_directory_photos_insert on storage.objects for insert to authenticated
  with check(bucket_id='directory-photos' and owner_id=auth.uid()::text and public.plan_directorio_archivo_permitido(name,true));
-- La política consulta la ficha mediante función, sin exponer la tabla.
create function public.plan_directorio_archivo_eliminable(p_name text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select public.plan_directorio_archivo_permitido(p_name,true)
    and not exists(select 1 from public.plan_directorio_fotos where file_path=p_name)
$$;
create policy plan_directory_photos_delete on storage.objects for delete to authenticated
  using(bucket_id='directory-photos' and public.plan_directorio_archivo_eliminable(name));

create function public.plan_foto_directorio(p_tipo text,p_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not public.plan_directorio_acceso(p_tipo,p_id) then
    raise exception 'No tiene acceso a esta ficha' using errcode='42501'; end if;
  return (select file_path from public.plan_directorio_fotos where tipo=p_tipo and ficha_id=p_id);
end $$;
create function public.plan_guardar_foto_directorio(p_tipo text,p_id uuid,p_path text) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not public.plan_es_creador() or not public.plan_directorio_acceso(p_tipo,p_id) then
    raise exception 'El Creador administra las fotos de las fichas' using errcode='42501'; end if;
  if p_path is null then
    delete from public.plan_directorio_fotos where tipo=p_tipo and ficha_id=p_id;
  else
    if not public.plan_directorio_archivo_permitido(p_path,true)
      or split_part(p_path,'/',1)<>p_tipo or split_part(p_path,'/',2)<>p_id::text
      or not exists(select 1 from storage.objects where bucket_id='directory-photos' and name=p_path) then
      raise exception 'La foto no corresponde a esta ficha o no terminó de cargarse' using errcode='22023'; end if;
    insert into public.plan_directorio_fotos(tipo,ficha_id,file_path) values(p_tipo,p_id,p_path)
      on conflict(tipo,ficha_id) do update set file_path=excluded.file_path,actualizado_en=now();
  end if;
end $$;

-- Misma lectura que el directorio actual: solo clientes autorizados en el plano.
create function public.plan_ficha_cliente(p_cliente uuid,p_proyecto uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare c public.plan_clientes; tid uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  select * into c from public.plan_clientes where id=p_cliente;
  if c.id is null then raise exception 'Cliente no disponible' using errcode='42501'; end if;
  if not public.plan_es_creador() then
    select tenant_id into tid from public.proyectos where id=p_proyecto and deleted_at is null;
    if tid is distinct from c.tenant_id or not public.plan_puede_editar_proyecto(p_proyecto)
      or not exists(select 1 from public.plan_clientes_para_obra(p_proyecto) u where u.cliente_id=p_cliente) then
      raise exception 'No tiene acceso a este cliente en la obra' using errcode='42501'; end if;
  elsif p_proyecto is not null and not exists(select 1 from public.proyectos where id=p_proyecto and tenant_id=c.tenant_id and deleted_at is null) then
    raise exception 'El cliente no corresponde a la obra' using errcode='42501';
  end if;
  return to_jsonb(c)-'creado_por';
end $$;

revoke all on function public.plan_directorio_acceso(text,uuid),public.plan_directorio_archivo_permitido(text,boolean),
  public.plan_directorio_archivo_eliminable(text),public.plan_foto_directorio(text,uuid),
  public.plan_guardar_foto_directorio(text,uuid,text),public.plan_ficha_cliente(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_directorio_archivo_permitido(text,boolean),public.plan_directorio_archivo_eliminable(text),
  public.plan_foto_directorio(text,uuid),public.plan_guardar_foto_directorio(text,uuid,text),
  public.plan_ficha_cliente(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
