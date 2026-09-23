begin;
set local lock_timeout='5s';
-- Preserve collected audit and directory rows. Roll back clients first.
drop trigger if exists plan_audit_orden on public.ordenes;
drop trigger if exists plan_audit_foto on public.fotos;
drop trigger if exists plan_audit_costo on public.orden_costos;
drop trigger if exists plan_audit_conversacion on public.comentarios_ot;
drop trigger if exists plan_audit_estado on public.ot_comentarios;
revoke all on public.plan_ot_eventos,public.plan_eventos_lecturas,public.plan_contratistas from authenticated,anon;
revoke all on function public.plan_agregar_contratista(uuid,text),public.plan_solicitar_exportacion(uuid,text,text,uuid),public.plan_eventos_pagina(uuid,timestamptz,uuid) from authenticated,anon;
commit;
