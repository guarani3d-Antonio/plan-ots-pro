begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

-- Una persona/empresa puede reclamar por varias ubicaciones y en varias obras.
-- El domicilio del cliente y la dirección del inmueble son datos distintos.
create table public.plan_clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) between 1 and 160),
  identificacion text check (identificacion is null or length(identificacion) <= 80),
  contacto text check (contacto is null or length(contacto) <= 160),
  telefono text check (telefono is null or length(telefono) <= 80),
  correo text check (correo is null or length(correo) <= 254),
  direccion text check (direccion is null or length(direccion) <= 500),
  activo boolean not null default true,
  creado_por uuid not null references auth.users(id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index plan_clientes_identificacion_unica
  on public.plan_clientes(tenant_id, lower(btrim(identificacion)))
  where identificacion is not null and btrim(identificacion) <> '';
create index plan_clientes_tenant_nombre on public.plan_clientes(tenant_id, nombre);
alter table public.plan_clientes enable row level security;
revoke all on public.plan_clientes from public, anon, authenticated;
grant select on public.plan_clientes to authenticated;
create policy plan_clientes_lectura on public.plan_clientes for select to authenticated
  using (public.plan_es_creador());

create table public.plan_cliente_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cliente_id uuid not null,
  proyecto_id uuid,
  tipo_inmueble text not null check (tipo_inmueble in
    ('oficina_altura','residencial_altura','industrial','otro')),
  nombre_obra text not null check (length(btrim(nombre_obra)) between 1 and 160),
  direccion text check (direccion is null or length(direccion) <= 500),
  piso text check (piso is null or length(piso) <= 40),
  unidad text check (unidad is null or length(unidad) <= 80),
  sector text check (sector is null or length(sector) <= 120),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (tenant_id, cliente_id)
    references public.plan_clientes(tenant_id, id) on delete restrict,
  foreign key (tenant_id, proyecto_id)
    references public.proyectos(tenant_id, id) on delete restrict,
  unique (tenant_id, cliente_id, id)
);
create index plan_cliente_ubicaciones_cliente
  on public.plan_cliente_ubicaciones(tenant_id, cliente_id);
create index plan_cliente_ubicaciones_proyecto
  on public.plan_cliente_ubicaciones(proyecto_id) where proyecto_id is not null;
alter table public.plan_cliente_ubicaciones enable row level security;
revoke all on public.plan_cliente_ubicaciones from public, anon, authenticated;
grant select on public.plan_cliente_ubicaciones to authenticated;
create policy plan_cliente_ubicaciones_lectura on public.plan_cliente_ubicaciones
  for select to authenticated using (public.plan_es_creador());

-- Referencias de OT para historial por cliente. Los textos existentes de obra
-- y unidad permanecen como instantáneas compatibles con informes anteriores.
alter table public.ordenes add column cliente_id uuid references public.plan_clientes(id) on delete restrict;
alter table public.ordenes add column cliente_ubicacion_id uuid
  references public.plan_cliente_ubicaciones(id) on delete restrict;
create index ordenes_cliente_historial on public.ordenes(cliente_id, created_at desc)
  where cliente_id is not null;

