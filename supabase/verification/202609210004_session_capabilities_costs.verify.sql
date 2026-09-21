select jsonb_build_object(
 'checked_at',now(),
 'public_cost_values',(select count(*) from public.ordenes where costo is not null),
 'private_cost_rows',(select count(*) from public.orden_costos),
 'private_costs_rls',(select relrowsecurity from pg_class where oid='public.orden_costos'::regclass),
 'client_cost_write',has_table_privilege('authenticated','public.orden_costos','INSERT,UPDATE,DELETE'),
 'anonymous_cost_read',has_table_privilege('anon','public.orden_costos','SELECT'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('orden_costos','versiones','ordenes_eliminadas')),
 'rpc',(select jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('plan_contexto_acceso','plan_admin_empresa','plan_admin_miembro','plan_admin_obra_miembro','plan_separar_costo')),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public) order by id) from storage.buckets where id in ('planos','fotos','exports')),
 'storage_objects',(select count(*) from storage.objects),
 'costs_in_realtime',(select count(*) from pg_publication_tables where schemaname='public' and tablename='orden_costos')
) as day6_verification;
