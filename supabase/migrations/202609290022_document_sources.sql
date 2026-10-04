-- Congela las fuentes de cada revision nueva. No emite ni aprueba un documento.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if to_regclass('public.plan_documento_revisiones') is null
     or to_regclass('public.plan_foto_originales') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Faltan las revisiones o los originales de fotos';
  end if;
end $$;

create table public.plan_documento_fuentes (
  revision_id uuid primary key references public.plan_documento_revisiones(id) on delete restrict,
  documento_id uuid not null references public.plan_documentos(id) on delete restrict,
  fuentes jsonb not null check(jsonb_typeof(fuentes)='object' and octet_length(fuentes::text)<=2097152),
  fuentes_sha256 text not null check(fuentes_sha256 ~ '^[0-9a-f]{64}$'),
  capturada_en timestamptz not null default now()
);
create index plan_documento_fuentes_documento on public.plan_documento_fuentes(documento_id);
create table public.plan_documento_foto_referencias (
  revision_id uuid not null references public.plan_documento_revisiones(id) on delete restrict,
  file_path text not null,
  primary key(revision_id,file_path)
);
create index plan_documento_foto_path on public.plan_documento_foto_referencias(file_path);
alter table public.plan_documento_foto_referencias enable row level security;
revoke all on public.plan_documento_foto_referencias from public,anon,authenticated;
alter table public.plan_documento_fuentes enable row level security;
revoke all on public.plan_documento_fuentes from public,anon,authenticated;
grant select on public.plan_documento_fuentes to authenticated;
create policy plan_documento_fuentes_ver on public.plan_documento_fuentes for select to authenticated
using(exists(select 1 from public.plan_documentos d where d.id=documento_id
  and public.plan_es_supervisor_proyecto(d.proyecto_id)));

create function public.plan_documento_capturar_fuentes() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_doc public.plan_documentos;
  v_orden public.ordenes;
  v_proyecto public.proyectos;
  v_ids jsonb:=coalesce(new.datos->'fotoIds','[]'::jsonb);
  v_fotos jsonb:='[]'::jsonb;
  v_foto_id text;
  v_foto record;
  v_fuentes jsonb;
