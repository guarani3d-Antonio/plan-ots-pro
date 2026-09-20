begin transaction read only;
select jsonb_build_object(
'captured_at',now(),'database',current_database(),'server_version',version(),
'relations',(select jsonb_agg(to_jsonb(t)) from (select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,c.relacl,pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')) t),
'columns',(select jsonb_agg(to_jsonb(t)) from (select table_name,column_name,ordinal_position,udt_schema,udt_name,is_nullable,column_default,is_identity,identity_generation from information_schema.columns where table_schema='public') t),
'constraints',(select jsonb_agg(to_jsonb(t)) from (select c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') t),
'policies',(select jsonb_agg(to_jsonb(t)) from (select * from pg_policies where schemaname in ('public','storage')) t),
'indexes',(select jsonb_agg(to_jsonb(t)) from (select * from pg_indexes where schemaname='public') t),
'functions',(select jsonb_agg(to_jsonb(t)) from (select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition,p.proacl,p.proconfig,pg_get_userbyid(p.proowner) as owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') t),
'triggers',(select jsonb_agg(to_jsonb(t)) from (select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) t),
'views',(select jsonb_agg(to_jsonb(t)) from (select c.relname,pg_get_viewdef(c.oid,true) as definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')) t),
'grants',(select jsonb_agg(to_jsonb(t)) from (select * from information_schema.role_table_grants where table_schema in ('public','storage')) t),
'column_grants',(select jsonb_agg(to_jsonb(t)) from (select * from information_schema.column_privileges where table_schema='public') t),
'default_acl',(select jsonb_agg(to_jsonb(t)) from (select pg_get_userbyid(d.defaclrole) as owner,n.nspname,d.defaclobjtype,d.defaclacl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace) t),
'buckets',(select jsonb_agg(to_jsonb(t)) from (select id,name,public,file_size_limit,allowed_mime_types from storage.buckets) t),
'publications',(select jsonb_agg(to_jsonb(t)) from pg_publication_tables t)
) as schema_baseline;
rollback;
