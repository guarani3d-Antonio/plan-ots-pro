begin;
set local lock_timeout='5s';

-- The worker must recheck the pilot under the same configuration lock used by
-- the original claimant. A lightweight preflight alone cannot enforce a cap.
create function public.plan_respaldo_tomar_piloto(p_inicio timestamptz,p_fin timestamptz,p_max integer)
returns public.plan_respaldos language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare c public.plan_respaldo_config;begin
 select * into c from public.plan_respaldo_config where id for update;
 if not c.activo then return public.plan_respaldo_tomar();end if;
 if p_inicio is null or p_fin is null or p_max is null or p_max not between 1 and 3
   or p_fin<=p_inicio or p_fin-p_inicio>interval '72 hours' then
   raise exception 'El piloto automático requiere fecha de fin y máximo de copias válidos' using errcode='22023';
 end if;
 if now()<p_inicio or now()>=p_fin then return null;end if;
 if (select count(*) from public.plan_respaldos where solicitado_por is null
   and tenant_id is null and creado_en>=p_inicio)>=p_max then return null;end if;
 return public.plan_respaldo_tomar();
end$$;
revoke all on function public.plan_respaldo_tomar_piloto(timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.plan_respaldo_tomar_piloto(timestamptz,timestamptz,integer) to service_role;
commit;
