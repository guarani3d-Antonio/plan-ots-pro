begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function public.plan_busqueda_normalizar(p_texto text) returns text
language sql immutable parallel safe set search_path=pg_catalog,pg_temp as $$
 select btrim(regexp_replace(translate(lower(coalesce(p_texto,'')),'áàâäãåéèêëíìîïóòôöõúùûüñç','aaaaaaeeeeiiiiooooouuuunc'),'[̀-ͯ]','','g'));
$$;

-- Suggestions contain at most 20 summaries; no permission matrices are loaded.
create function public.plan_equipo_buscar(p_tenant uuid,p_texto text,p_limite integer default 20) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare creator boolean:=public.plan_es_creador();result jsonb;words text[];
begin
 if auth.uid() is null or not creator and not public.plan_tiene_permiso('equipo.ver',p_tenant) then raise exception 'Sin acceso al equipo' using errcode='42501';end if;
 if length(coalesce(p_texto,''))>500 then raise exception 'Búsqueda demasiado larga' using errcode='22023';end if;
 words:=regexp_split_to_array(public.plan_busqueda_normalizar(p_texto),'\s+');
 with recursive ancestors as (
  select user_id,superior_id,1 depth from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=auth.uid()
  union all select n.user_id,n.superior_id,a.depth+1 from public.plan_equipo_nodos n join ancestors a on n.user_id=a.superior_id where n.tenant_id=p_tenant and a.depth<16
 ), descendants as (
  select user_id,1 depth from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=auth.uid()
  union all select n.user_id,d.depth+1 from public.plan_equipo_nodos n join descendants d on n.superior_id=d.user_id where n.tenant_id=p_tenant and d.depth<16
 ), visible as (select user_id from ancestors union select user_id from descendants), candidates as (
  select n.user_id id,coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email) nombre,u.email,n.perfil,m.activo,n.cargo
  from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id) join auth.users u on u.id=n.user_id
  where n.tenant_id=p_tenant and not exists(select 1 from public.plataforma_administradores where user_id=n.user_id)
  and (creator or n.user_id in(select user_id from visible))
 ), matches as (
  select id,nombre,email,perfil,activo from candidates c where not exists(select 1 from unnest(words) word where position(word in public.plan_busqueda_normalizar(concat_ws(' ',c.nombre,c.email,c.perfil,c.cargo)))=0)
  order by public.plan_busqueda_normalizar(nombre),id limit greatest(1,least(coalesce(p_limite,20),20))
 ) select coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb) into result from matches;
 return result;
end $$;

-- Load the chosen person and their ancestors only. Existing visibility and
-- delegation rules apply; platform accounts remain hidden from company users.
create function public.plan_equipo_persona(p_tenant uuid,p_usuario uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.plan_es_creador() and not public.plan_tiene_permiso('equipo.ver',p_tenant) then raise exception 'Sin acceso al equipo' using errcode='42501';end if;
 if not exists(select 1 from public.plan_equipo_nodos n where n.tenant_id=p_tenant and n.user_id=p_usuario
  and not exists(select 1 from public.plataforma_administradores where user_id=p_usuario)
  and (public.plan_es_creador() or p_usuario=auth.uid() or public.plan_equipo_descendiente(p_tenant,p_usuario,auth.uid()) or public.plan_equipo_descendiente(p_tenant,auth.uid(),p_usuario))) then raise exception 'Persona ajena o inexistente' using errcode='42501';end if;
 with recursive ancestors as (
  select user_id,superior_id,1 depth from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=p_usuario
  union all select n.user_id,n.superior_id,a.depth+1 from public.plan_equipo_nodos n join ancestors a on n.user_id=a.superior_id where n.tenant_id=p_tenant and a.depth<16
 ) select jsonb_build_object('usuarios',coalesce(jsonb_agg(jsonb_build_object(
  'id',n.user_id,'nombre',coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email),
  'email',u.email,'avatar_path',u.raw_user_meta_data->>'avatar_path','superior_id',n.superior_id,'perfil',n.perfil,'cargo',n.cargo,'activo',m.activo,'revision',n.revision,
  'cupos_tecnicos',n.cupos_tecnicos,'cupos_ayudantes',n.cupos_ayudantes,'editable',public.plan_equipo_puede_gestionar(p_tenant,n.user_id,'equipo.editar'),
  'obras',coalesce((select jsonb_agg(p.id order by p.id) from public.proyecto_miembros pm join public.proyectos p on p.id=pm.proyecto_id where pm.user_id=n.user_id and p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null),'[]'::jsonb),
  'permisos',(select jsonb_agg(jsonb_build_object('clave',c.clave,'permitido',coalesce(g.permitido,false),'delegable',coalesce(g.delegable,false),'efectivo',public.plan_equipo_permiso_usuario(p_tenant,n.user_id,c.clave),'editable',public.plan_es_creador() or public.plan_equipo_permiso_usuario(p_tenant,auth.uid(),c.clave,true)) order by c.clave) from public.plan_permiso_catalogo c left join public.plan_equipo_permisos g on g.tenant_id=p_tenant and g.user_id=n.user_id and g.clave=c.clave)
 ) order by a.depth),'[]'::jsonb),'obras','[]'::jsonb,'invitaciones','[]'::jsonb,'puede_invitar',false) into result
 from ancestors a join public.plan_equipo_nodos n on n.tenant_id=p_tenant and n.user_id=a.user_id join public.tenant_miembros m on m.tenant_id=n.tenant_id and m.user_id=n.user_id join auth.users u on u.id=n.user_id
 where not exists(select 1 from public.plataforma_administradores where user_id=n.user_id);
 return result;
end $$;
revoke all on function public.plan_busqueda_normalizar(text),public.plan_equipo_buscar(uuid,text,integer),public.plan_equipo_persona(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_equipo_buscar(uuid,text,integer),public.plan_equipo_persona(uuid,uuid) to authenticated;

create or replace function public.plan_equipo_matriz_guardar(p_tenant uuid,p_cambios jsonb) returns jsonb
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
 if cardinality(ids)=1 then return public.plan_equipo_persona(p_tenant,ids[1]);end if;
 return public.plan_equipo_listar(p_tenant);
end $$;
revoke all on function public.plan_equipo_matriz_guardar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_equipo_matriz_guardar(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
