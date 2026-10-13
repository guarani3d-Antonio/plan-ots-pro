begin;
create table public.plan_asistente_cuentas (
 user_id uuid primary key references auth.users(id) on delete cascade,
 provider text not null check(provider in ('openai','anthropic')), model text not null,
 ciphertext text, iv text, hint text, enabled boolean not null default false,
 budget_micro bigint not null default 5000000 check(budget_micro between 0 and 1000000000),
 month date not null default date_trunc('month',now() at time zone 'America/Asuncion')::date,
 used_micro bigint not null default 0 check(used_micro>=0), revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 check(not enabled or (ciphertext is not null and iv is not null))
);
create table public.plan_asistente_consultas (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 month date not null, reserved_micro bigint not null check(reserved_micro>0),
 charged_micro bigint, input_tokens bigint, output_tokens bigint,
 state text not null default 'reserved' check(state in ('reserved','completed','uncertain')),
 created_at timestamptz not null default now()
);
create index on public.plan_asistente_consultas(user_id,month);
alter table public.plan_asistente_cuentas enable row level security;
alter table public.plan_asistente_consultas enable row level security;
revoke all on public.plan_asistente_cuentas,public.plan_asistente_consultas from public,anon,authenticated;
grant select,insert,update,delete on public.plan_asistente_cuentas,public.plan_asistente_consultas to service_role;

create function public.plan_asistente_configurar(p_user uuid,p_provider text,p_model text,p_ciphertext text,p_iv text,p_hint text,p_budget bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.plan_asistente_cuentas; current_month date:=date_trunc('month',now() at time zone 'America/Asuncion')::date;
begin
 if p_budget<0 or p_budget>1000000000 or p_provider not in ('openai','anthropic') or length(p_model)>120 or p_ciphertext is null or p_iv is null then raise exception 'Configuración inválida';end if;
 select * into c from plan_asistente_cuentas where user_id=p_user for update;
 if found and c.month=current_month and p_budget<c.used_micro then raise exception 'El tope es menor al consumo ya registrado';end if;
 insert into plan_asistente_cuentas(user_id,provider,model,ciphertext,iv,hint,budget_micro,enabled)
 values(p_user,p_provider,p_model,p_ciphertext,p_iv,p_hint,p_budget,true)
 on conflict(user_id) do update set provider=excluded.provider,model=excluded.model,ciphertext=excluded.ciphertext,iv=excluded.iv,hint=excluded.hint,budget_micro=excluded.budget_micro,enabled=true,revision=gen_random_uuid(),updated_at=now();
end $$;
create function public.plan_asistente_reservar(p_user uuid,p_request uuid,p_revision uuid,p_cost bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.plan_asistente_cuentas; current_month date:=date_trunc('month',now() at time zone 'America/Asuncion')::date;
begin
 select * into c from plan_asistente_cuentas where user_id=p_user for update;
 if not found or not c.enabled or c.revision<>p_revision then raise exception 'La conexión cambió o no está activa';end if;
 if p_cost<=0 or p_cost>1000000 then raise exception 'Reserva inválida';end if;
 if exists(select 1 from plan_asistente_consultas where id=p_request) then raise exception 'Esta consulta ya fue recibida. No se reintenta para evitar cobros duplicados';end if;
 if exists(select 1 from plan_asistente_consultas where user_id=p_user and created_at>now()-interval '5 seconds') then raise exception 'Esperá unos segundos antes de otra consulta';end if;
 if c.month<>current_month then c.used_micro:=0;end if;
 if c.used_micro+p_cost>c.budget_micro then raise exception 'Se alcanzó el tope de consumo estimado en Plan-OTs';end if;
 update plan_asistente_cuentas set month=current_month,used_micro=c.used_micro+p_cost where user_id=p_user;
 insert into plan_asistente_consultas(id,user_id,month,reserved_micro) values(p_request,p_user,current_month,p_cost);
end $$;
create function public.plan_asistente_finalizar(p_user uuid,p_request uuid,p_cost bigint,p_input bigint,p_output bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.plan_asistente_consultas; amount bigint;
begin
 -- Account first, then request: same lock order as reservation.
 perform 1 from plan_asistente_cuentas where user_id=p_user for update;
 select * into r from plan_asistente_consultas where id=p_request and user_id=p_user for update;
 if not found or r.state<>'reserved' then return;end if;
 amount:=case when p_cost is null or p_cost<0 then r.reserved_micro else p_cost end;
 update plan_asistente_cuentas set used_micro=greatest(0,used_micro-r.reserved_micro+amount) where user_id=p_user and month=r.month;
 update plan_asistente_consultas set state=case when p_cost is null then 'uncertain' else 'completed' end,charged_micro=amount,input_tokens=p_input,output_tokens=p_output where id=p_request;
end $$;
revoke all on function public.plan_asistente_configurar(uuid,text,text,text,text,text,bigint),public.plan_asistente_reservar(uuid,uuid,uuid,bigint),public.plan_asistente_finalizar(uuid,uuid,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.plan_asistente_configurar(uuid,text,text,text,text,text,bigint),public.plan_asistente_reservar(uuid,uuid,uuid,bigint),public.plan_asistente_finalizar(uuid,uuid,bigint,bigint,bigint) to service_role;
comment on table public.plan_asistente_cuentas is 'Claves personales cifradas. Custodiar ASSISTANT_MASTER_KEY por separado del respaldo. Sin lectura directa desde el cliente.';
commit;