create function public.plan_validar_cliente_ot() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_tenant uuid; v_cliente public.plan_clientes; v_lugar public.plan_cliente_ubicaciones;
begin
  if new.cliente_id is null and new.cliente_ubicacion_id is null then return new; end if;
  if new.cliente_id is null or new.cliente_ubicacion_id is null then
    raise exception 'Elegí cliente y ubicación juntos' using errcode='23503'; end if;
  select p.tenant_id into v_tenant from public.proyectos p
    where p.id=new.proyecto_id and p.deleted_at is null;
  select * into v_cliente from public.plan_clientes c
    where c.id=new.cliente_id and c.tenant_id=v_tenant;
  select * into v_lugar from public.plan_cliente_ubicaciones u
    where u.id=new.cliente_ubicacion_id and u.tenant_id=v_tenant
      and u.cliente_id=new.cliente_id and u.proyecto_id=new.proyecto_id;
  if v_cliente.id is null or v_lugar.id is null then
    raise exception 'Cliente o ubicación no pertenecen a esta obra y empresa' using errcode='23503'; end if;
  if not v_cliente.activo or not v_lugar.activo then
    if tg_op = 'INSERT' then
      raise exception 'Seleccioná un cliente y una ubicación activos' using errcode='23503';
    elsif new.cliente_id is distinct from old.cliente_id
       or new.cliente_ubicacion_id is distinct from old.cliente_ubicacion_id then
      raise exception 'Seleccioná un cliente y una ubicación activos' using errcode='23503';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.plan_validar_cliente_ot() from public, anon, authenticated;
create trigger plan_validar_cliente_ot before insert or update of cliente_id,cliente_ubicacion_id,proyecto_id
  on public.ordenes for each row execute function public.plan_validar_cliente_ot();

-- Los miembros conservan el listado de nombres de contratistas existente.
-- Los contactos y documentos se leen solamente desde la ficha autorizada.
alter table public.plan_contratistas add constraint plan_contratistas_tenant_id_unico
  unique (tenant_id, id);
create table public.plan_contratista_fichas (
  contratista_id uuid primary key,
  tenant_id uuid not null,
  identificacion text check (identificacion is null or length(identificacion) <= 80),
  contacto text check (contacto is null or length(contacto) <= 160),
  telefono text check (telefono is null or length(telefono) <= 80),
  correo text check (correo is null or length(correo) <= 254),
  direccion text check (direccion is null or length(direccion) <= 500),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  foreign key (tenant_id, contratista_id)
    references public.plan_contratistas(tenant_id, id) on delete restrict
);
alter table public.plan_contratista_fichas enable row level security;
revoke all on public.plan_contratista_fichas from public, anon, authenticated;
grant select on public.plan_contratista_fichas to authenticated;
create policy plan_contratista_fichas_lectura on public.plan_contratista_fichas
  for select to authenticated using (
    public.plan_es_creador() or public.plan_es_admin_tenant(tenant_id)
  );

create function public.plan_guardar_cliente(
  p_tenant uuid, p_id uuid, p_nombre text, p_identificacion text,
  p_contacto text, p_telefono text, p_correo text, p_direccion text,
  p_activo boolean default true
) returns public.plan_clientes
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_result public.plan_clientes;
begin
  if auth.uid() is null or not public.plan_es_creador() or not exists (
    select 1 from public.tenants where id = p_tenant and activo
  ) then raise exception 'Solo el Creador puede administrar clientes de una empresa activa' using errcode = '42501'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 160 then
    raise exception 'Nombre de cliente inválido' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.plan_clientes(tenant_id,nombre,identificacion,contacto,telefono,correo,direccion,activo,creado_por)
    values(p_tenant,btrim(p_nombre),nullif(btrim(p_identificacion),''),nullif(btrim(p_contacto),''),
      nullif(btrim(p_telefono),''),nullif(btrim(p_correo),''),nullif(btrim(p_direccion),''),coalesce(p_activo,true),auth.uid())
    returning * into v_result;
  else
    update public.plan_clientes set nombre=btrim(p_nombre),identificacion=nullif(btrim(p_identificacion),''),
      contacto=nullif(btrim(p_contacto),''),telefono=nullif(btrim(p_telefono),''),
      correo=nullif(btrim(p_correo),''),direccion=nullif(btrim(p_direccion),''),
      activo=coalesce(p_activo,true),actualizado_en=now()
    where id=p_id and tenant_id=p_tenant returning * into v_result;
    if v_result.id is null then raise exception 'Cliente inexistente en esta empresa' using errcode='23503'; end if;
  end if;
  return v_result;
end $$;

