begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

drop policy if exists dashboard_own on public.dashboard_configs;
create policy dashboard_user_read on public.dashboard_configs
for select to authenticated using (user_id = auth.uid() or public.plan_es_creador());
create policy dashboard_creator_insert on public.dashboard_configs
for insert to authenticated with check (public.plan_es_creador());
create policy dashboard_creator_update on public.dashboard_configs
for update to authenticated using (public.plan_es_creador()) with check (public.plan_es_creador());

create function public.plan_usuarios_dashboard()
returns table(user_id uuid, email text, nombre text)
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Solo el Creador puede configurar indicadores' using errcode = '42501';
  end if;
  return query select u.id, u.email::text,
    coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'nombre', u.raw_user_meta_data->>'apellidos')), ''), u.email::text)
  from auth.users u order by u.email;
end $$;

revoke all on function public.plan_usuarios_dashboard() from public, anon, authenticated;
grant execute on function public.plan_usuarios_dashboard() to authenticated;
notify pgrst, 'reload schema';
commit;
