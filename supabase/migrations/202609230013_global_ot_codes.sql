begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

do $$ begin
  if current_user <> 'postgres' then raise exception 'Requiere postgres'; end if;
end $$;

create sequence public.plan_ot_codigo_seq;
revoke all on sequence public.plan_ot_codigo_seq from public, anon, authenticated;

-- Keep an auditable mapping before renumbering legacy duplicates.
create table public.plan_ot_codigo_migracion (
  orden_id uuid primary key,
  proyecto_id uuid not null,
  codigo_anterior text not null,
  codigo_nuevo text,
  migrado_en timestamptz not null default now()
);
revoke all on public.plan_ot_codigo_migracion from public, anon, authenticated;
alter table public.plan_ot_codigo_migracion enable row level security;
insert into public.plan_ot_codigo_migracion (orden_id, proyecto_id, codigo_anterior)
select id, proyecto_id, ot from public.ordenes;

-- Keep existing codes where possible. Seed beyond every numeric suffix so that
-- new assignments never reuse a historical or soft-deleted code.
do $$ declare v_max bigint; begin
  select coalesce(max(substring(ot from 4)::bigint), 0) into v_max
  from public.ordenes where ot ~* '^OT-[0-9]+$';
  perform setval('public.plan_ot_codigo_seq'::regclass, greatest(v_max, 1), v_max > 0);
end $$;

-- Legacy imports may have repeated a code in different projects. Preserve the
-- oldest assignment and give each later occurrence a fresh global code.
with repetidas as (
  select id, row_number() over (partition by lower(ot) order by created_at, id) as n
  from public.ordenes
), nuevos as materialized (
  select id, nextval('public.plan_ot_codigo_seq'::regclass) as numero
  from repetidas where n > 1
)
update public.ordenes o
set ot = 'OT-' || lpad(n.numero::text, greatest(6, length(n.numero::text)), '0')
from nuevos n where n.id = o.id;

update public.plan_ot_codigo_migracion m
set codigo_nuevo = o.ot from public.ordenes o where o.id = m.orden_id;

create unique index ordenes_ot_global_uidx on public.ordenes (lower(ot));

create function public.plan_ot_codigo_guardar()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_numero bigint;
begin
  if tg_op = 'INSERT' then
    -- Applies to RPC creation and direct authenticated imports alike.
    if auth.uid() is not null then
      v_numero := nextval('public.plan_ot_codigo_seq'::regclass);
      new.ot := 'OT-' || lpad(v_numero::text, greatest(6, length(v_numero::text)), '0');
    end if;
  elsif new.ot is distinct from old.ot and auth.uid() is not null then
    raise exception 'El código OT es único y no se puede modificar' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.plan_ot_codigo_guardar() from public, anon, authenticated;
create trigger plan_ot_codigo_guardar before insert or update on public.ordenes
for each row execute function public.plan_ot_codigo_guardar();


commit;
