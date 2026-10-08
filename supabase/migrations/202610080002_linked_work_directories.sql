begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

-- La obra principal conserva su identidad y sus permisos; su ficha no requiere un plano.
alter table public.proyectos add column es_ficha_obra boolean not null default false;
create table public.plan_obra_fichas (
  obra_id uuid primary key references public.proyectos(id) on delete restrict,
  direccion text check (direccion is null or length(direccion) <= 500),
  actualizado_en timestamptz not null default now()
);
create table public.plan_obra_contactos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.proyectos(id) on delete restrict,
  nombre text not null check(length(btrim(nombre)) between 1 and 160),
  cargo text check(cargo is null or length(cargo)<=160),
  telefono text check(telefono is null or length(telefono)<=80),
  correo text check(correo is null or length(correo)<=254),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create index plan_obra_contactos_obra on public.plan_obra_contactos(obra_id);
alter table public.plan_obra_fichas enable row level security;
alter table public.plan_obra_contactos enable row level security;
revoke all on public.plan_obra_fichas,public.plan_obra_contactos from public,anon,authenticated;

create function public.plan_ficha_obra(p_proyecto uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p public.proyectos; w public.proyectos;
begin
  select * into p from public.proyectos where id=p_proyecto and deleted_at is null;
  if auth.uid() is null or p.id is null or not public.plan_es_miembro_proyecto(p_proyecto) then
    raise exception 'No tiene acceso a esta obra' using errcode='42501'; end if;
  select * into w from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id) and deleted_at is null;
  if w.id is null then raise exception 'Obra no disponible' using errcode='23503'; end if;
  return jsonb_build_object('id',w.id,'nombre',w.nombre,'proyecto_nombre',p.nombre,
    'direccion',(select direccion from public.plan_obra_fichas where obra_id=w.id),
    'contactos',coalesce((select jsonb_agg(to_jsonb(c) order by c.nombre) from public.plan_obra_contactos c
      where c.obra_id=w.id and c.activo),'[]'::jsonb));
end $$;

create function public.plan_guardar_ficha_obra(p_tenant uuid,p_obra uuid,p_nombre text,p_direccion text)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare w public.proyectos;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'El Creador administra las fichas de obra' using errcode='42501'; end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre))>180 or length(p_direccion)>500 then
    raise exception 'Revise el nombre y la dirección de la obra' using errcode='22023'; end if;
  if p_obra is null then
    select * into w from public.plan_crear_proyecto(p_nombre,'pending://plan-upload-required',null,null,'{}','{}',p_tenant);
    update public.proyectos set es_ficha_obra=true where id=w.id;
  else
    select * into w from public.proyectos where id=p_obra and tenant_id=p_tenant
      and proyecto_padre_id is null and deleted_at is null for update;
    if w.id is null then raise exception 'Obra no disponible en esta empresa' using errcode='42501'; end if;
    update public.proyectos set nombre=btrim(p_nombre),updated_at=now() where id=w.id;
  end if;
  insert into public.plan_obra_fichas(obra_id,direccion) values(w.id,nullif(btrim(p_direccion),''))
    on conflict(obra_id) do update set direccion=excluded.direccion,actualizado_en=now();
  return w.id;
end $$;

create function public.plan_guardar_contacto_obra(p_proyecto uuid,p_id uuid,p_nombre text,p_cargo text,p_telefono text,p_correo text)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p public.proyectos; result uuid;
begin
  select * into p from public.proyectos where id=p_proyecto and deleted_at is null;
  if auth.uid() is null or p.id is null or not public.plan_es_supervisor_proyecto(p_proyecto) then
    raise exception 'El supervisor de la obra o el Creador registra sus contactos' using errcode='42501'; end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre))>160 or length(p_cargo)>160
    or length(p_telefono)>80 or length(p_correo)>254 then
    raise exception 'Revise los datos del contacto' using errcode='22023'; end if;
  if nullif(btrim(p_correo),'') is not null and p_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Revise el correo del contacto' using errcode='22023'; end if;
  if p_id is null then
    insert into public.plan_obra_contactos(obra_id,nombre,cargo,telefono,correo)
    values(coalesce(p.proyecto_padre_id,p.id),btrim(p_nombre),nullif(btrim(p_cargo),''),nullif(btrim(p_telefono),''),nullif(btrim(p_correo),'')) returning id into result;
  else
    update public.plan_obra_contactos set nombre=btrim(p_nombre),cargo=nullif(btrim(p_cargo),''),
      telefono=nullif(btrim(p_telefono),''),correo=nullif(btrim(p_correo),''),actualizado_en=now()
      where id=p_id and obra_id=coalesce(p.proyecto_padre_id,p.id) returning id into result;
    if result is null then raise exception 'Contacto no disponible en esta obra' using errcode='42501'; end if;
  end if;
  return result;
