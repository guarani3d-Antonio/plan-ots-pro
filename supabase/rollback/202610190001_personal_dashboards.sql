-- Solo para revertir antes de usar la funcionalidad. Si hay preferencias,
-- conservar una exportación de plan_dashboards_personales antes de ejecutarlo.
begin;
drop function if exists public.plan_guardar_dashboards_personales(jsonb,integer);
-- Conservar la tabla y sus preferencias; no borrar datos durante la reversión.
revoke all on public.plan_dashboards_personales from authenticated;
commit;
