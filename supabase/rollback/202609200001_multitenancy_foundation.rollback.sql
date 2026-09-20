-- Rollback de la fase 1, válido solo antes del backfill y del uso real.
-- Se detiene si detecta datos para evitar una pérdida silenciosa.

begin;

do $$
begin
  if exists (select 1 from public.tenants)
     or exists (select 1 from public.tenant_miembros)
     or exists (select 1 from public.plataforma_administradores)
     or exists (select 1 from public.proyectos where tenant_id is not null)
     or exists (select 1 from public.proyecto_miembros where tenant_id is not null)
  then
    raise exception
      'Rollback detenido: existen asignaciones multitenant. Preparar una migración de datos explícita.';
  end if;
end
$$;

drop policy if exists tenant_miembros_ver on public.tenant_miembros;
drop policy if exists plataforma_administradores_ver_propio on public.plataforma_administradores;
drop policy if exists tenants_ver on public.tenants;

drop function if exists public.plan_es_admin_tenant(uuid);
drop function if exists public.plan_tenant_id();
drop function if exists public.plan_es_creador();

drop index if exists public.proyecto_miembros_tenant_usuario;
drop index if exists public.proyectos_tenant_activos;
alter table public.proyecto_miembros drop column if exists tenant_id;
alter table public.proyectos drop column if exists tenant_id;

drop table public.tenant_miembros;
drop table public.plataforma_administradores;
drop table public.tenants;

commit;