create function public.plan_guardar_cliente_ubicacion(
  p_tenant uuid, p_id uuid, p_cliente uuid, p_proyecto uuid,
  p_tipo text, p_nombre_obra text, p_direccion text, p_piso text,
  p_unidad text, p_sector text, p_activo boolean default true
) returns public.plan_cliente_ubicaciones
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_result public.plan_cliente_ubicaciones;
begin
  if auth.uid() is null or not public.plan_es_creador()
    or not exists(select 1 from public.tenants where id=p_tenant and activo)
    or not exists(select 1 from public.plan_clientes where id=p_cliente and tenant_id=p_tenant)
    or (p_proyecto is not null and not exists(
      select 1 from public.proyectos
      where id=p_proyecto and tenant_id=p_tenant and deleted_at is null)) then
    raise exception 'Cliente u obra fuera de la empresa activa, o acceso no autorizado' using errcode='42501';
  end if;
  if p_tipo is null or p_tipo not in ('oficina_altura','residencial_altura','industrial','otro')
    or p_nombre_obra is null or length(btrim(p_nombre_obra)) not between 1 and 160 then
    raise exception 'Tipo o nombre de obra inválido' using errcode='22023';
  end if;
  if p_id is null then
    insert into public.plan_cliente_ubicaciones(
      tenant_id,cliente_id,proyecto_id,tipo_inmueble,nombre_obra,direccion,piso,unidad,sector,activo)
    values(p_tenant,p_cliente,p_proyecto,p_tipo,btrim(p_nombre_obra),
      nullif(btrim(p_direccion),''),nullif(btrim(p_piso),''),
      nullif(btrim(p_unidad),''),nullif(btrim(p_sector),''),coalesce(p_activo,true))
    returning * into v_result;
  else
    update public.plan_cliente_ubicaciones set proyecto_id=p_proyecto,tipo_inmueble=p_tipo,
      nombre_obra=btrim(p_nombre_obra),direccion=nullif(btrim(p_direccion),''),
      piso=nullif(btrim(p_piso),''),unidad=nullif(btrim(p_unidad),''),
      sector=nullif(btrim(p_sector),''),activo=coalesce(p_activo,true),actualizado_en=now()
    where id=p_id and tenant_id=p_tenant and cliente_id=p_cliente returning * into v_result;
    if v_result.id is null then raise exception 'Ubicación inexistente para este cliente' using errcode='23503'; end if;
  end if;
  return v_result;
end $$;

