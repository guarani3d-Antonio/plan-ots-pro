begin;
set local lock_timeout='5s';
alter table public.plan_respaldo_config add column motor_en timestamptz;

create function public.plan_respaldo_latido() returns void
language sql security definer set search_path=pg_catalog,pg_temp as $$
 update public.plan_respaldo_config set motor_en=now() where id
$$;

-- A connection probe alone is not evidence of a working recovery system.
create function public.plan_respaldo_listo(p_tenant uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.plan_respaldo_config c where c.id
   and c.destino='r2_verificado' and c.motor_en>now()-interval '2 hours'
   and c.activo
   and exists(select 1 from public.plan_respaldos b where b.estado='creada'
     and (b.tenant_id is null or b.tenant_id=p_tenant)
     and b.corte_en>now()-make_interval(hours=>c.intervalo_horas*2)
     and b.recuperacion_en is not null)
   and not exists(select 1 from public.plan_respaldos b where
     (b.tenant_id is null or b.tenant_id=p_tenant) and b.estado in ('error','incompleta')
     and b.creado_en>(select max(x.creado_en) from public.plan_respaldos x
       where x.estado='creada' and x.recuperacion_en is not null
       and (x.tenant_id is null or x.tenant_id=p_tenant))))
$$;

create function public.plan_respaldo_estado(p_tenant uuid) returns jsonb
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
     and exists(select 1 from public.plan_respaldos where estado='creada'
       and tenant_id is null and corte_en>now()-interval '48 hours' and recuperacion_en is not null),
   'copia_en',b.corte_en,'recuperacion_en',b.recuperacion_en);
end$$;

create or replace function public.plan_respaldo_programar(p_activo boolean,p_horas integer) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_activo is null or p_horas is null or p_horas not in (6,12,24) then raise exception 'Frecuencia inválida' using errcode='22023';end if;
 if p_activo and not exists(select 1 from public.plan_respaldo_config c where c.id
   and c.destino='r2_verificado' and c.motor_en>now()-interval '2 hours') then
   raise exception 'Conectá R2 y comprobá que el motor esté disponible' using errcode='22023';end if;
 if p_activo and not exists(select 1 from public.plan_respaldos where estado='creada'
   and tenant_id is null and corte_en>now()-interval '48 hours' and recuperacion_en is not null) then
   raise exception 'Primero creá y recuperá una copia de plataforma en el laboratorio aislado' using errcode='22023';end if;
 update public.plan_respaldo_config set activo=p_activo,intervalo_horas=p_horas,
   siguiente_en=case when p_activo then now()+make_interval(hours=>p_horas) else null end,
   actualizado_en=now() where id;
end$$;

revoke all on function public.plan_respaldo_latido(),public.plan_respaldo_listo(uuid),public.plan_respaldo_estado(uuid) from public,anon,authenticated;
grant execute on function public.plan_respaldo_latido(),public.plan_respaldo_listo(uuid) to service_role;
grant execute on function public.plan_respaldo_estado(uuid) to authenticated;
commit;
