-- Resultado esperado: seis módulos, RLS activo y sin escritura directa del cliente.
select count(*) as modulos from public.plan_politica_modulos;
select relname,relrowsecurity from pg_class where relname in ('plan_politica_modulos','plan_politica_decisiones');
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('plan_politica_modulos','plan_politica_decisiones')
and grantee in ('anon','authenticated');
select proname,has_function_privilege('anon',oid,'EXECUTE') as anon_ejecuta,
has_function_privilege('authenticated',oid,'EXECUTE') as usuario_ejecuta
from pg_proc where pronamespace='public'::regnamespace
and proname in ('plan_politicas_listar','plan_politica_decidir');
