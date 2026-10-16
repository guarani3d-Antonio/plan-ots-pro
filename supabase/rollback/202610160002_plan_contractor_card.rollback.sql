begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Revert behavior only; keep every created contractor and recorded value.
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_contratista_crear_desde_plan(uuid,jsonb,uuid)'::regprocedure);
 src:=replace(src,'''nombre'',''identificacion'',''especialidad'',''telefono'',''correo'',''contacto'',''direccion''','''nombre'',''identificacion'',''especialidad'',''telefono'',''correo''');
 src:=replace(src,'length(kv.value#>>''{}'')>(case when kv.key=''direccion'' then 500 when kv.key=''contacto'' then 160 else 254 end)','length(kv.value#>>''{}'')>254');
 src:=replace(src,'contratista_id,tenant_id,identificacion,contacto,telefono,correo,direccion,activo','contratista_id,tenant_id,identificacion,telefono,correo,activo');
 src:=replace(src,'nullif(btrim(p_datos->>''identificacion''),''''),nullif(btrim(p_datos->>''contacto''),''''),nullif(btrim(p_datos->>''telefono''),'''')','nullif(btrim(p_datos->>''identificacion''),''''),nullif(btrim(p_datos->>''telefono''),'''')');
 src:=replace(src,'nullif(btrim(p_datos->>''correo''),''''),nullif(btrim(p_datos->>''direccion''),''''),true);','nullif(btrim(p_datos->>''correo''),''''),true);');
 execute src;
end $$;
commit;
