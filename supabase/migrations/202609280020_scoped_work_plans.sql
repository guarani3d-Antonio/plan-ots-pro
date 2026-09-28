begin;

-- Cada torre es una obra principal; sus planos/sectores son proyectos hijos.
-- Las OTs siguen apuntando al plano concreto y el acceso se hereda de la torre.
alter table public.proyectos add column proyecto_padre_id uuid references public.proyectos(id);
create index proyectos_padre_activos on public.proyectos(proyecto_padre_id) where deleted_at is null;

create function public.plan_validar_jerarquia_proyectos()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_parent public.proyectos%rowtype;
begin
  if tg_op='UPDATE' and new.proyecto_padre_id is distinct from old.proyecto_padre_id then
    raise exception 'La torre de un plano es inmutable' using errcode='42501';
  end if;
  if new.proyecto_padre_id is not null then
    select * into v_parent from public.proyectos where id=new.proyecto_padre_id;
    if not found or v_parent.deleted_at is not null or v_parent.tenant_id is distinct from new.tenant_id
       or v_parent.proyecto_padre_id is not null then
      raise exception 'La torre principal debe existir en la misma empresa' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null and exists (
    select 1 from public.proyectos h where h.proyecto_padre_id=old.id and h.deleted_at is null
  ) then
    raise exception 'Elimine primero los planos activos de esta torre' using errcode='23503';
  end if;
  return new;
end $$;
create trigger plan_validar_jerarquia_proyectos before insert or update on public.proyectos
for each row execute function public.plan_validar_jerarquia_proyectos();
revoke all on function public.plan_validar_jerarquia_proyectos() from public,anon,authenticated;

-- Un supervisor de torre puede crear planos en esa torre, pero ya no obras
-- principales para toda la empresa. Esa accion queda en Creador/Administrador.
create or replace function public.plan_puede_crear_proyecto(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select public.plan_es_creador() or exists (
    select 1 from public.tenants t
    join public.tenant_miembros tm on tm.tenant_id=t.id
    where t.id=p_tenant_id and t.activo and tm.user_id=auth.uid()
      and tm.activo and tm.rol='administrador'
  );
$$;
revoke all on function public.plan_puede_crear_proyecto(uuid) from public,anon,authenticated;
grant execute on function public.plan_puede_crear_proyecto(uuid) to authenticated;

create function public.plan_crear_plano_en_obra(p_torre uuid,p_nombre text)
returns public.proyectos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_torre public.proyectos%rowtype; v_nuevo public.proyectos;
begin
  select * into v_torre from public.proyectos where id=p_torre and deleted_at is null and proyecto_padre_id is null;
  if auth.uid() is null or not found or not public.plan_es_supervisor_proyecto(p_torre)
     or not exists(select 1 from public.tenants where id=v_torre.tenant_id and activo) then
    raise exception 'No tiene permiso para crear planos en esta torre' using errcode='42501';
  end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre)) > 180 then
    raise exception 'Ingrese un nombre de plano de hasta 180 caracteres' using errcode='22023';
  end if;
  insert into public.proyectos(nombre,plano_url,cliente,descripcion,rubros,tecnicos,tenant_id,created_by,proyecto_padre_id)
  values(btrim(p_nombre),'pending://plan-upload-required',v_torre.cliente,null,'{}','{}',v_torre.tenant_id,auth.uid(),p_torre)
  returning * into v_nuevo;
  insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  select v_nuevo.id,pm.user_id,pm.rol,auth.uid() from public.proyecto_miembros pm
  where pm.proyecto_id=p_torre and exists (
    select 1 from public.tenant_miembros tm where tm.tenant_id=v_torre.tenant_id
      and tm.user_id=pm.user_id and tm.activo
    union all
    select 1 from public.plataforma_administradores pa where pa.user_id=pm.user_id and pa.activo
  ) on conflict(proyecto_id,user_id) do nothing;
  return v_nuevo;
end $$;
revoke all on function public.plan_crear_plano_en_obra(uuid,text) from public,anon,authenticated;
grant execute on function public.plan_crear_plano_en_obra(uuid,text) to authenticated;

-- Dar o retirar una torre propaga el mismo permiso a todos sus planos activos.
create function public.plan_sincronizar_miembros_planos()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto uuid:=case when tg_op='DELETE' then old.proyecto_id else new.proyecto_id end;
begin
  if not exists(select 1 from public.proyectos where id=v_proyecto and proyecto_padre_id is null) then
    return null;
  end if;
  if tg_op='DELETE' then
    delete from public.proyecto_miembros pm using public.proyectos p
    where pm.proyecto_id=p.id and p.proyecto_padre_id=v_proyecto and pm.user_id=old.user_id;
  else
    insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
    select p.id,new.user_id,new.rol,new.invitado_por from public.proyectos p
    where p.proyecto_padre_id=v_proyecto and p.deleted_at is null
    on conflict(proyecto_id,user_id) do update set rol=excluded.rol;
  end if;
  return null;
end $$;
create trigger plan_sincronizar_miembros_planos after insert or update or delete on public.proyecto_miembros
for each row execute function public.plan_sincronizar_miembros_planos();
revoke all on function public.plan_sincronizar_miembros_planos() from public,anon,authenticated;

-- Una invitacion de equipo siempre se reserva para la torre, no un plano suelto.
create or replace function public.plan_reservar_invitacion_equipo(
  p_tenant uuid, p_proyecto uuid, p_email text
) returns uuid language plpgsql security definer set search_path=pg_catalog, pg_temp as $$
declare v_limite smallint; v_usadas integer; v_id uuid; v_email text := lower(btrim(p_email));
begin
  if auth.uid() is null or v_email is null or length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Correo invalido' using errcode='22023';
  end if;
  select d.limite into v_limite from public.plan_delegaciones_invitacion d
  join public.tenant_miembros tm on tm.tenant_id=d.tenant_id and tm.user_id=d.supervisor_id
  join public.tenants t on t.id=d.tenant_id
  where d.tenant_id=p_tenant and d.supervisor_id=auth.uid() and d.activa
    and tm.activo and tm.rol='supervisor' and t.activo
  for update of d;
  if v_limite is null or not exists (
    select 1 from public.proyectos p
    join public.proyecto_miembros pm on pm.proyecto_id=p.id and pm.user_id=auth.uid()
    where p.id=p_proyecto and p.tenant_id=p_tenant and p.deleted_at is null
      and p.proyecto_padre_id is null and pm.rol='supervisor'
  ) then
    raise exception 'No puede invitar a esta torre' using errcode='42501';
  end if;
  select count(*) into v_usadas from public.plan_invitaciones_equipo
  where tenant_id=p_tenant and supervisor_id=auth.uid();
  if v_usadas >= v_limite then
    raise exception 'Se alcanzo el limite de invitaciones de prueba' using errcode='22023';
  end if;
  insert into public.plan_invitaciones_equipo(tenant_id,supervisor_id,proyecto_id,email)
  values(p_tenant,auth.uid(),p_proyecto,v_email) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.plan_reservar_invitacion_equipo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.plan_reservar_invitacion_equipo(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
