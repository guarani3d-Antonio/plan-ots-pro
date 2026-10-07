-- Congela la referencia del plano en cada revisión nueva para verificar el recorte. Las revisiones anteriores permanecen intactas.
-- Congela el nombre de la empresa emisora junto con la OT. No actualiza revisiones previas.
-- Piloto: prepara el supervisor; revisa y emite el Creador.
-- No cambia PDFs ni decisiones historicas. Mantiene doble persona e idempotencia.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create or replace function public.plan_documento_capturar_fuentes() returns trigger
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
    'empresa',(select jsonb_build_object('id',t.id,'nombre',t.nombre) from public.tenants t where t.id=v_doc.tenant_id),
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
      'descripcion',v_proyecto.descripcion,'plano_url',v_proyecto.plano_url),
    'fotos',v_fotos);
  insert into public.plan_documento_fuentes(revision_id,documento_id,fuentes,fuentes_sha256)
    values(new.id,new.documento_id,v_fuentes,
      encode(pg_catalog.sha256(convert_to(v_fuentes::text,'UTF8')),'hex'));
  return null;
end $$;
notify pgrst,'reload schema';
commit;
