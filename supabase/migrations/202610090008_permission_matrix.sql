begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Only permissions change here. Profiles, reporting lines, seats and work
-- scopes are copied from the locked server records, never from the client.
-- Reuse the existing hierarchy/delegation checks and per-person audit trail.
create function public.plan_equipo_matriz_guardar(p_tenant uuid,p_cambios jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare change jsonb;n public.plan_equipo_nodos;m public.tenant_miembros;works jsonb;ids uuid[];
begin
 if auth.uid() is null or not public.plan_es_creador() and not public.plan_tiene_permiso('equipo.permisos',p_tenant) then
  raise exception 'Sin permiso para administrar esta matriz' using errcode='42501';
 end if;
 if jsonb_typeof(p_cambios) is distinct from 'array' or jsonb_array_length(p_cambios) not between 1 and 500 or length(p_cambios::text)>3000000 then
  raise exception 'Matriz inválida' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_cambios) x where jsonb_typeof(x) is distinct from 'object' or x->>'usuario' is null or x->>'revision' is null or jsonb_typeof(x->'permisos') is distinct from 'array') then
  raise exception 'Faltan persona, versión o permisos' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_cambios) x cross join lateral jsonb_object_keys(x) k where k not in ('usuario','revision','permisos')) then
  raise exception 'La matriz solo modifica permisos' using errcode='22023';
 end if;
 select array_agg((x->>'usuario')::uuid) into ids from jsonb_array_elements(p_cambios) x;
 if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Persona repetida en la matriz' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text,721));
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=id)) then
  raise exception 'Persona ajena o inexistente' using errcode='42501';
 end if;
 -- Parents first allows one transaction to enable delegation and grant its
 -- subordinate. Any later failure rolls back every earlier person's changes.
 for change in
  with recursive levels as (
   select user_id,0 depth from public.plan_equipo_nodos where tenant_id=p_tenant and superior_id is null
   union all select child.user_id,l.depth+1 from public.plan_equipo_nodos child join levels l on child.superior_id=l.user_id where child.tenant_id=p_tenant and l.depth<32
  ) select x from jsonb_array_elements(p_cambios) x left join levels l on l.user_id=(x->>'usuario')::uuid order by l.depth nulls last,x->>'usuario'
 loop
  select * into n from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=(change->>'usuario')::uuid for update;
  select * into m from public.tenant_miembros where tenant_id=p_tenant and user_id=n.user_id;
  select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb) into works from public.proyecto_miembros pm join public.proyectos p on p.id=pm.proyecto_id
   where pm.user_id=n.user_id and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null;
  perform public.plan_equipo_guardar(p_tenant,n.user_id,(change->>'revision')::bigint,jsonb_build_object(
   'superior_id',n.superior_id,'perfil',n.perfil,'cargo',n.cargo,'activo',m.activo,
   'cupos_tecnicos',n.cupos_tecnicos,'cupos_ayudantes',n.cupos_ayudantes,'obras',works,'permisos',change->'permisos'));
 end loop;
 return public.plan_equipo_listar(p_tenant);
end $$;
revoke all on function public.plan_equipo_matriz_guardar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_equipo_matriz_guardar(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
