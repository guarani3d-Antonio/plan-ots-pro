-- Acepta orden_servicio en la auditoría sin romper clientes anteriores que envían ficha.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if; end $$;
create or replace function public.plan_solicitar_exportacion(p_orden uuid,p_tipo text,p_formato text,p_solicitud uuid)
 returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes; eid uuid;
begin
 select * into o from public.ordenes where id=p_orden and deleted_at is null;
 if auth.uid() is null or o.id is null or not public.plan_es_miembro_proyecto(o.proyecto_id)
 or not exists(select 1 from public.proyectos p where p.id=o.proyecto_id and p.deleted_at is null) then
 raise exception 'OT no disponible' using errcode='42501';end if;
 if p_tipo is null or p_tipo not in ('ficha','relevamiento','avance','cierre','acta') or p_formato is null or p_formato not in ('HTML','PDF') or p_solicitud is null then
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