begin
  select * into v_doc from public.plan_documentos where id=new.documento_id;
  select * into v_orden from public.ordenes where id=v_doc.orden_id for share;
  select * into v_proyecto from public.proyectos where id=v_doc.proyecto_id for share;
  if v_doc.id is null or v_orden.id is null or v_proyecto.id is null
     or v_orden.deleted_at is not null or v_proyecto.deleted_at is not null
     or v_orden.proyecto_id<>v_doc.proyecto_id
     or v_proyecto.tenant_id<>v_doc.tenant_id then
    raise exception 'Fuentes de la revision no disponibles' using errcode='42501';
  end if;
  if jsonb_typeof(v_ids)<>'array' then
    raise exception 'Seleccion de fotos invalida' using errcode='22023';
  end if;
  if jsonb_array_length(v_ids)>100 then
    raise exception 'Seleccion de fotos invalida' using errcode='22023';
  end if;
  for v_foto_id in select jsonb_array_elements_text(v_ids) loop
    if v_foto_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'ID de foto invalido' using errcode='22023';
    end if;
    select f.id,f.orden_id,f.proyecto_id,f.categoria,f.label,f.descripcion,
           f.descripcion_observacion,
           f.anotaciones,f.edicion,f.revision,f.uploaded_at,
           fo.file_path as original_path,f.file_path as edicion_path
      into v_foto from public.fotos f
      join public.plan_foto_originales fo on fo.foto_id=f.id and fo.proyecto_id=f.proyecto_id
      where f.id=v_foto_id::uuid and f.orden_id=v_doc.orden_id
        and f.proyecto_id=v_doc.proyecto_id for share of f,fo;
    if not found then
      raise exception 'Foto seleccionada fuera de la OT o sin original' using errcode='42501';
    end if;
    if not exists(select 1 from storage.buckets b where b.id='fotos' and not b.public)
       or not exists(select 1 from storage.objects o where o.bucket_id='fotos'
         and o.name=v_foto.original_path)
       or not exists(select 1 from storage.objects o where o.bucket_id='fotos'
         and o.name=v_foto.edicion_path) then
      raise exception 'Binario privado de foto seleccionada ausente' using errcode='22023';
    end if;
    v_fotos:=v_fotos||jsonb_build_array(jsonb_build_object(
      'id',v_foto.id,'categoria',v_foto.categoria,'label',v_foto.label,
      'descripcion',v_foto.descripcion,
      'descripcion_observacion',v_foto.descripcion_observacion,
      'edicion',v_foto.edicion,'revision',v_foto.revision,
      'uploaded_at',v_foto.uploaded_at,'original_path',v_foto.original_path,
      'edicion_path',v_foto.edicion_path));
    insert into public.plan_documento_foto_referencias(revision_id,file_path)
      values(new.id,v_foto.original_path),(new.id,v_foto.edicion_path)
      on conflict do nothing;
  end loop;
  if (select count(*) from jsonb_array_elements_text(v_ids)) <>
     (select count(distinct x) from jsonb_array_elements_text(v_ids) x) then
    raise exception 'Fotos seleccionadas repetidas' using errcode='22023';
  end if;
  v_fuentes:=jsonb_build_object(
    'version',1,
    'documento',jsonb_build_object('id',v_doc.id,'codigo',v_doc.codigo,
      'tipo',v_doc.tipo,'ciclo',v_doc.ciclo,'folio',v_doc.folio,
      'orden_id',v_doc.orden_id,'proyecto_id',v_doc.proyecto_id,
      'tenant_id',v_doc.tenant_id),
    'revision',jsonb_build_object('id',new.id,'numero',new.revision,
      'datos_sha256',new.contenido_sha256,'plantilla_version',new.plantilla_version),
    'orden',to_jsonb(v_orden)-array['costo','conflict_data','acta_conformidad_url',
      'informe_relevamiento_url','informe_avance_url','informe_cierre_url'],
    'proyecto',jsonb_build_object('id',v_proyecto.id,'tenant_id',v_proyecto.tenant_id,
      'nombre',v_proyecto.nombre,'cliente',v_proyecto.cliente,
      'descripcion',v_proyecto.descripcion),
    'fotos',v_fotos);
  insert into public.plan_documento_fuentes(revision_id,documento_id,fuentes,fuentes_sha256)
    values(new.id,new.documento_id,v_fuentes,
      encode(pg_catalog.sha256(convert_to(v_fuentes::text,'UTF8')),'hex'));
  return null;
end $$;
create trigger plan_documento_capturar_fuentes after insert on public.plan_documento_revisiones
for each row execute function public.plan_documento_capturar_fuentes();
create function public.plan_documento_no_alterar_registro() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  raise exception 'Registro documental inmutable' using errcode='42501';
end $$;
create trigger plan_revisiones_inmutables before update or delete on public.plan_documento_revisiones
for each row execute function public.plan_documento_no_alterar_registro();
create trigger plan_fuentes_inmutables before update or delete on public.plan_documento_fuentes
for each row execute function public.plan_documento_no_alterar_registro();
create trigger plan_foto_referencias_inmutables before update or delete on public.plan_documento_foto_referencias
for each row execute function public.plan_documento_no_alterar_registro();
create function public.plan_documento_foto_referida(p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select exists(select 1 from public.plan_documento_foto_referencias where file_path=p_path);
$$;
create policy plan_documento_conservar_foto on storage.objects as restrictive
for delete to authenticated
using(bucket_id<>'fotos' or not public.plan_documento_foto_referida(name));
create policy plan_documento_no_sobrescribir_foto on storage.objects as restrictive
for update to authenticated
using(bucket_id<>'fotos' or not public.plan_documento_foto_referida(name))
with check(bucket_id<>'fotos' or not public.plan_documento_foto_referida(name));
revoke all on function public.plan_documento_capturar_fuentes() from public,anon,authenticated;
revoke all on function public.plan_documento_no_alterar_registro() from public,anon,authenticated;
revoke all on function public.plan_documento_foto_referida(text) from public,anon,authenticated;
grant execute on function public.plan_documento_foto_referida(text) to authenticated;
notify pgrst,'reload schema';
commit;
