-- La visita técnica y la encuesta son piezas repetibles distintas de la apertura
-- y del acta de conformidad, respectivamente.
-- Mantiene el folio global, el control de concurrencia y los permisos existentes.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
end $$;

alter table public.plan_documentos drop constraint plan_documentos_tipo_check;
alter table public.plan_documentos add constraint plan_documentos_tipo_check
  check(tipo in ('orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta'));

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
  if p_tipo in ('orden_servicio','cierre','acta') then
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
    if v_doc.id is null and p_tipo in ('orden_servicio','cierre','acta') then
      select * into v_doc from public.plan_documentos
        where orden_id=p_orden and ciclo=p_ciclo and tipo=p_tipo;
    end if;
    if v_doc.id is null then
      raise exception 'No se pudo reservar el documento' using errcode='23505';
    end if;
  end if;
  return v_doc;
end $$;

create or replace function public.plan_solicitar_exportacion(p_orden uuid,p_tipo text,p_formato text,p_solicitud uuid)
 returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes; eid uuid;
begin
 select * into o from public.ordenes where id=p_orden and deleted_at is null;
 if auth.uid() is null or o.id is null or not public.plan_es_miembro_proyecto(o.proyecto_id)
 or not exists(select 1 from public.proyectos p where p.id=o.proyecto_id and p.deleted_at is null) then
 raise exception 'OT no disponible' using errcode='42501';end if;
 if p_tipo is null or p_tipo not in ('ficha','orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta') or p_formato is null or p_formato not in ('HTML','PDF') or p_solicitud is null then
 raise exception 'Solicitud de exportación inválida' using errcode='22023';end if;
 insert into public.plan_ot_eventos(tenant_id,proyecto_id,orden_id,ot,actor_id,actor_email,tipo,cambios,solicitud_id)
 values((select tenant_id from public.proyectos where id=o.proyecto_id),o.proyecto_id,o.id,o.ot,auth.uid(),
 (select email from auth.users where id=auth.uid()),'informe.solicitado',jsonb_build_object(
 'informe',jsonb_build_object('antes',null,'despues',p_tipo),'formato',jsonb_build_object('antes',null,'despues',p_formato)),p_solicitud)
 on conflict(solicitud_id) do nothing returning id into eid;
 if eid is null then
 select id into eid from public.plan_ot_eventos where solicitud_id=p_solicitud and actor_id=auth.uid() and orden_id=p_orden
 and cambios->'informe'->>'despues'=p_tipo and cambios->'formato'->>'despues'=p_formato;
 if eid is null then raise exception 'Identificador de solicitud ya utilizado' using errcode='22023';end if;
 end if;
 return eid;
end $$;

notify pgrst,'reload schema';
commit;
