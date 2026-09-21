select jsonb_build_object(
 'owner',(select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plan_restaurar_version'),
 'acl',(select p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plan_restaurar_version'),
 'config',(select p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plan_restaurar_version'),
 'anon_execute',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='plan_restaurar_version' and has_function_privilege('anon',p.oid,'execute'))
);
