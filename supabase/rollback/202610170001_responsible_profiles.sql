begin;
-- Revert deployment first. Preserve professional cards and their audit history.
revoke all on function public.plan_responsables_cuentas(uuid),public.plan_responsables_directorio(uuid),public.plan_responsable_perfil(uuid,uuid,date,date,integer,text,uuid),public.plan_responsable_guardar(uuid,uuid,bigint,jsonb) from authenticated;
-- No existing functions, roles, grants or records were replaced by this migration.
notify pgrst,'reload schema';
commit;
