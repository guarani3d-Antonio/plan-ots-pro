begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.plan_contexto_acceso()') is null then
   raise exception 'Requiere postgres y fase 4';
 end if;
end $$;

-- La restricción protege también importaciones y futuros clientes que no pasen
-- por el RPC. Las OTs eliminadas pueden conservar su código en la auditoría.
create unique index ordenes_proyecto_ot_activa_uidx
on public.ordenes(proyecto_id,ot) where deleted_at is null;

-- El código se asigna dentro de la misma transacción que inserta la OT. El lock
-- por obra elimina la carrera entre dos tablets que calculaban el mismo máximo.
create function public.plan_crear_orden(p_proyecto uuid,p_pos_x double precision,p_pos_y double precision)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_id uuid:=gen_random_uuid();v_num integer;v_ot text;
begin
 if auth.uid() is null or not public.plan_puede_editar_proyecto(p_proyecto) then
   raise exception 'Sin permiso para crear órdenes en esta obra' using errcode='42501';
 end if;
 if p_pos_x not between 0 and 1 or p_pos_y not between 0 and 1 then
   raise exception 'Coordenadas fuera del plano' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_proyecto::text,0));
 select coalesce(max((substring(ot from 4))::integer),0)+1 into v_num
 from public.ordenes where proyecto_id=p_proyecto and deleted_at is null and ot~'^OT-[0-9]+$';
 v_ot:='OT-'||lpad(v_num::text,3,'0');
 insert into public.ordenes(id,proyecto_id,ot,ubicacion,comentarios,estado,prioridad,responsable,rubro,
   pos_x,pos_y,plano_ref_url,campos,conflict_flag,created_by,updated_by)
 values(v_id,p_proyecto,v_ot,'','','Pendiente','Media','','',p_pos_x,p_pos_y,'','{}'::jsonb,false,auth.uid(),auth.uid());
 return v_id;
end $$;

-- Estado y comentario forman una sola operación. updated_at actúa como versión:
-- una pantalla antigua no puede confirmar sobre una edición más reciente.
create function public.plan_cambiar_estado_orden(p_orden uuid,p_expected_at timestamptz,p_estado text,p_fecha_fin date,p_comentario text)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto uuid;v_anterior text;v_email text;
begin
 if p_estado not in ('Pendiente','En proceso','Cerrada','No aplica') then
   raise exception 'Estado inválido' using errcode='22023';
 end if;
 if char_length(btrim(coalesce(p_comentario,'')))<3 then
   raise exception 'El comentario debe tener al menos 3 caracteres' using errcode='22023';
 end if;
 select proyecto_id,estado into v_proyecto,v_anterior from public.ordenes
 where id=p_orden and deleted_at is null for update;
 if not found then raise exception 'Orden inexistente o no visible' using errcode='P0002';end if;
 if auth.uid() is null or not public.plan_puede_editar_proyecto(v_proyecto) then
   raise exception 'Sin permiso para cambiar el estado' using errcode='42501';
 end if;
 update public.ordenes set estado=p_estado,
   fecha_fin_trabajos=case when p_estado='No aplica' then coalesce(p_fecha_fin,current_date) else fecha_fin_trabajos end,
   updated_by=auth.uid()
 where id=p_orden and updated_at=p_expected_at;
 -- PT409 hace que PostgREST devuelva HTTP 409. No usar 40001: la capa de
 -- conexión lo considera serialización transitoria y puede reintentar la RPC.
 if not found then raise exception 'La orden cambió en otra sesión; vuelve a revisar los datos' using errcode='PT409';end if;
 v_email:=auth.jwt()->>'email';
 insert into public.ot_comentarios(orden_id,proyecto_id,user_id,user_email,estado_anterior,estado_nuevo,comentario)
 values(p_orden,v_proyecto,auth.uid(),v_email,v_anterior,p_estado,btrim(p_comentario));
 return p_orden;
end $$;

-- Permite deshacer inmediatamente una creación accidental del propio técnico,
-- sin convertir el permiso de edición en permiso general de borrado.
create function public.plan_cancelar_orden_nueva(p_orden uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_orden public.ordenes%rowtype;
begin
 select * into v_orden from public.ordenes where id=p_orden and deleted_at is null for update;
 if not found then raise exception 'Orden inexistente o no visible' using errcode='P0002';end if;
 if auth.uid() is null or v_orden.created_by is distinct from auth.uid()
   or not public.plan_puede_editar_proyecto(v_orden.proyecto_id)
   or v_orden.created_at<pg_catalog.now()-interval '15 minutes'
   or v_orden.estado<>'Pendiente'
   or exists(select 1 from public.fotos where orden_id=p_orden)
   or exists(select 1 from public.ot_comentarios where orden_id=p_orden) then
   raise exception 'La orden ya no puede cancelarse; solicita el borrado a un supervisor' using errcode='42501';
 end if;
 delete from public.ordenes where id=p_orden;
 return p_orden;
end $$;

revoke all on function public.plan_crear_orden(uuid,double precision,double precision),
 public.plan_cambiar_estado_orden(uuid,timestamptz,text,date,text),public.plan_cancelar_orden_nueva(uuid) from public,anon,authenticated;
grant execute on function public.plan_crear_orden(uuid,double precision,double precision),
 public.plan_cambiar_estado_orden(uuid,timestamptz,text,date,text),public.plan_cancelar_orden_nueva(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
