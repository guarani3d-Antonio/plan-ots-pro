begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

alter table public.ordenes add column responsable_id uuid references auth.users(id) on delete set null;

create function public.plan_responsables_proyecto(p_proyecto uuid)
returns table(user_id uuid, nombre text, rol text)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not public.plan_es_miembro_proyecto(p_proyecto) then
    raise exception 'Proyecto no disponible' using errcode = '42501';
  end if;
  return query
    select u.id,
      coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'nombre', u.raw_user_meta_data->>'apellidos')), ''), u.email, u.id::text),
      pm.rol
    from public.proyecto_miembros pm
    join public.proyectos p on p.id = pm.proyecto_id
    join public.tenant_miembros tm on tm.tenant_id = p.tenant_id and tm.user_id = pm.user_id and tm.activo
    join auth.users u on u.id = pm.user_id
    where pm.proyecto_id = p_proyecto and pm.rol in ('supervisor', 'tecnico')
    order by 2, 1;
end $$;

revoke all on function public.plan_responsables_proyecto(uuid) from public, anon, authenticated;
grant execute on function public.plan_responsables_proyecto(uuid) to authenticated;

create function public.plan_validar_responsable_cuenta()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_nombre text;
begin
  if tg_op = 'UPDATE' and new.responsable_id is not distinct from old.responsable_id
    and new.proyecto_id is not distinct from old.proyecto_id then
    if new.responsable_id is not null and new.responsable is distinct from old.responsable then
      raise exception 'El nombre del responsable procede de su cuenta' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.responsable_id is null then
    if tg_op = 'UPDATE' and old.responsable_id is not null then new.responsable := ''; end if;
    return new;
  end if;
  select coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'nombre', u.raw_user_meta_data->>'apellidos')), ''), u.email, u.id::text)
  into v_nombre
  from public.proyecto_miembros pm
  join public.proyectos p on p.id = pm.proyecto_id
  join public.tenant_miembros tm on tm.tenant_id = p.tenant_id and tm.user_id = pm.user_id and tm.activo
  join auth.users u on u.id = pm.user_id
  where pm.proyecto_id = new.proyecto_id and pm.user_id = new.responsable_id and pm.rol in ('supervisor', 'tecnico');
  if v_nombre is null then raise exception 'Seleccioná una cuenta activa de esta obra' using errcode = '23503'; end if;
  new.responsable := v_nombre;
  return new;
end $$;

revoke all on function public.plan_validar_responsable_cuenta() from public, anon, authenticated;
create trigger plan_validar_responsable_cuenta before insert or update on public.ordenes
for each row execute function public.plan_validar_responsable_cuenta();

-- Las restauraciones recuperan datos de trabajo, conservando el código global.
create or replace function public.plan_restaurar_version(p_version uuid,p_proyecto uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
 v_snapshot jsonb;v_orders jsonb;v_expected integer;v_existing integer;
 v_backup jsonb;v_backup_id uuid;v_restored integer;
begin
 if auth.uid() is null or not public.plan_es_supervisor_proyecto(p_proyecto) then
   raise exception 'La restauración requiere permiso de supervisor' using errcode='42501';
 end if;
 select snapshot into v_snapshot from public.versiones
 where id=p_version and proyecto_id=p_proyecto for share;
 if not found then raise exception 'Versión inexistente o no disponible' using errcode='P0002';end if;
 v_orders:=v_snapshot->'ordenes';
 if v_orders is null or jsonb_typeof(v_orders)<>'array' then raise exception 'Snapshot inválido: ordenes no es una lista' using errcode='22023';end if;
 v_expected:=jsonb_array_length(v_orders);
 if v_expected=0 then raise exception 'El snapshot está vacío' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(v_orders) e
   where coalesce(e->>'id','')!~'^[0-9a-fA-F-]{36}$' or btrim(coalesce(e->>'ot',''))='') then
   raise exception 'Snapshot inválido: falta id u OT' using errcode='22023';
 end if;
 if (select count(distinct e->>'id') from jsonb_array_elements(v_orders)e)<>v_expected
   or (select count(distinct e->>'ot') from jsonb_array_elements(v_orders)e)<>v_expected then
   raise exception 'Snapshot inválido: contiene ids o códigos OT duplicados' using errcode='22023';
 end if;
 -- Congela las filas que se van a reemplazar antes de tomar el backup. Así una
 -- edición concurrente no puede quedar sobrescrita sin estar en el punto de retorno.
 perform o.id from public.ordenes o
 where o.proyecto_id=p_proyecto and o.deleted_at is null
   and exists(select 1 from jsonb_array_elements(v_orders)e where (e->>'id')::uuid=o.id)
 order by o.id for update;
 select count(*) into v_existing from public.ordenes o
 where o.proyecto_id=p_proyecto and o.deleted_at is null
   and exists(select 1 from jsonb_array_elements(v_orders)e where (e->>'id')::uuid=o.id);
 if v_existing<>v_expected then
   raise exception 'No se puede restaurar: faltan órdenes del snapshot' using errcode='P0002';
 end if;

 select jsonb_build_object(
   'ordenes',coalesce(jsonb_agg(jsonb_build_object(
     'id',o.id,'ot',o.ot,'ubicacion',o.ubicacion,'rubro',o.rubro,'estado',o.estado,
     'responsable',o.responsable,'prioridad',o.prioridad,'pos_x',o.pos_x,'pos_y',o.pos_y,
     'comentarios',o.comentarios,'campos',o.campos) order by o.ot,o.id),'[]'::jsonb),
   'total',count(*),'fecha',now()) into v_backup
 from public.ordenes o where o.proyecto_id=p_proyecto and o.deleted_at is null;
 insert into public.versiones(proyecto_id,nombre,descripcion,automatica,snapshot,total_ordenes,
   ordenes_completadas,ordenes_en_progreso,ordenes_pendientes,created_by)
 select p_proyecto,'Backup automático pre-restauración',
   'Creado en la misma transacción antes de restaurar la versión '||p_version::text,true,v_backup,count(*),
   count(*) filter(where estado='Cerrada'),count(*) filter(where estado='En proceso'),
   count(*) filter(where estado='Pendiente'),auth.uid()
 from public.ordenes where proyecto_id=p_proyecto and deleted_at is null
 returning id into v_backup_id;

 -- El código global pertenece a la identidad de la OT y se conserva al restaurar.
 update public.ordenes o set
   ubicacion=coalesce(x.ubicacion,''),rubro=coalesce(x.rubro,''),estado=x.estado,
   responsable=case when o.responsable_id is null then coalesce(x.responsable,'') else o.responsable end,
   prioridad=x.prioridad,pos_x=x.pos_x,pos_y=x.pos_y,
   comentarios=coalesce(x.comentarios,''),campos=coalesce(x.campos,'{}'::jsonb),updated_by=auth.uid()
 from jsonb_to_recordset(v_orders) as x(id uuid,ot text,ubicacion text,rubro text,estado text,
   responsable text,prioridad text,pos_x double precision,pos_y double precision,comentarios text,campos jsonb)
 where o.id=x.id and o.proyecto_id=p_proyecto and o.deleted_at is null;
 get diagnostics v_restored=row_count;
 if v_restored<>v_expected then raise exception 'Restauración incompleta; se revierte toda la operación';end if;
 return jsonb_build_object('restored',v_restored,'backup_id',v_backup_id);
end $$;


commit;
