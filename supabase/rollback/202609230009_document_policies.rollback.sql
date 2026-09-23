-- Reversión segura solo antes de registrar decisiones reales.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if exists(select 1 from public.plan_politica_decisiones) then
    raise exception 'Hay decisiones documentales; conservar el historial y migrar explícitamente';
  end if;
end $$;
drop function public.plan_politica_decidir(uuid,text,text,text,text,text,date,uuid);
drop function public.plan_politicas_listar(uuid);
drop table public.plan_politica_decisiones;
drop table public.plan_politica_modulos;
notify pgrst,'reload schema';
commit;
