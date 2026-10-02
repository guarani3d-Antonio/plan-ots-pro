begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- No amplía lectura de tablas ni permite editar fichas compartidas.
-- El supervisor reutiliza solo clientes de obras que ya supervisa.
create function public.plan_clientes_gestion_obra(p_proyecto uuid)
returns table(id uuid, nombre text, identificacion text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_tenant uuid;
begin
  select p.tenant_id into v_tenant from public.proyectos p
    join public.tenants t on t.id=p.tenant_id and t.activo
    where p.id=p_proyecto and p.deleted_at is null;
  if auth.uid() is null or v_tenant is null or not public.plan_es_supervisor_proyecto(p_proyecto) then
    raise exception 'El alta de clientes requiere supervisión de esta obra' using errcode='42501';
  end if;
  return query select c.id,c.nombre,c.identificacion from public.plan_clientes c
    where c.tenant_id=v_tenant and c.activo and (public.plan_es_creador() or exists (
      select 1 from public.plan_cliente_ubicaciones u join public.proyectos p on p.id=u.proyecto_id
      where u.cliente_id=c.id and u.tenant_id=v_tenant and u.activo and p.deleted_at is null
        and public.plan_es_supervisor_proyecto(p.id))) order by c.nombre,c.id;
end $$;

-- Identificador estable del intento: reintentar tras un corte no duplica el alta.
create function public.plan_alta_cliente_obra(p_proyecto uuid, p_solicitud uuid, p_cliente uuid, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_tenant uuid; v_obra text; v_cliente uuid; v_sitio public.plan_cliente_ubicaciones; v_result jsonb;
begin
  select p.tenant_id,p.nombre into v_tenant,v_obra from public.proyectos p
    join public.tenants t on t.id=p.tenant_id and t.activo
    where p.id=p_proyecto and p.deleted_at is null;
  if auth.uid() is null or v_tenant is null or not public.plan_es_supervisor_proyecto(p_proyecto) then
    raise exception 'El alta de clientes requiere supervisión de esta obra' using errcode='42501';
  end if;
  if p_solicitud is null or p_datos is null or jsonb_typeof(p_datos)<>'object' or octet_length(p_datos::text)>16000 then
    raise exception 'Datos de cliente inválidos' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_each(p_datos) x where jsonb_typeof(x.value)<>'string') then
    raise exception 'Los campos deben ser texto' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
  select * into v_sitio from public.plan_cliente_ubicaciones where id=p_solicitud;
  if found then
    if v_sitio.tenant_id<>v_tenant or v_sitio.proyecto_id is distinct from p_proyecto
      or v_sitio.cliente_id is distinct from coalesce(p_cliente,p_solicitud) then
      raise exception 'Solicitud no disponible para esta obra' using errcode='42501';
    end if;
  else
    if coalesce(p_datos->>'tipo_inmueble','') not in ('residencial_altura','oficina_altura','industrial','otro')
      or coalesce(btrim(p_datos->>'direccion_obra'),'')='' then
      raise exception 'Completá tipo de inmueble y dirección de la obra' using errcode='22023';
    end if;
    if p_cliente is null then
      if coalesce(btrim(p_datos->>'nombre'),'')='' then
        raise exception 'Completá el nombre del cliente' using errcode='22023';
      end if;
      v_cliente:=p_solicitud;
      insert into public.plan_clientes(id,tenant_id,nombre,identificacion,contacto,telefono,correo,direccion,creado_por)
      values(v_cliente,v_tenant,btrim(p_datos->>'nombre'),nullif(btrim(p_datos->>'identificacion'),''),
        nullif(btrim(p_datos->>'contacto'),''),nullif(btrim(p_datos->>'telefono'),''),
        nullif(btrim(p_datos->>'correo'),''),nullif(btrim(p_datos->>'domicilio'),''),auth.uid());
    else
      if not exists(select 1 from public.plan_clientes_gestion_obra(p_proyecto) c where c.id=p_cliente) then
        raise exception 'Cliente no disponible en tus obras autorizadas' using errcode='42501';
      end if;
      v_cliente:=p_cliente;
    end if;
    insert into public.plan_cliente_ubicaciones(id,tenant_id,cliente_id,proyecto_id,tipo_inmueble,nombre_obra,direccion,piso,unidad,sector)
    values(p_solicitud,v_tenant,v_cliente,p_proyecto,p_datos->>'tipo_inmueble',v_obra,
      btrim(p_datos->>'direccion_obra'),nullif(btrim(p_datos->>'piso'),''),
      nullif(btrim(p_datos->>'unidad'),''),nullif(btrim(p_datos->>'sector'),''));
  end if;
  select to_jsonb(c) into v_result from public.plan_clientes_para_obra(p_proyecto) c where c.ubicacion_id=p_solicitud;
  if v_result is null then raise exception 'Cliente o ubicación inactivos' using errcode='42501'; end if;
  return v_result;
end $$;
revoke all on function public.plan_clientes_gestion_obra(uuid), public.plan_alta_cliente_obra(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_clientes_gestion_obra(uuid), public.plan_alta_cliente_obra(uuid,uuid,uuid,jsonb) to authenticated;
commit;
