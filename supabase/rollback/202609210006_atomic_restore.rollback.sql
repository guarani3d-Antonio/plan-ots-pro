begin;
drop function if exists public.plan_restaurar_version(uuid,uuid);
notify pgrst,'reload schema';
commit;
