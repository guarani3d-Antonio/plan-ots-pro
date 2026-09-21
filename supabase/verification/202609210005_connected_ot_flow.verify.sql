select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('plan_crear_orden','plan_cambiar_estado_orden','plan_cancelar_orden_nueva')),
 'anon_execute',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('plan_crear_orden','plan_cambiar_estado_orden','plan_cancelar_orden_nueva') and has_function_privilege('anon',p.oid,'execute')),
 'unique_index_valid',(select i.indisunique and i.indisvalid from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ordenes_proyecto_ot_activa_uidx'),
 'active_ot_duplicates',(select count(*) from (select proyecto_id,ot from public.ordenes where deleted_at is null group by proyecto_id,ot having count(*)>1)d)
);