end $$;

-- Relación persistente con fichas, sin perder los nombres históricos de la OT.
create table public.plan_orden_contratistas (
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  contratista_id uuid not null references public.plan_contratistas(id) on delete restrict,
  nombre_snapshot text not null,
  primary key(orden_id,contratista_id)
);
alter table public.plan_orden_contratistas enable row level security;
revoke all on public.plan_orden_contratistas from public,anon,authenticated;
create function public.plan_vincular_fichas_contratista() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;
begin
  select tenant_id into tid from public.proyectos where id=new.proyecto_id;
  delete from public.plan_orden_contratistas v where v.orden_id=new.id
    and not (v.nombre_snapshot=any(coalesce(new.contratistas,'{}')))
    and not exists(select 1 from public.plan_contratistas c where c.id=v.contratista_id
      and c.nombre=any(coalesce(new.contratistas,'{}')));
  insert into public.plan_orden_contratistas(orden_id,contratista_id,nombre_snapshot)
    select new.id,c.id,c.nombre from public.plan_contratistas c where c.tenant_id=tid
      and c.nombre=any(coalesce(new.contratistas,'{}'))
    on conflict(orden_id,contratista_id) do update set nombre_snapshot=excluded.nombre_snapshot;
  return new;
end $$;
create trigger plan_vincular_fichas_contratista after insert or update of contratistas on public.ordenes
  for each row execute function public.plan_vincular_fichas_contratista();
insert into public.plan_orden_contratistas(orden_id,contratista_id,nombre_snapshot)
  select o.id,c.id,c.nombre from public.ordenes o join public.proyectos p on p.id=o.proyecto_id
    join public.plan_contratistas c on c.tenant_id=p.tenant_id and c.nombre=any(coalesce(o.contratistas,'{}')) on conflict do nothing;

create function public.plan_fichas_contratistas_obra(p_proyecto uuid)
returns table(id uuid,nombre text,identificacion text,contacto text,telefono text,correo text,direccion text,activo boolean)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;
begin
  select tenant_id into tid from public.proyectos where proyectos.id=p_proyecto and deleted_at is null;
  if auth.uid() is null or tid is null or not public.plan_es_miembro_proyecto(p_proyecto) then
    raise exception 'No tiene acceso al directorio de esta obra' using errcode='42501'; end if;
  return query select c.id,c.nombre,f.identificacion,f.contacto,f.telefono,f.correo,f.direccion,coalesce(f.activo,true)
    from public.plan_contratistas c left join public.plan_contratista_fichas f on f.contratista_id=c.id
    where c.tenant_id=tid order by c.nombre;
end $$;
create function public.plan_contratistas_vinculados_ot(p_orden uuid)
returns table(id uuid,nombre text,identificacion text,contacto text,telefono text,correo text,direccion text,activo boolean,nombre_ot text)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p uuid;
begin
  select proyecto_id into p from public.ordenes where ordenes.id=p_orden;
  if p is null or not public.plan_es_miembro_proyecto(p) then
    raise exception 'No tiene acceso a esta OT' using errcode='42501'; end if;
  return query select f.*,v.nombre_snapshot from public.plan_fichas_contratistas_obra(p) f
    join public.plan_orden_contratistas v on v.contratista_id=f.id and v.orden_id=p_orden;
end $$;
revoke all on function public.plan_ficha_obra(uuid),public.plan_guardar_ficha_obra(uuid,uuid,text,text),
 public.plan_guardar_contacto_obra(uuid,uuid,text,text,text,text),public.plan_fichas_contratistas_obra(uuid),
 public.plan_contratistas_vinculados_ot(uuid),public.plan_vincular_fichas_contratista() from public,anon,authenticated;
grant execute on function public.plan_ficha_obra(uuid),public.plan_guardar_ficha_obra(uuid,uuid,text,text),
 public.plan_guardar_contacto_obra(uuid,uuid,text,text,text,text),public.plan_fichas_contratistas_obra(uuid),
 public.plan_contratistas_vinculados_ot(uuid) to authenticated;
commit;

