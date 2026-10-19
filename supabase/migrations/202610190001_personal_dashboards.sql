-- Aditiva. No altera dashboard_configs ni registros operativos.
begin;
create table public.plan_dashboards_personales (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 262144),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.plan_dashboards_personales enable row level security;
create policy dashboard_personal_lectura on public.plan_dashboards_personales
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.plan_dashboards_personales from anon, authenticated;
grant select on public.plan_dashboards_personales to authenticated;

-- No user_id input: la identidad procede exclusivamente de la sesión.
-- Comparación de revisión atómica: una pestaña vieja no pisa una más reciente.
create function public.plan_guardar_dashboards_personales(p_config jsonb, p_revision integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_revision integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_revision is null or p_revision < 0 or p_config is null or jsonb_typeof(p_config) <> 'object'
     or octet_length(p_config::text) > 262144 or p_config->>'version' is distinct from '1'
     or jsonb_typeof(p_config->'boards') is distinct from 'array' then raise exception 'INVALID_DASHBOARD'; end if;
  if jsonb_array_length(p_config->'boards') not between 1 and 20
     or exists (select 1 from jsonb_array_elements(p_config->'boards') b where
       jsonb_typeof(b->'blocks') is distinct from 'array' or length(b->>'name') not between 1 and 80)
     then raise exception 'INVALID_DASHBOARD'; end if;
  if exists (select 1 from jsonb_array_elements(p_config->'boards') b where jsonb_array_length(b->'blocks') > 30)
     then raise exception 'INVALID_DASHBOARD'; end if;
  if p_revision = 0 then
    insert into public.plan_dashboards_personales(user_id, config) values(v_user, p_config)
      on conflict(user_id) do nothing returning revision into v_revision;
  else
    update public.plan_dashboards_personales set config=p_config, revision=revision+1, updated_at=now()
      where user_id=v_user and revision=p_revision returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'DASHBOARD_CONFLICT'; end if;
  return v_revision;
end;
$$;
revoke all on function public.plan_guardar_dashboards_personales(jsonb,integer) from public, anon;
grant execute on function public.plan_guardar_dashboards_personales(jsonb,integer) to authenticated;
commit;
