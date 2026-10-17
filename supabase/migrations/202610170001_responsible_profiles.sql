begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Professional information is tenant-scoped. Authentication and saved documents
-- are never rewritten. Existing OT identities remain the source of attribution.
create table public.plan_responsables_fichas(
 tenant_id uuid not null,user_id uuid not null,datos jsonb not null default '{}',
 revision bigint not null default 1,creada_en timestamptz not null default now(),
 actualizada_en timestamptz not null default now(),actualizada_por uuid references auth.users,
 primary key(tenant_id,user_id),
 foreign key(tenant_id,user_id) references public.tenant_miembros(tenant_id,user_id),
 check(jsonb_typeof(datos)='object' and length(datos::text)<=8000)
);
alter table public.plan_responsables_fichas enable row level security;
revoke all on public.plan_responsables_fichas from public,anon,authenticated;

create function public.plan_responsable_visible(p_tenant uuid,p_usuario uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and exists(
  select 1 from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id)
  where n.tenant_id=p_tenant and n.user_id=p_usuario
  and not exists(select 1 from public.plataforma_administradores a where a.user_id=n.user_id)
  and (public.plan_es_creador() or public.plan_tiene_permiso('equipo.ver',p_tenant)
   and (n.user_id=auth.uid() or public.plan_equipo_descendiente(p_tenant,n.user_id,auth.uid())
    or public.plan_equipo_descendiente(p_tenant,auth.uid(),n.user_id))))
$$;

create function public.plan_responsable_historial_base(p_tenant uuid,p_usuario uuid default null,p_desde date default null,p_hasta date default null,p_obra uuid default null)
returns table(id uuid,responsable_id uuid,ot text,proyecto_id uuid,obra_id uuid,obra text,descripcion text,rubro text,estado text,prioridad text,responsable text,ubicacion text,recepcion date,inicio date,fin date,previsto date)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select o.id,o.responsable_id,o.ot,p.id,w.id,w.nombre,o.descripcion,o.rubro,o.estado,o.prioridad,o.responsable,o.ubicacion,
 coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date),o.fecha_inicio_trabajos,o.fecha_fin_trabajos,o.fecha_limite
 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=p_tenant and w.deleted_at is null
 where o.deleted_at is null and p.deleted_at is null and public.plan_permiso_proyecto('ot.ver',p.id)
 and o.responsable_id is not null and public.plan_responsable_visible(p_tenant,o.responsable_id)
 and (p_usuario is null or o.responsable_id=p_usuario) and (p_obra is null or w.id=p_obra)
 and (p_desde is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)>=p_desde)
 and (p_hasta is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)<=p_hasta)
$$;

-- Only accounts already visible in Equipo can be linked. Linking a professional
-- card grants no membership, work access, invitations or account permissions.
create function public.plan_responsables_cuentas(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('equipo.ver',p_tenant)) then raise exception 'Sin acceso a los responsables de esta empresa' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.user_id,'nombre',coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email),'email',u.email) order by u.email),'[]') into result
 from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id) join auth.users u on u.id=n.user_id
 where n.tenant_id=p_tenant and n.perfil in ('jefe','tecnico') and m.activo
 and public.plan_responsable_visible(p_tenant,n.user_id)
 and public.plan_equipo_puede_gestionar(p_tenant,n.user_id,'equipo.editar')
 and not exists(select 1 from public.plan_responsables_fichas f where f.tenant_id=p_tenant and f.user_id=n.user_id)
 and not exists(select 1 from public.plan_responsable_historial_base(p_tenant,n.user_id));
 return result;
end $$;

