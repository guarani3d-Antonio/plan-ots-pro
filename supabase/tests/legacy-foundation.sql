-- Fixture de laboratorio derivado del catálogo de Plan-ots-2 leído el
-- 20/09/2026 22:33:32 UTC (PostgreSQL 17.6). NO ejecutar en Supabase.
-- Conserva definiciones de las dos tablas afectadas y sus permisos/triggers.
-- auth.users y auth.uid son sustitutos locales; no prueba JWT ni servicios HTTP.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- ACL por defecto efectivamente observadas: revocar PUBLIC no revoca anon.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente text,
  descripcion text,
  metadatos jsonb not null default '{}'::jsonb,
  plano_url text not null,
  plano_thumb_url text,
  plano_width_px int4,
  plano_height_px int4,
  transform_matrices jsonb not null default '{}'::jsonb,
  rubros text[] not null default '{}'::text[],
  tecnicos text[] not null default '{}'::text[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.proyecto_miembros (
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  rol text not null check (rol in ('supervisor','tecnico','viewer')),
  invitado_por uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (proyecto_id,user_id)
);
create index idx_proyectos_created_by on public.proyectos(created_by);
create index idx_proyectos_updated_at on public.proyectos(updated_at desc);
create index idx_proyectos_deleted_at on public.proyectos(deleted_at) where deleted_at is null;
create index idx_miembros_user_id on public.proyecto_miembros(user_id);
create index idx_miembros_proyecto on public.proyecto_miembros(proyecto_id);
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create function public.es_miembro(p_proyecto_id uuid) returns boolean
language sql security definer as $$
  select exists (select 1 from proyecto_miembros where proyecto_id=p_proyecto_id and user_id=auth.uid());
$$;
create function public.es_supervisor(p_proyecto_id uuid) returns boolean
language sql security definer as $$
  select exists (select 1 from proyecto_miembros where proyecto_id=p_proyecto_id and user_id=auth.uid() and rol='supervisor');
$$;
create function public.agregar_creador_como_supervisor() returns trigger
language plpgsql security definer as $$
begin
  insert into proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  values(new.id,new.created_by,'supervisor',new.created_by);
  return new;
end;
$$;
create trigger trg_proyectos_updated_at before update on public.proyectos
for each row execute function public.set_updated_at();
create trigger trg_proyecto_creado after insert on public.proyectos for each row
when (new.created_by is not null) execute function public.agregar_creador_como_supervisor();
alter table public.proyectos enable row level security;
alter table public.proyecto_miembros enable row level security;
create policy "Ver proyectos propios" on public.proyectos for select
using (es_miembro(id) or created_by=auth.uid());
create policy "Crear proyectos" on public.proyectos for insert with check (created_by=auth.uid());
create policy "Editar proyectos (solo supervisor)" on public.proyectos for update using(es_supervisor(id));
create policy "Eliminar proyectos (solo supervisor)" on public.proyectos for delete using(es_supervisor(id));
create policy "Ver miembros del proyecto" on public.proyecto_miembros for select using(es_miembro(proyecto_id));
create policy "Gestionar miembros (solo supervisor)" on public.proyecto_miembros for all using(es_supervisor(proyecto_id));

-- Tablas mínimas adicionales para ejecutar la fase 2 completa. Conservan las
-- claves y columnas usadas por integridad/RLS; no pretenden clonar la aplicación.
create table public.ordenes (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  ot text not null, created_by uuid references auth.users(id), updated_by uuid references auth.users(id), estado text not null default 'Pendiente'
);
create table public.campos_definicion (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nombre text not null default 'Campo'
);
create table public.fotos (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  orden_id uuid not null references public.ordenes(id) on delete cascade,
  campo_id uuid references public.campos_definicion(id), uploaded_by uuid references auth.users(id), file_path text not null default 'fixture'
);
create table public.comentarios_ot (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  orden_id uuid not null references public.ordenes(id) on delete cascade, user_id uuid not null references auth.users(id), texto text not null default 'comentario'
);
create table public.ot_comentarios (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id),
  orden_id uuid not null references public.ordenes(id) on delete cascade, user_id uuid references auth.users(id), comentario text not null default 'comentario'
);
create table public.versiones (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_by uuid references auth.users(id), nombre text not null default 'Versión'
);
create table public.sync_log (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid references public.proyectos(id) on delete cascade,
  user_id uuid references auth.users(id), accion text not null default 'UPDATE_OT'
);
create table public.eventos_uso (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid references public.proyectos(id) on delete set null,
  user_id uuid not null references auth.users(id), tipo text not null default 'heartbeat'
);
create table public.ordenes_eliminadas (
  id uuid primary key default gen_random_uuid(), proyecto_id uuid, orden_id uuid not null
);
create table public.dashboard_configs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), widgets jsonb not null default '[]'
);
create view public.vista_proyectos_resumen with (security_invoker=true) as
  select p.id,p.nombre,count(o.id) total_ordenes from public.proyectos p left join public.ordenes o on o.proyecto_id=p.id group by p.id;
create view public.vista_ordenes_fotos with (security_invoker=true) as
  select o.id,o.proyecto_id,count(f.id) total_fotos from public.ordenes o left join public.fotos f on f.orden_id=o.id group by o.id;
alter table public.ordenes enable row level security;
alter table public.campos_definicion enable row level security;
alter table public.fotos enable row level security;
alter table public.comentarios_ot enable row level security;
alter table public.ot_comentarios enable row level security;
alter table public.versiones enable row level security;
alter table public.sync_log enable row level security;
alter table public.eventos_uso enable row level security;
alter table public.ordenes_eliminadas enable row level security;
alter table public.dashboard_configs enable row level security;
