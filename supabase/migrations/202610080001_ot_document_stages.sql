-- Seven-stage OT dossier. New events keep their own globally unique document
-- number; corrections preserve every frozen revision, PDF, approval and signer.
-- Existing permissions, two-person approval, stale-draft protection and retries
-- remain enforced by the original RPCs. No data or artifacts are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
drop index public.plan_documentos_fases_unicas;
create unique index plan_documentos_fases_unicas on public.plan_documentos(orden_id,ciclo,tipo)
  where tipo in ('orden_servicio','acta');
alter table public.plan_documento_emisiones drop constraint plan_documento_emisiones_documento_id_key;

create or replace function public.plan_documento_no_revisar_emitido() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if exists(select 1 from public.plan_documento_emisiones e where e.documento_id=new.documento_id)
     and (nullif(btrim(new.motivo),'') is null or exists(
       select 1 from public.plan_documento_emisiones e
       join public.plan_documento_revisiones r on r.id=e.revision_id
       where e.documento_id=new.documento_id and r.revision>=new.revision)) then
    raise exception 'La correccion debe indicar motivo y generar una revision posterior' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.plan_documento_reservar(
  p_orden uuid,p_tipo text,p_ciclo integer,p_solicitud uuid
) returns public.plan_documentos
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_doc public.plan_documentos; v_tenant uuid; v_proyecto uuid; v_folio bigint;
begin
  if auth.uid() is null or p_solicitud is null or p_ciclo is null or p_ciclo < 1
     or p_tipo is null or p_tipo not in ('orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta') then
    raise exception 'Solicitud documental inválida' using errcode='22023';
  end if;
  select o.proyecto_id,p.tenant_id into v_proyecto,v_tenant
    from public.ordenes o join public.proyectos p on p.id=o.proyecto_id
    where o.id=p_orden and o.deleted_at is null and p.deleted_at is null and p.tenant_id is not null;
  if v_tenant is null or not public.plan_puede_editar_proyecto(v_proyecto) then
    raise exception 'OT no disponible para reservar documento' using errcode='42501';
  end if;
  select * into v_doc from public.plan_documentos
    where creado_por=auth.uid() and solicitud_id=p_solicitud;
  if v_doc.id is not null then
    if v_doc.orden_id is distinct from p_orden or v_doc.tipo is distinct from p_tipo
       or v_doc.ciclo is distinct from p_ciclo then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
    return v_doc;
  end if;
  if p_tipo in ('orden_servicio','acta') then
    select * into v_doc from public.plan_documentos
      where orden_id=p_orden and ciclo=p_ciclo and tipo=p_tipo;
    if v_doc.id is not null then return v_doc; end if;
  end if;
  v_folio:=nextval('public.plan_documento_folio_seq');
  insert into public.plan_documentos(
    tenant_id,proyecto_id,orden_id,tipo,ciclo,folio,codigo,creado_por,solicitud_id
  ) values (
    v_tenant,v_proyecto,p_orden,p_tipo,p_ciclo,v_folio,
    'POT-'||extract(year from now() at time zone 'UTC')::integer||'-'||
      case p_tipo when 'orden_servicio' then 'OS' when 'visita' then 'VIS'
        when 'relevamiento' then 'REL' when 'avance' then 'AV'
        when 'cierre' then 'CIE' when 'acta' then 'ACT' else 'ENC' end||'-'||
      case when length(v_folio::text)<8 then lpad(v_folio::text,8,'0')
        else v_folio::text end,
    auth.uid(),p_solicitud
  ) on conflict do nothing returning * into v_doc;
  if v_doc.id is null then
    select * into v_doc from public.plan_documentos
      where creado_por=auth.uid() and solicitud_id=p_solicitud;
    if v_doc.id is not null and (v_doc.orden_id is distinct from p_orden
       or v_doc.tipo is distinct from p_tipo or v_doc.ciclo is distinct from p_ciclo) then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
    if v_doc.id is null and p_tipo in ('orden_servicio','acta') then
      select * into v_doc from public.plan_documentos
        where orden_id=p_orden and ciclo=p_ciclo and tipo=p_tipo;
    end if;
    if v_doc.id is null then
      raise exception 'No se pudo reservar el documento' using errcode='23505';
    end if;
  end if;
  return v_doc;