create function public.plan_responsables_directorio(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;sin_cuenta integer;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('equipo.ver',p_tenant)) then raise exception 'Sin acceso a los responsables de esta empresa' using errcode='42501';end if;
 if not exists(select 1 from public.tenants where id=p_tenant) then raise exception 'Empresa inexistente' using errcode='22023';end if;
 select count(*) into sin_cuenta from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 where o.deleted_at is null and p.deleted_at is null and o.responsable_id is null and nullif(btrim(o.responsable),'') is not null and public.plan_permiso_proyecto('ot.ver',p.id);
 with historial as materialized(select * from public.plan_responsable_historial_base(p_tenant)),
 counts as(select responsable_id,count(*) total,count(*) filter(where estado in ('Pendiente','En proceso')) abiertas,count(*) filter(where estado='Cerrada') cerradas from historial group by 1)
 select jsonb_build_object('responsables',coalesce(jsonb_agg(jsonb_build_object(
  'id',n.user_id,'nombre',coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email),
  'email',u.email,'avatar_path',u.raw_user_meta_data->>'avatar_path','activo',m.activo,'cargo',n.cargo,
  'datos',coalesce(f.datos,'{}'),'revision',coalesce(f.revision,0),'vinculada_en',m.created_at,
  'editable',public.plan_equipo_puede_gestionar(p_tenant,n.user_id,'equipo.editar'),
  'obras',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'nombre',x.nombre) order by x.nombre) from (
   select distinct w.id,w.nombre from public.proyecto_miembros pm join public.proyectos p on p.id=pm.proyecto_id and p.tenant_id=p_tenant
   join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=p_tenant and w.deleted_at is null
   where pm.user_id=n.user_id and p.deleted_at is null and public.plan_permiso_proyecto('proyecto.ver',p.id)
   union select h.obra_id,h.obra from historial h where h.responsable_id=n.user_id
  )x),'[]'),
  'indicadores',jsonb_build_object('total',coalesce(c.total,0),'abiertas',coalesce(c.abiertas,0),'cerradas',coalesce(c.cerradas,0))
 ) order by coalesce(u.raw_user_meta_data->>'nombre',u.email),n.user_id),'[]'),'sinCuenta',sin_cuenta) into result
 from public.plan_equipo_nodos n join public.tenant_miembros m using(tenant_id,user_id) join auth.users u on u.id=n.user_id
 left join public.plan_responsables_fichas f on f.tenant_id=n.tenant_id and f.user_id=n.user_id
 left join counts c on c.responsable_id=n.user_id
 where n.tenant_id=p_tenant and public.plan_responsable_visible(p_tenant,n.user_id)
 and (f.user_id is not null or c.responsable_id is not null);
 return result;
end $$;

