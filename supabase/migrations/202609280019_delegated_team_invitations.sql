begin;

-- La delegacion es explicita, por empresa y por supervisor. El limite de prueba
-- se comprueba bajo bloqueo de fila para impedir invitaciones concurrentes de mas.
create table public.plan_delegaciones_invitacion (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supervisor_id uuid not null references auth.users(id) on delete cascade,
  limite smallint not null default 4 check (limite between 0 and 4),
  activa boolean not null default true,
  configurada_por uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, supervisor_id)
);

create table public.plan_invitaciones_equipo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supervisor_id uuid not null references auth.users(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  email text not null,
  estado text not null default 'reservada' check (estado in ('reservada', 'enviada')),
  invitado_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tenant_id, email),
  check (email = lower(btrim(email)))
);
create index plan_invitaciones_equipo_supervisor on public.plan_invitaciones_equipo(tenant_id, supervisor_id);

alter table public.plan_delegaciones_invitacion enable row level security;
alter table public.plan_invitaciones_equipo enable row level security;
create policy plan_delegaciones_leer on public.plan_delegaciones_invitacion for select to authenticated
  using (public.plan_es_creador() or supervisor_id = auth.uid());
create policy plan_invitaciones_leer on public.plan_invitaciones_equipo for select to authenticated
  using (public.plan_es_creador() or supervisor_id = auth.uid());
revoke all on public.plan_delegaciones_invitacion, public.plan_invitaciones_equipo from public, anon, authenticated;
grant select on public.plan_delegaciones_invitacion, public.plan_invitaciones_equipo to authenticated;

create function public.plan_configurar_delegacion_invitacion(
  p_tenant uuid, p_email text, p_limite smallint default 4, p_activa boolean default true
) returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_usuario uuid;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Solo el Creador configura invitaciones' using errcode='42501';
  end if;
  if p_limite is null or p_limite < 0 or p_limite > 4 then
    raise exception 'El limite de prueba es de cuatro invitaciones' using errcode='22023';
  end if;
  select u.id into v_usuario from auth.users u
  join public.tenant_miembros tm on tm.user_id = u.id and tm.tenant_id = p_tenant
  join public.tenants t on t.id = tm.tenant_id and t.activo
  where lower(u.email) = lower(btrim(p_email)) and tm.activo and tm.rol = 'supervisor';
  if v_usuario is null then
    raise exception 'La cuenta debe ser supervisor activo de esta empresa' using errcode='42501';
  end if;
  insert into public.plan_delegaciones_invitacion(tenant_id, supervisor_id, limite, activa, configurada_por)
  values(p_tenant, v_usuario, p_limite, p_activa, auth.uid())
  on conflict(tenant_id, supervisor_id) do update set
    limite=excluded.limite, activa=excluded.activa,
    configurada_por=excluded.configurada_por, updated_at=now();
end $$;

create function public.plan_reservar_invitacion_equipo(
  p_tenant uuid, p_proyecto uuid, p_email text
) returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
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
    where p.id=p_proyecto and p.tenant_id=p_tenant and p.deleted_at is null and pm.rol='supervisor'
  ) then
    raise exception 'No puede invitar a esta obra' using errcode='42501';
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

-- Estas dos operaciones se invocan exclusivamente desde la Edge Function con
-- service_role. La confirmacion asigna empresa y obra en una transaccion.
create function public.plan_confirmar_invitacion_equipo(p_reserva uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v public.plan_invitaciones_equipo%rowtype;
begin
  select * into v from public.plan_invitaciones_equipo where id=p_reserva and estado='reservada' for update;
  if not found or not exists(select 1 from auth.users u where u.id=p_usuario and lower(u.email)=v.email) then
    raise exception 'Reserva o cuenta invitada invalida' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.plan_delegaciones_invitacion d
    join public.tenants t on t.id=d.tenant_id and t.activo
    join public.tenant_miembros tm on tm.tenant_id=d.tenant_id and tm.user_id=d.supervisor_id
    join public.proyectos p on p.id=v.proyecto_id and p.tenant_id=d.tenant_id and p.deleted_at is null
    join public.proyecto_miembros pm on pm.proyecto_id=p.id and pm.user_id=d.supervisor_id and pm.rol='supervisor'
    where d.tenant_id=v.tenant_id and d.supervisor_id=v.supervisor_id
      and d.activa and tm.activo and tm.rol='supervisor'
  ) then
    raise exception 'La delegacion ya no esta vigente' using errcode='42501';
  end if;
  insert into public.tenant_miembros(tenant_id,user_id,rol,activo,created_by)
  values(v.tenant_id,p_usuario,'supervisor',true,v.supervisor_id);
  insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  values(v.proyecto_id,p_usuario,'supervisor',v.supervisor_id);
  update public.plan_invitaciones_equipo set estado='enviada',invitado_id=p_usuario,sent_at=now() where id=p_reserva;
end $$;

create function public.plan_cancelar_reserva_invitacion(p_reserva uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  delete from public.plan_invitaciones_equipo where id=p_reserva and estado='reservada';
end $$;

revoke all on function public.plan_configurar_delegacion_invitacion(uuid,text,smallint,boolean),
  public.plan_reservar_invitacion_equipo(uuid,uuid,text),
  public.plan_confirmar_invitacion_equipo(uuid,uuid),
  public.plan_cancelar_reserva_invitacion(uuid) from public,anon,authenticated;
grant execute on function public.plan_configurar_delegacion_invitacion(uuid,text,smallint,boolean),
  public.plan_reservar_invitacion_equipo(uuid,uuid,text) to authenticated;
grant execute on function public.plan_confirmar_invitacion_equipo(uuid,uuid),
  public.plan_cancelar_reserva_invitacion(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