end $$;

create or replace function public.plan_documento_emitir(p_candidato uuid,p_solicitud uuid)
returns public.plan_documento_emisiones
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_c public.plan_documento_candidatos; v_d public.plan_documentos;
  v_a public.plan_documento_aprobaciones; v_e public.plan_documento_emisiones;
  v_modulo text; v_politica public.plan_politica_decisiones;
  v_politicas jsonb:='{}'::jsonb;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Durante el piloto solo el Creador revisa y autoriza la emision' using errcode='42501';
  end if;
  if auth.uid() is null or p_solicitud is null then
    raise exception 'Solicitud invalida' using errcode='22023';
  end if;
  select * into v_d from public.plan_documentos where id=(
    select documento_id from public.plan_documento_candidatos where id=p_candidato
  ) for update;
  select * into v_c from public.plan_documento_candidatos where id=p_candidato for update;
  if v_c.id is null or not public.plan_es_supervisor_proyecto(v_d.proyecto_id) then
    raise exception 'Candidato no disponible' using errcode='42501';
  end if;
  select * into v_e from public.plan_documento_emisiones
    where emitido_por=auth.uid() and solicitud_id=p_solicitud;
  if v_e.id is not null and v_e.candidato_id<>p_candidato then
    raise exception 'Solicitud reutilizada para otro candidato' using errcode='22023';
  end if;
  if v_e.id is not null then return v_e; end if;
  select * into v_e from public.plan_documento_emisiones where candidato_id=p_candidato;
  if v_e.id is not null then return v_e; end if;
  if exists(select 1 from public.plan_documento_emisiones e
    join public.plan_documento_revisiones r on r.id=e.revision_id
    where e.documento_id=v_d.id and r.revision >= (select revision
      from public.plan_documento_revisiones where id=v_c.revision_id)) then
    raise exception 'Ya existe una emision de esta revision o de una posterior' using errcode='23505';
  end if;
  if exists(select 1 from public.plan_documento_revisiones r
    where r.documento_id=v_d.id and r.revision>(select x.revision
      from public.plan_documento_revisiones x where x.id=v_c.revision_id)) then
    raise exception 'Existe una revision posterior' using errcode='40001';
  end if;
  if exists(select 1 from public.plan_documento_borradores b
    join public.plan_documento_revisiones r on r.id=v_c.revision_id
    where b.documento_id=v_d.id and b.version<>r.borrador_version) then
    raise exception 'Hay un borrador posterior; congele y revise una nueva revision' using errcode='40001';
  end if;
  select * into v_a from public.plan_documento_aprobaciones where candidato_id=p_candidato;
  if v_c.estado<>'listo' or v_a.decision is distinct from 'aprobado'
     or v_a.pdf_sha256 is distinct from v_c.pdf_sha256 then
    raise exception 'PDF sin aprobacion exacta' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='exports' and o.name=v_c.pdf_path)
     or not exists(select 1 from storage.buckets b where b.id='exports' and not b.public) then
    raise exception 'Archivo emitible ausente' using errcode='22023';
  end if;
  foreach v_modulo in array array['identidad','revision','conservacion'] loop
    select * into v_politica from public.plan_politica_decisiones
      where tenant_id=v_d.tenant_id and modulo=v_modulo order by id desc limit 1;
    if v_politica.estado is distinct from 'aprobada'
       or v_politica.vigente_desde is null or v_politica.vigente_desde>current_date then
      raise exception 'Politica documental % pendiente o suspendida',v_modulo using errcode='22023';
    end if;
    v_politicas:=v_politicas||jsonb_build_object(v_modulo,v_politica.id);
  end loop;
  insert into public.plan_documento_emisiones(candidato_id,aprobacion_id,
    documento_id,revision_id,pdf_path,pdf_sha256,pdf_bytes,fuentes_binarias,
    politicas,emitido_por,solicitud_id)
  values(v_c.id,v_a.id,v_d.id,v_c.revision_id,v_c.pdf_path,v_c.pdf_sha256,
    v_c.pdf_bytes,v_c.fuentes_binarias,v_politicas,auth.uid(),p_solicitud)
  returning * into v_e;
  return v_e;
end $$;

notify pgrst,'reload schema';
commit;
