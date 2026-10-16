-- Revert behavior only. All contractor records, plans, budgets and signatures stay.
begin;
set local lock_timeout='5s';
do $$declare def text;begin
 def:=pg_get_functiondef('public.plan_documento_proteger_campos()'::regprocedure);
 def:=replace(def,E' if d.tipo=''relevamiento'' and nullif(new.datos#>>''{relevamiento,contratacionJSON}'','''') is not null then perform 1 from public.ordenes where id=d.orden_id for update;end if;\n','');
 def:=replace(def,'if d.tipo=''relevamiento'' then if tg_op=''UPDATE'' and nullif(old.datos#>>''{relevamiento,contratacionJSON}'','''') is not null and nullif(new.datos#>>''{relevamiento,contratacionJSON}'','''') is null then raise exception ''El cliente no conservó la contratación del plan. Actualizá la aplicación antes de guardar'' using errcode=''22023'';end if;perform public.plan_validar_contratacion_plan(new.datos,d.orden_id);new.datos:=public.plan_vincular_cronograma_reclamo(new.datos,d.orden_id);new.datos:=public.plan_fuentes_contratacion_actividades(new.datos,d.orden_id);end if;','if d.tipo=''relevamiento'' then new.datos:=public.plan_vincular_cronograma_reclamo(new.datos,d.orden_id);end if;');
 def:=replace(def,'''cronogramaJSON'',''contratacionJSON'',''fechaLimitePrevista''','''cronogramaJSON'',''fechaLimitePrevista''');execute def;
 def:=pg_get_functiondef('public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid)'::regprocedure);
 def:=replace(def,E' perform public.plan_presupuesto_validar_plan(p_orden,p_contratista,p_datos);\n','');
 def:=replace(def,'''documento_revision'',doc.id,''contratacion_id'',p_datos->>''contratacion_id'');','''documento_revision'',doc.id);');
 def:=replace(def,'''id'',doc.id,''version'',doc.borrador_version,''sha256'',doc.contenido_sha256,''codigo'',(select codigo from public.plan_documentos where id=doc.documento_id)','''id'',doc.id,''version'',doc.borrador_version,''sha256'',doc.contenido_sha256');execute def;
 def:=pg_get_functiondef('public.plan_presupuestos_leer(uuid,uuid)'::regprocedure);
 def:=replace(def,',public.plan_presupuestos_planes(o.id) planes','');execute def;
end $$;
drop trigger plan_contratacion_proyectar_ot on public.plan_documento_revisiones;
drop function public.plan_contratacion_proyectar_ot();
drop function public.plan_contratista_crear_desde_plan(uuid,jsonb,uuid);
drop index public.plan_directorio_alta_plan_solicitud;
drop function public.plan_presupuesto_validar_plan(uuid,uuid,jsonb);
drop function public.plan_presupuestos_planes(uuid);
drop function public.plan_fuentes_contratacion_actividades(jsonb,uuid);
drop function public.plan_validar_contratacion_plan(jsonb,uuid);
drop function public.plan_contrataciones_config(jsonb);
notify pgrst,'reload schema';
commit;
