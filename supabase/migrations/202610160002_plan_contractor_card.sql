begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Extend the existing OT-scoped creation, retaining permissions, tenant derivation,
-- duplicate protection and idempotency. Five-field clients remain compatible.
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_contratista_crear_desde_plan(uuid,jsonb,uuid)'::regprocedure);
 if position('''nombre'',''identificacion'',''especialidad'',''telefono'',''correo''' in src)=0
 or position('contratista_id,tenant_id,identificacion,telefono,correo,activo' in src)=0 then
  raise exception 'Definición de alta desde plan inesperada';
 end if;
 src:=replace(src,'''nombre'',''identificacion'',''especialidad'',''telefono'',''correo''','''nombre'',''identificacion'',''especialidad'',''telefono'',''correo'',''contacto'',''direccion''');
 src:=replace(src,'length(kv.value#>>''{}'')>254','length(kv.value#>>''{}'')>(case when kv.key=''direccion'' then 500 when kv.key=''contacto'' then 160 else 254 end)');
 src:=replace(src,'contratista_id,tenant_id,identificacion,telefono,correo,activo','contratista_id,tenant_id,identificacion,contacto,telefono,correo,direccion,activo');
 src:=replace(src,'nullif(btrim(p_datos->>''identificacion''),''''),nullif(btrim(p_datos->>''telefono''),'''')','nullif(btrim(p_datos->>''identificacion''),''''),nullif(btrim(p_datos->>''contacto''),''''),nullif(btrim(p_datos->>''telefono''),'''')');
 src:=replace(src,'nullif(btrim(p_datos->>''correo''),''''),true);','nullif(btrim(p_datos->>''correo''),''''),nullif(btrim(p_datos->>''direccion''),''''),true);');
 execute src;
end $$;
commit;
