begin;
set local lock_timeout='5s';

-- A failed or untested later rehearsal must not inherit an older success.
create function public.plan_respaldo_recuperacion_vigente(p_tenant uuid,p_horas integer) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select coalesce((select b.estado='creada' and b.integridad_en is not null
   and b.recuperacion_en is not null and b.corte_en>now()-make_interval(hours=>p_horas)
   from public.plan_respaldos b
   where (b.tenant_id is null or b.tenant_id=p_tenant)
     and b.estado in ('creada','error','incompleta')
   order by coalesce(b.terminado_en,b.creado_en) desc,b.creado_en desc,b.id desc limit 1),false)
$$;

create or replace function public.plan_respaldo_listo(p_tenant uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.plan_respaldo_config c where c.id
   and c.destino='r2_verificado' and c.motor_en>now()-interval '2 hours'
   and c.activo and public.plan_respaldo_recuperacion_vigente(p_tenant,c.intervalo_horas*2))
$$;

create or replace function public.plan_respaldo_estado(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare c public.plan_respaldo_config; b public.plan_respaldos;begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into c from public.plan_respaldo_config where id;
 select * into b from public.plan_respaldos where estado='creada'
   and (tenant_id is null or tenant_id=p_tenant) order by corte_en desc limit 1;
 return jsonb_build_object('destino',c.destino,'motor_en',c.motor_en,
   'motor_disponible',coalesce(c.motor_en>now()-interval '2 hours',false),
   'automatico',c.activo,'listo_para_piloto',public.plan_respaldo_listo(p_tenant),
   'puede_programar',coalesce(c.destino='r2_verificado' and c.motor_en>now()-interval '2 hours',false)
     and public.plan_respaldo_recuperacion_vigente(null,48),
   'copia_en',b.corte_en,'recuperacion_en',b.recuperacion_en);
end$$;

create or replace function public.plan_respaldo_programar(p_activo boolean,p_horas integer) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_activo is null or p_horas is null or p_horas not in (6,12,24) then raise exception 'Frecuencia inválida' using errcode='22023';end if;
 if p_activo and not exists(select 1 from public.plan_respaldo_config c where c.id
   and c.destino='r2_verificado' and c.motor_en>now()-interval '2 hours') then
   raise exception 'Conectá R2 y comprobá que el motor esté disponible' using errcode='22023';end if;
 if p_activo and not public.plan_respaldo_recuperacion_vigente(null,48) then
   raise exception 'Primero creá y recuperá la última copia de plataforma en el laboratorio aislado' using errcode='22023';end if;
 update public.plan_respaldo_config set activo=p_activo,intervalo_horas=p_horas,
   siguiente_en=case when p_activo then now()+make_interval(hours=>p_horas) else null end,
   actualizado_en=now() where id;
end$$;

revoke all on function public.plan_respaldo_recuperacion_vigente(uuid,integer) from public,anon,authenticated;
grant execute on function public.plan_respaldo_recuperacion_vigente(uuid,integer) to service_role;
commit;
