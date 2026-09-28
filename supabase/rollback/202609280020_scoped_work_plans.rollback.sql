begin;
-- Reversión segura: deshabilita la creación de planos hijos sin perder planos,
-- OTs ni asignaciones existentes. Mantiene la restricción de creación de obras
-- principales; restaurar el binario anterior de la app junto con este script.
revoke execute on function public.plan_crear_plano_en_obra(uuid,text) from authenticated;
revoke execute on function public.plan_reservar_invitacion_equipo(uuid,uuid,text) from authenticated;
notify pgrst,'reload schema';
commit;
