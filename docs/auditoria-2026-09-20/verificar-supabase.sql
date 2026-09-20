-- Auditoría defensiva SOLO LECTURA. No ejecutado por esta auditoría.
-- Ejecutar por un administrador en el proyecto correcto. No exporta filas de clientes.
-- La salida contiene arquitectura/políticas internas: conservar de forma privada.
begin transaction read only;

select current_database() as base, current_user as ejecutor, now() as fecha;

-- Tablas, vistas, RLS y replica identity (d=default, f=full).
select n.nspname as esquema, c.relname as objeto, c.relkind,
       c.relrowsecurity, c.relforcerowsecurity, c.relreplident, c.reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m')
order by 1,2;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;

select table_schema,table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage') and grantee in ('anon','authenticated','PUBLIC')
order by 1,2,3,4;

select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
order by table_name,ordinal_position;

select n.nspname,c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid) as definicion
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
order by 1,2,3;

select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname in ('public','storage') order by 1,2,3;

select event_object_schema,event_object_table,trigger_name,action_timing,event_manipulation,action_statement
from information_schema.triggers where event_object_schema='public'
order by 1,2,3;

-- Metadatos de funciones, sin volcar cuerpos que pudieran contener secretos.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as ejecutable_anon,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as ejecutable_authenticated
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 1,2;

select pubname,schemaname,tablename from pg_publication_tables order by 1,2,3;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id;

rollback;
-- Complementar desde Dashboard: Auth/SMTP/redirects, usuarios de prueba A/B,
-- backups y restore ensayado, cuotas/API max rows, dominios/headers de hosting.
-- Esta consulta NO demuestra por sí sola aislamiento ni recuperabilidad:
-- hacen falta pruebas allow/deny con sesiones de prueba y un restore en staging.
