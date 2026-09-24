begin;
drop function if exists public.plan_usuarios_dashboard();
drop policy if exists dashboard_user_read on public.dashboard_configs;
drop policy if exists dashboard_creator_insert on public.dashboard_configs;
drop policy if exists dashboard_creator_update on public.dashboard_configs;
create policy dashboard_own on public.dashboard_configs for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());
commit;
