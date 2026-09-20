-- Verificación de catálogo posterior a la fase 1. Solo lectura.

begin;

select c.relname as tabla, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tenants', 'tenant_miembros', 'plataforma_administradores')
order by c.relname;

select table_name, column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    table_name in ('tenants', 'tenant_miembros', 'plataforma_administradores')
    or (table_name in ('proyectos', 'proyecto_miembros') and column_name = 'tenant_id')
  )
order by table_name, ordinal_position;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('tenants', 'tenant_miembros', 'plataforma_administradores')
order by tablename, policyname;

select routine_name, security_type, external_language
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('plan_es_creador', 'plan_tenant_id', 'plan_es_admin_tenant')
order by routine_name;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('tenants', 'tenant_miembros', 'plataforma_administradores')
order by table_name, grantee, privilege_type;

select
  has_function_privilege('anon', 'public.plan_es_creador()', 'EXECUTE') as anon_creador,
  has_function_privilege('authenticated', 'public.plan_es_creador()', 'EXECUTE') as auth_creador,
  has_function_privilege('anon', 'public.plan_tenant_id()', 'EXECUTE') as anon_tenant,
  has_function_privilege('authenticated', 'public.plan_tenant_id()', 'EXECUTE') as auth_tenant;

rollback;
