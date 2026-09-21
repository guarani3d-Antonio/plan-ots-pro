begin;
drop index if exists public.ordenes_proyecto_ot_activa_uidx;
drop function if exists public.plan_cancelar_orden_nueva(uuid);
drop function if exists public.plan_cambiar_estado_orden(uuid,timestamptz,text,date,text);
drop function if exists public.plan_crear_orden(uuid,double precision,double precision);
notify pgrst,'reload schema';
commit;