create function public.plan_responsable_perfil(p_tenant uuid,p_usuario uuid,p_desde date default null,p_hasta date default null,p_pagina integer default 0,p_estado text default null,p_obra uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;hoy date:=(now() at time zone 'America/Asuncion')::date;
begin
 if not public.plan_responsable_visible(p_tenant,p_usuario) then raise exception 'Ficha no disponible en esta empresa' using errcode='42501';end if;
 if p_pagina is null or p_pagina<0 or p_pagina>100000 or (p_desde is not null and p_hasta is not null and p_desde>p_hasta)
 or (p_estado is not null and p_estado not in ('Abiertas','Vencidas','Pendiente','En proceso','Cerrada','No aplica')) then raise exception 'Revisá el período y los filtros' using errcode='22023';end if;
 with base as materialized(select * from public.plan_responsable_historial_base(p_tenant,p_usuario,p_desde,p_hasta,p_obra)),
 filtradas as(select * from base where p_estado is null or estado=p_estado or p_estado='Abiertas' and estado in ('Pendiente','En proceso') or p_estado='Vencidas' and estado in ('Pendiente','En proceso') and previsto<hoy),
 obras as(select obra_id,obra,count(*) cantidad,count(*) filter(where estado in ('Pendiente','En proceso')) abiertas from base group by 1,2),
 resumen as(select count(*) total,count(*) filter(where estado='Pendiente') pendiente,count(*) filter(where estado='En proceso') en_proceso,count(*) filter(where estado='Cerrada') cerrada,count(*) filter(where estado='No aplica') no_aplica,
 count(*) filter(where estado in ('Pendiente','En proceso') and previsto<hoy) vencidas,
 avg(fin-inicio+1) filter(where estado='Cerrada' and inicio is not null and fin>=inicio) dias,
 count(*) filter(where estado='Cerrada' and inicio is not null and fin>=inicio) con_fechas,
 count(*) filter(where estado='Cerrada' and fin is not null and previsto is not null and (inicio is null or fin>=inicio)) con_plazo,
 count(*) filter(where estado='Cerrada' and fin is not null and previsto is not null and (inicio is null or fin>=inicio) and fin<=previsto) a_tiempo from base)
 select jsonb_build_object('resumen',jsonb_build_object('total',r.total,'pendiente',r.pendiente,'enProceso',r.en_proceso,'cerrada',r.cerrada,'noAplica',r.no_aplica,'vencidas',r.vencidas,'diasEjecucion',r.dias,'cierresConFecha',r.con_fechas,'cierresConPlazo',r.con_plazo,'cierresEnPlazo',r.a_tiempo),
 'obras',coalesce((select jsonb_agg(jsonb_build_object('id',obra_id,'nombre',obra,'cantidad',cantidad,'abiertas',abiertas) order by obra) from obras),'[]'),
 'ordenes',coalesce((select jsonb_agg(to_jsonb(s) order by s.recepcion desc,s.ot desc,s.id) from(select * from filtradas order by recepcion desc,ot desc,id limit 20 offset p_pagina*20)s),'[]'),
 'totalOrdenes',(select count(*) from filtradas),'pagina',p_pagina,'tamanoPagina',20) into result from resumen r;
 return result;
end $$;

create function public.plan_responsable_guardar(p_tenant uuid,p_usuario uuid,p_revision bigint,p_datos jsonb) returns bigint
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare anterior public.plan_responsables_fichas;clave text;limite integer;limpios jsonb:='{}';nueva bigint;
begin
 if not public.plan_responsable_visible(p_tenant,p_usuario) or not public.plan_equipo_puede_gestionar(p_tenant,p_usuario,'equipo.editar') then raise exception 'Sin permiso para editar esta ficha profesional' using errcode='42501';end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or p_revision is null or p_revision<0 or length(p_datos::text)>8000 then raise exception 'Datos de ficha inválidos' using errcode='22023';end if;
 for clave in select jsonb_object_keys(p_datos) loop
  limite:=case clave when 'documento' then 80 when 'especialidad' then 160 when 'telefono' then 80 when 'observaciones' then 2000 else null end;
  if limite is null or jsonb_typeof(p_datos->clave)<>'string' or length(p_datos->>clave)>limite then raise exception 'Campo profesional no permitido o demasiado largo: %',clave using errcode='22023';end if;
  limpios:=limpios||jsonb_build_object(clave,btrim(p_datos->>clave));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_usuario::text,717));
 select * into anterior from public.plan_responsables_fichas where tenant_id=p_tenant and user_id=p_usuario for update;
 if coalesce(anterior.revision,0)<>p_revision then raise exception 'La ficha cambió. Volvé a abrirla antes de guardar.' using errcode='40001';end if;
 if anterior.user_id is null and not exists(select 1 from public.plan_equipo_nodos n where n.tenant_id=p_tenant and n.user_id=p_usuario and n.perfil in ('jefe','tecnico')) and not exists(select 1 from public.plan_responsable_historial_base(p_tenant,p_usuario)) then raise exception 'Seleccioná una cuenta técnica existente' using errcode='22023';end if;
 insert into public.plan_responsables_fichas(tenant_id,user_id,datos,actualizada_por) values(p_tenant,p_usuario,limpios,auth.uid())
 on conflict(tenant_id,user_id) do update set datos=excluded.datos,revision=plan_responsables_fichas.revision+1,actualizada_en=now(),actualizada_por=auth.uid()
 returning revision into nueva;
 insert into public.plan_equipo_eventos(tenant_id,usuario_id,actor_id,accion,antes,despues) values(p_tenant,p_usuario,auth.uid(),'ficha_responsable',anterior.datos,limpios);
 return nueva;
end $$;

revoke all on function public.plan_responsable_visible(uuid,uuid),public.plan_responsable_historial_base(uuid,uuid,date,date,uuid),public.plan_responsables_cuentas(uuid),public.plan_responsables_directorio(uuid),public.plan_responsable_perfil(uuid,uuid,date,date,integer,text,uuid),public.plan_responsable_guardar(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.plan_responsables_cuentas(uuid),public.plan_responsables_directorio(uuid),public.plan_responsable_perfil(uuid,uuid,date,date,integer,text,uuid),public.plan_responsable_guardar(uuid,uuid,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
