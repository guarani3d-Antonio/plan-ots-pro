begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Read models. Existing records and saved documents are not rewritten on install.
-- On a later OT edit with unchanged assignments, resolve renamed contractors by
-- the existing identity link before the legacy audit validates display names.
create function public.plan_contratista_nombre_compatible() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if coalesce(cardinality(new.contratistas),0)>0 and new.proyecto_id is not distinct from old.proyecto_id and new.contratistas is not distinct from old.contratistas then
  new.contratistas:=(select array_agg(coalesce(c.nombre,x.nombre) order by x.n)
   from unnest(new.contratistas) with ordinality x(nombre,n)
   left join lateral(select case when count(*)=1 then min(k.nombre) end nombre from public.plan_orden_contratistas v
    join public.plan_contratistas k on k.id=v.contratista_id and k.tenant_id=(select tenant_id from public.proyectos where id=new.proyecto_id)
    where v.orden_id=old.id and v.nombre_snapshot=x.nombre)c on true);
  update public.plan_orden_contratistas v set nombre_snapshot=c.nombre from public.plan_contratistas c
   where v.orden_id=old.id and c.id=v.contratista_id and c.nombre=any(new.contratistas)
   and c.tenant_id=(select tenant_id from public.proyectos where id=new.proyecto_id) and v.nombre_snapshot is distinct from c.nombre;
 end if;
 return new;
end $$;
create trigger plan_contratista_nombre_compatible before update on public.ordenes for each row execute function public.plan_contratista_nombre_compatible();
create function public.plan_contratista_historial_base(p_tenant uuid,p_contratista uuid default null,p_desde date default null,p_hasta date default null,p_obra uuid default null)
returns table(id uuid,contratista_id uuid,ot text,proyecto_id uuid,obra_id uuid,obra text,descripcion text,rubro text,estado text,prioridad text,responsable text,ubicacion text,recepcion date,inicio date,fin date,previsto date,compartida boolean)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select o.id,v.contratista_id,o.ot,p.id,w.id,w.nombre,o.descripcion,o.rubro,o.estado,o.prioridad,o.responsable,o.ubicacion,
 coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date),o.fecha_inicio_trabajos,o.fecha_fin_trabajos,o.fecha_limite,
 (select count(*)>1 from public.plan_orden_contratistas x where x.orden_id=o.id)
 from public.plan_orden_contratistas v join public.plan_contratistas c on c.id=v.contratista_id and c.tenant_id=p_tenant
 join public.ordenes o on o.id=v.orden_id join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=p_tenant and w.deleted_at is null
 where auth.uid() is not null and o.deleted_at is null and p.deleted_at is null
 and (public.plan_es_creador() or public.plan_es_miembro_proyecto(p.id))
 and (p_contratista is null or c.id=p_contratista) and (p_obra is null or w.id=p_obra)
 and (p_desde is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)>=p_desde)
 and (p_hasta is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)<=p_hasta)
$$;

create function public.plan_contratistas_directorio(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare fichas jsonb; result jsonb;
begin
 fichas:=public.plan_directorio_listar('contratista',p_tenant);
 with visibles as materialized(select * from public.plan_contratista_historial_base(p_tenant)),
 indicadores as(select contratista_id,count(*) total,count(*) filter(where estado in ('Pendiente','En proceso')) abiertas,max(recepcion) ultima from visibles group by contratista_id),
 obras as(select contratista_id,jsonb_agg(jsonb_build_object('id',obra_id,'nombre',obra,'cantidad',cantidad) order by obra) lista from(select contratista_id,obra_id,obra,count(*) cantidad from visibles group by 1,2,3)s group by contratista_id)
 select coalesce(jsonb_agg(f||jsonb_build_object('obras',coalesce(w.lista,'[]'),'indicadores',jsonb_build_object('total',coalesce(i.total,0),'abiertas',coalesce(i.abiertas,0),'ultima',i.ultima)) order by f->'datos'->>'nombre'),'[]') into result
 from jsonb_array_elements(fichas) f left join indicadores i on i.contratista_id=(f->>'id')::uuid left join obras w on w.contratista_id=(f->>'id')::uuid;
 return result;
end $$;

create function public.plan_contratista_perfil(p_tenant uuid,p_contratista uuid,p_desde date default null,p_hasta date default null,p_pagina integer default 0,p_estado text default null,p_obra uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contratista.ver',p_tenant)) or not exists(select 1 from public.plan_contratistas where id=p_contratista and tenant_id=p_tenant) then raise exception 'Ficha no disponible en esta empresa' using errcode='42501';end if;
 if p_pagina<0 or p_pagina>100000 or (p_desde is not null and p_hasta is not null and p_desde>p_hasta) or (p_estado is not null and p_estado not in ('Activos','Pendiente','En proceso','Cerrada','No aplica')) then raise exception 'Revisá el período y los filtros' using errcode='22023';end if;
 with base as materialized(select * from public.plan_contratista_historial_base(p_tenant,p_contratista,p_desde,p_hasta,p_obra)),
 filtradas as(select * from base where p_estado is null or estado=p_estado or p_estado='Activos' and estado in ('Pendiente','En proceso')),
 obras as(select obra_id,obra,count(*) cantidad from base group by 1,2),
 resumen as(select count(*) total,count(*) filter(where estado='Pendiente') pendiente,count(*) filter(where estado='En proceso') en_proceso,count(*) filter(where estado='Cerrada') cerrada,count(*) filter(where estado='No aplica') no_aplica,
 avg(fin-inicio+1) filter(where estado='Cerrada' and inicio is not null and fin>=inicio) dias,count(*) filter(where estado='Cerrada' and inicio is not null and fin>=inicio) con_fechas from base)
 select jsonb_build_object('resumen',jsonb_build_object('total',r.total,'pendiente',r.pendiente,'enProceso',r.en_proceso,'cerrada',r.cerrada,'noAplica',r.no_aplica,'diasEjecucion',r.dias,'cierresConFecha',r.con_fechas),
 'obras',coalesce((select jsonb_agg(jsonb_build_object('id',obra_id,'nombre',obra,'cantidad',cantidad) order by obra) from obras),'[]'),
 'ordenes',coalesce((select jsonb_agg(to_jsonb(s) order by s.recepcion desc,s.ot desc,s.id) from(select * from filtradas order by recepcion desc,ot desc,id limit 20 offset p_pagina*20)s),'[]'),
 'totalOrdenes',(select count(*) from filtradas),'pagina',p_pagina,'tamanoPagina',20) into result from resumen r;
 return result;
end $$;
revoke all on function public.plan_contratista_nombre_compatible(),public.plan_contratista_historial_base(uuid,uuid,date,date,uuid),public.plan_contratistas_directorio(uuid),public.plan_contratista_perfil(uuid,uuid,date,date,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.plan_contratistas_directorio(uuid),public.plan_contratista_perfil(uuid,uuid,date,date,integer,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
