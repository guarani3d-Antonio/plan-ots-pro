-- Verificación de catálogo posterior a la fase 1 VACÍA. Solo lectura.
-- Debe terminar sin excepciones. No certifica aislamiento de tablas legadas.

begin read only;
set local statement_timeout = '30s';

do $$
declare
  relation_name text;
  function_name text;
begin
  foreach relation_name in array array['tenants','tenant_miembros','plataforma_administradores'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation_name and c.relkind='r' and c.relrowsecurity
      and pg_get_userbyid(c.relowner)='postgres') then
      raise exception 'Tabla/RLS/owner incorrecto: %', relation_name;
    end if;
    if has_table_privilege('anon', 'public.' || relation_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege('anon', 'public.' || relation_name, 'SELECT,INSERT,UPDATE,REFERENCES')
      or has_table_privilege('authenticated', 'public.' || relation_name, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege('authenticated', 'public.' || relation_name, 'INSERT,UPDATE,REFERENCES')
      or not has_table_privilege('authenticated', 'public.' || relation_name, 'SELECT') then
      raise exception 'Permisos incorrectos: %', relation_name;
    end if;
    if (select count(*) from pg_policies where schemaname='public' and tablename=relation_name) <> 1
      or not exists (select 1 from pg_policies where schemaname='public' and tablename=relation_name
        and cmd='SELECT' and roles=array['authenticated']::name[]) then
      raise exception 'Políticas incorrectas: %', relation_name;
    end if;
  end loop;
  foreach function_name in array array['plan_es_creador()', 'plan_tenant_id()', 'plan_es_admin_tenant(uuid)'] loop
    if has_function_privilege('anon', 'public.' || function_name, 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.' || function_name, 'EXECUTE') then
      raise exception 'EXECUTE incorrecto: %', function_name;
    end if;
    if not exists (select 1 from pg_proc where oid=('public.' || function_name)::regprocedure
      and prosecdef and pg_get_userbyid(proowner)='postgres'
      and proconfig @> array['search_path=pg_catalog, pg_temp']) then
      raise exception 'Definer inseguro: %', function_name;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where oid='public.plan_proteger_tenant_transicion()'::regprocedure
    and not prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp'])
    or has_function_privilege('anon','public.plan_proteger_tenant_transicion()','EXECUTE')
    or has_function_privilege('authenticated','public.plan_proteger_tenant_transicion()','EXECUTE') then
    raise exception 'Función de transición incorrecta';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and tgtype=23
    and tgfoid='public.plan_proteger_tenant_transicion()'::regprocedure
    and ((tgrelid='public.proyectos'::regclass and tgname='plan_proteger_tenant_proyecto')
      or (tgrelid='public.proyecto_miembros'::regclass and tgname='plan_proteger_tenant_miembro'))) <> 2 then
    raise exception 'Faltan triggers de transición BEFORE INSERT OR UPDATE por fila';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public'
    and table_name in ('proyectos','proyecto_miembros') and column_name='tenant_id'
    and data_type='uuid' and is_nullable='YES') <> 2 then
    raise exception 'Columnas tenant_id incompatibles con fase 1';
  end if;
  if exists(select 1 from public.tenants) or exists(select 1 from public.tenant_miembros)
    or exists(select 1 from public.plataforma_administradores)
    or exists(select 1 from public.proyectos where tenant_id is not null)
    or exists(select 1 from public.proyecto_miembros where tenant_id is not null) then
    raise exception 'Fase 1 dejó de estar vacía: requiere evaluación de fase 2 antes de continuar';
  end if;
end
$$;

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
