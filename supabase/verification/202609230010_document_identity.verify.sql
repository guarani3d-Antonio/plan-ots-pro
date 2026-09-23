-- Los valores reales se comprueban con usuario de prueba y transacción ROLLBACK.
select relname,relrowsecurity from pg_class
where relname in ('plan_documentos','plan_documento_revisiones');
select conname,contype from pg_constraint
where conrelid in ('public.plan_documentos'::regclass,'public.plan_documento_revisiones'::regclass)
order by conrelid,conname;
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('plan_documentos','plan_documento_revisiones')
and grantee in ('anon','authenticated');
select last_value,is_called from public.plan_documento_folio_seq;
