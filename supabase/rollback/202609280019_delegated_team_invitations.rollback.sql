begin;

-- Reversion sin borrar invitaciones ni membresias ya emitidas. Deshabilita
-- inmediatamente la capacidad delegada y conserva la auditoria de la prueba.
update public.plan_delegaciones_invitacion set activa=false, updated_at=now();
revoke execute on function public.plan_reservar_invitacion_equipo(uuid,uuid,text) from authenticated;
revoke execute on function public.plan_configurar_delegacion_invitacion(uuid,text,smallint,boolean) from authenticated;

notify pgrst, 'reload schema';
commit;
