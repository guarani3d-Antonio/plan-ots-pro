begin;
alter table public.plan_asistente_consultas add column provider text, add column model text;
create or replace function public.plan_asistente_reservar(p_user uuid,p_request uuid,p_revision uuid,p_cost bigint)
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
 insert into plan_asistente_consultas(id,user_id,month,reserved_micro,provider,model) values(p_request,p_user,current_month,p_cost,c.provider,c.model);
end $$;
create function public.plan_asistente_consumo(p_user uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with rows as (select * from plan_asistente_consultas where user_id=p_user and month=date_trunc('month',now() at time zone 'America/Asuncion')::date),
 totals as (select count(*) as requests,coalesce(sum(input_tokens),0) as input,coalesce(sum(output_tokens),0) as output,
 count(*) filter(where state='completed' and (input_tokens is null or output_tokens is null)) as unknown_tokens,
 count(*) filter(where state<>'completed') as pending,
 coalesce(sum(charged_micro) filter(where state='completed'),0) as confirmed,
 coalesce(sum(reserved_micro) filter(where state<>'completed'),0) as reserved from rows),
 recent as (select id,created_at,provider,model,state,input_tokens,output_tokens,charged_micro,reserved_micro from rows order by created_at desc,id desc limit 20)
 select jsonb_build_object('month',to_char(now() at time zone 'America/Asuncion','YYYY-MM'),'requests',requests,'inputTokens',input,'outputTokens',output,'unknownTokenRequests',unknown_tokens,'pendingRequests',pending,'confirmedUsd',confirmed/1000000.0,'reservedUsd',reserved/1000000.0,'recent',coalesce((select jsonb_agg(to_jsonb(recent)) from recent),'[]'::jsonb)) from totals;
$$;
revoke all on function public.plan_asistente_consumo(uuid),public.plan_asistente_reservar(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.plan_asistente_consumo(uuid),public.plan_asistente_reservar(uuid,uuid,uuid,bigint) to service_role;
commit;
