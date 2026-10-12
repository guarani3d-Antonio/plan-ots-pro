-- Reuse the account identity already used by OT assignment. Test accounts
-- without profile names remain distinguishable; only the Creador can list them.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.plan_reclamo_tecnicos(p_obra uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.user_id,'nombre',r.nombre,'detalle',r.rol) order by r.nombre,r.user_id),'[]')
 from public.plan_responsables_proyecto(p_obra) r);
end$$;
notify pgrst,'reload schema';
commit;
