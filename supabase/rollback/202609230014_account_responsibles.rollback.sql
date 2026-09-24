begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
do $$ begin
  if exists(select 1 from public.ordenes where responsable_id is not null) then
    raise exception 'Hay OTs vinculadas a cuentas; conservar la columna para no perder datos';
  end if;
end $$;
drop trigger if exists plan_validar_responsable_cuenta on public.ordenes;
drop function if exists public.plan_validar_responsable_cuenta();
drop function if exists public.plan_responsables_proyecto(uuid);
alter table public.ordenes drop column if exists responsable_id;
commit;
