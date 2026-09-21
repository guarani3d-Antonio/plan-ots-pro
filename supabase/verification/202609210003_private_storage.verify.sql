-- Solo lectura. Ejecutar después de cerrar buckets mediante Storage API.
select jsonb_build_object(
  'checked_at',now(),
  'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public) order by id) from storage.buckets where id in ('planos','fotos','exports')),
  'objects_rls',(select relrowsecurity from pg_class where oid='storage.objects'::regclass),
  'policies',(select jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by policyname) from pg_policies where schemaname='storage' and tablename='objects'),
  'legacy_links',(select count(*) from public.plan_archivos_legados),
  'registry_client_write',has_table_privilege('authenticated','public.plan_archivos_legados','INSERT,UPDATE,DELETE'),
  'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'config',p.proconfig,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('plan_storage_path','plan_storage_proyecto','plan_storage_permitido','plan_archivo_de_proyecto','plan_validar_archivos')),
  'binding_triggers',(select count(*) from pg_trigger where tgname='plan_validar_archivos' and tgenabled='O'),
  'storage_counts',(select jsonb_object_agg(bucket_id,total) from (select bucket_id,count(*) total from storage.objects group by bucket_id) c)
) as storage_verification;