-- El editor de una obra solo recibe las fichas vinculadas a esa obra.
-- No se expone la tabla completa de clientes ni domicilios ajenos.
create function public.plan_clientes_para_obra(p_proyecto uuid)
returns table(cliente_id uuid,ubicacion_id uuid,nombre text,identificacion text,
  contacto text,telefono text,correo text,domicilio text,tipo_inmueble text,
  nombre_obra text,direccion_obra text,piso text,unidad text,sector text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not public.plan_puede_editar_proyecto(p_proyecto) then
    raise exception 'Sin acceso de edición a esta obra' using errcode='42501';
  end if;
  return query select c.id,u.id,c.nombre,c.identificacion,c.contacto,c.telefono,
    c.correo,c.direccion,u.tipo_inmueble,u.nombre_obra,u.direccion,u.piso,u.unidad,u.sector
  from public.plan_cliente_ubicaciones u
  join public.plan_clientes c on c.id=u.cliente_id and c.tenant_id=u.tenant_id
  join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id
  where u.proyecto_id=p_proyecto and p.deleted_at is null
    and c.activo and u.activo
  order by c.nombre,u.nombre_obra,u.unidad;
end $$;

create function public.plan_bloquear_reubicacion_cliente() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if (old.proyecto_id is distinct from new.proyecto_id
      or old.cliente_id is distinct from new.cliente_id)
    and exists(select 1 from public.ordenes where cliente_ubicacion_id=old.id) then
    raise exception 'La ubicación tiene OTs: no se puede cambiar de obra o cliente' using errcode='23503';
  end if;
  return new;
end $$;
revoke all on function public.plan_bloquear_reubicacion_cliente() from public, anon, authenticated;
create trigger plan_bloquear_reubicacion_cliente before update of proyecto_id,cliente_id
  on public.plan_cliente_ubicaciones for each row execute function public.plan_bloquear_reubicacion_cliente();

create function public.plan_contratistas_activos(p_tenant uuid)
returns table(id uuid,tenant_id uuid,nombre text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not (
    public.plan_es_creador() or exists(
      select 1 from public.tenant_miembros tm join public.tenants t on t.id=tm.tenant_id
      where tm.tenant_id=p_tenant and tm.user_id=auth.uid() and tm.activo and t.activo)
  ) then raise exception 'Sin acceso al directorio de esta empresa' using errcode='42501'; end if;
  return query select c.id,c.tenant_id,c.nombre from public.plan_contratistas c
    left join public.plan_contratista_fichas f on f.contratista_id=c.id
    where c.tenant_id=p_tenant and coalesce(f.activo,true)
    order by c.nombre,c.id;
end $$;

create function public.plan_guardar_contratista_ficha(
  p_tenant uuid, p_id uuid, p_nombre text, p_identificacion text,
  p_contacto text, p_telefono text, p_correo text, p_direccion text,
  p_activo boolean default true
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.plan_es_creador() or not exists (
    select 1 from public.tenants where id = p_tenant and activo
  ) then raise exception 'Solo el Creador puede administrar contratistas de una empresa activa' using errcode = '42501'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 160 then
    raise exception 'Nombre de contratista inválido' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.plan_contratistas(tenant_id,nombre,creado_por)
      values(p_tenant,btrim(p_nombre),auth.uid())
      on conflict(tenant_id,nombre_clave) do nothing;
    select id into v_id from public.plan_contratistas
      where tenant_id=p_tenant and nombre_clave=lower(btrim(p_nombre));
  else
    update public.plan_contratistas set nombre=btrim(p_nombre)
      where id=p_id and tenant_id=p_tenant returning id into v_id;
    if v_id is null then raise exception 'Contratista inexistente en esta empresa' using errcode='23503'; end if;
  end if;
  insert into public.plan_contratista_fichas(
    contratista_id,tenant_id,identificacion,contacto,telefono,correo,direccion,activo
  ) values(v_id,p_tenant,nullif(btrim(p_identificacion),''),nullif(btrim(p_contacto),''),
    nullif(btrim(p_telefono),''),nullif(btrim(p_correo),''),nullif(btrim(p_direccion),''),coalesce(p_activo,true))
  on conflict(contratista_id) do update set
    identificacion=excluded.identificacion,contacto=excluded.contacto,
    telefono=excluded.telefono,correo=excluded.correo,direccion=excluded.direccion,
    activo=excluded.activo,actualizado_en=now();
  return v_id;
end $$;

revoke all on function public.plan_guardar_cliente(uuid,uuid,text,text,text,text,text,text,boolean),
  public.plan_guardar_cliente_ubicacion(uuid,uuid,uuid,uuid,text,text,text,text,text,text,boolean),
  public.plan_clientes_para_obra(uuid),
  public.plan_contratistas_activos(uuid),
  public.plan_guardar_contratista_ficha(uuid,uuid,text,text,text,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.plan_guardar_cliente(uuid,uuid,text,text,text,text,text,text,boolean),
  public.plan_guardar_cliente_ubicacion(uuid,uuid,uuid,uuid,text,text,text,text,text,text,boolean),
  public.plan_clientes_para_obra(uuid),
  public.plan_contratistas_activos(uuid),
  public.plan_guardar_contratista_ficha(uuid,uuid,text,text,text,text,text,text,boolean)
  to authenticated;
notify pgrst, 'reload schema';
commit;
