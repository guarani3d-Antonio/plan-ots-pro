-- Plan-OTs · fundamento multitenant, fase 1
-- Fecha: 2026-09-20
--
-- Esta migración es deliberadamente aditiva. No reemplaza las políticas RLS
-- vigentes de proyectos ni cambia el comportamiento del cliente actual.
-- Prepara la identidad empresa -> proyecto -> miembro para que una segunda
-- migración pueda hacer el backfill y activar el aislamiento por tenant.

begin;

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nombre      text not null,
  activo      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tenants_slug_formato check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tenants_nombre_no_vacio check (length(btrim(nombre)) > 0)
);

create table public.plataforma_administradores (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  activo      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.tenant_miembros (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rol         text not null,
  activo      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint tenant_miembros_rol_check
    check (rol in ('administrador', 'supervisor', 'tecnico', 'viewer'))
);

-- El modelo inicial asigna una cuenta activa a una sola empresa. Se conservan
-- membresías inactivas para trazabilidad y transferencias.
create unique index tenant_miembros_un_tenant_activo_por_usuario
  on public.tenant_miembros(user_id)
  where activo;

create index tenant_miembros_tenant_activos
  on public.tenant_miembros(tenant_id, user_id)
  where activo;

alter table public.proyectos
  add column tenant_id uuid references public.tenants(id);

create index proyectos_tenant_activos
  on public.proyectos(tenant_id, updated_at desc)
  where deleted_at is null;

alter table public.proyecto_miembros
  add column tenant_id uuid references public.tenants(id);

create index proyecto_miembros_tenant_usuario
  on public.proyecto_miembros(tenant_id, user_id, proyecto_id);

create or replace function public.plan_es_creador()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.plataforma_administradores pa
    where pa.user_id = auth.uid()
      and pa.activo
  );
$$;

create or replace function public.plan_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select tm.tenant_id
  from public.tenant_miembros tm
  where tm.user_id = auth.uid()
    and tm.activo
  limit 1;
$$;

create or replace function public.plan_es_admin_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.plan_es_creador() or exists (
    select 1
    from public.tenant_miembros tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.activo
      and tm.rol = 'administrador'
  );
$$;

revoke all on function public.plan_es_creador() from public;
revoke all on function public.plan_tenant_id() from public;
revoke all on function public.plan_es_admin_tenant(uuid) from public;
grant execute on function public.plan_es_creador() to authenticated;
grant execute on function public.plan_tenant_id() to authenticated;
grant execute on function public.plan_es_admin_tenant(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.plataforma_administradores enable row level security;
alter table public.tenant_miembros enable row level security;

create policy tenants_ver
  on public.tenants
  for select
  to authenticated
  using (
    public.plan_es_creador()
    or id = public.plan_tenant_id()
  );

create policy plataforma_administradores_ver_propio
  on public.plataforma_administradores
  for select
  to authenticated
  using (user_id = auth.uid() and activo);

create policy tenant_miembros_ver
  on public.tenant_miembros
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.plan_es_admin_tenant(tenant_id)
  );

-- Las altas y modificaciones se harán luego mediante RPCs de dominio con
-- validación y auditoría. En esta fase no se concede escritura directa.
revoke all on table public.tenants from public, anon, authenticated;
revoke all on table public.plataforma_administradores from public, anon, authenticated;
revoke all on table public.tenant_miembros from public, anon, authenticated;
grant select on table public.tenants to authenticated;
grant select on table public.plataforma_administradores to authenticated;
grant select on table public.tenant_miembros to authenticated;

comment on table public.tenants is
  'Empresa aislada de Plan-OTs. No confundir con el texto legado proyectos.cliente.';
comment on table public.plataforma_administradores is
  'Cuentas de plataforma fuera de los tenants; se provisionan por canal administrativo.';
comment on table public.tenant_miembros is
  'Rol de una cuenta dentro de una empresa. El acceso a proyectos requiere además proyecto_miembros.';
comment on column public.proyectos.tenant_id is
  'Empresa propietaria. Permanece nullable únicamente durante la migración compatible.';
comment on column public.proyecto_miembros.tenant_id is
  'Copia controlada del tenant del proyecto; se completará y validará en la fase 2.';

commit;
