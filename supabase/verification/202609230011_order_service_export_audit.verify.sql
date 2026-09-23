-- Comprobar que acepta orden_servicio y conserva ficha durante la transición.
select position('orden_servicio' in pg_get_functiondef('public.plan_solicitar_exportacion(uuid,text,text,uuid)'::regprocedure)) > 0 as admite_orden_servicio;
