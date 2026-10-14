begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Current addresses are sourced from the company's work, never a personal address.
-- Existing locations/OTs and immutable documents retain their identities and history.
create function public.plan_cliente_obra_accesible(p_tenant uuid,p_proyecto uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.proyectos p
 where p.id=p_proyecto and p.tenant_id=p_tenant and p.deleted_at is null
 and (public.plan_es_creador() or public.plan_es_miembro_proyecto(p.id)))
$$;

create function public.plan_cliente_ubicacion_obra() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p public.proyectos;w public.proyectos;address text;
begin
 if new.proyecto_id is null then raise exception 'Seleccioná una obra de la empresa para la ubicación' using errcode='22023';end if;
 if auth.uid() is not null and not public.plan_cliente_obra_accesible(new.tenant_id,new.proyecto_id) then raise exception 'No tenés acceso a esta obra' using errcode='42501';end if;
 select * into p from public.proyectos where id=new.proyecto_id and tenant_id=new.tenant_id and deleted_at is null;
 select * into w from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id) and tenant_id=new.tenant_id and deleted_at is null;
 if w.id is null then raise exception 'La ubicación no corresponde a una obra de esta empresa' using errcode='42501';end if;
 select f.direccion into address from public.plan_obra_fichas f where f.obra_id=w.id;
 if nullif(btrim(address),'') is null then raise exception 'Completá la dirección en la ficha de la obra antes de vincular un cliente' using errcode='22023';end if;
 new.nombre_obra:=w.nombre;new.direccion:=address;
 return new;
end $$;
create trigger aa_plan_cliente_ubicacion_obra before insert or update of proyecto_id,nombre_obra,direccion
 on public.plan_cliente_ubicaciones for each row execute function public.plan_cliente_ubicacion_obra();

create function public.plan_cliente_sin_domicilio_personal() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if tg_op='INSERT' then new.direccion:=null;else new.direccion:=old.direccion;end if;
 return new;
end $$;
create trigger aa_plan_cliente_sin_domicilio before insert or update of direccion on public.plan_clientes
 for each row execute function public.plan_cliente_sin_domicilio_personal();

create function public.plan_cliente_requiere_obra() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if exists(select 1 from public.plan_clientes where id=new.id) and not exists(
 select 1 from public.plan_cliente_ubicaciones u join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id
 where u.cliente_id=new.id and u.tenant_id=new.tenant_id and p.deleted_at is null) then
 raise exception 'El cliente debe quedar vinculado a una obra de la empresa' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger plan_cliente_requiere_obra after insert on public.plan_clientes
 deferrable initially deferred for each row execute function public.plan_cliente_requiere_obra();
create unique index plan_cliente_solicitud_unica on public.plan_directorio_eventos(tenant_id,(datos->>'solicitud')) where tipo='cliente' and datos ? 'solicitud';

-- Preserve the exact previous definitions for rollback; historical report
-- renderers and frozen revision sources are not changed.
do $$ declare source text;begin
 source:=pg_get_functiondef('public.plan_clientes_para_obra(uuid)'::regprocedure);
 if position('c.correo,c.direccion,u.tipo_inmueble,u.nombre_obra,u.direccion,u.piso' in source)=0 then raise exception 'Definición inesperada de clientes por obra';end if;
 alter function public.plan_clientes_para_obra(uuid) rename to plan_clientes_para_obra_antes_perfil_20261014;
 source:=replace(source,'c.correo,c.direccion,u.tipo_inmueble,u.nombre_obra,u.direccion,u.piso','c.correo,null::text,u.tipo_inmueble,w.nombre,f.direccion,u.piso');
 source:=replace(source,'join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id',
 'join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=p.tenant_id left join public.plan_obra_fichas f on f.obra_id=w.id');
 source:=replace(source,'u.proyecto_id=p_proyecto and p.deleted_at is null',
 '(u.proyecto_id=p_proyecto or ((public.plan_es_creador() or public.plan_tiene_permiso(''cliente.ver'',p.tenant_id)) and w.id=(select coalesce(z.proyecto_padre_id,z.id) from public.proyectos z where z.id=p_proyecto and z.tenant_id=p.tenant_id))) and p.deleted_at is null');
 execute source;
 source:=pg_get_functiondef('public.plan_validar_cliente_ot()'::regprocedure);
 if position('u.proyecto_id=new.proyecto_id' in source)=0 then raise exception 'Definición inesperada del vínculo cliente OT';end if;
 execute replace(source,'CREATE OR REPLACE FUNCTION public.plan_validar_cliente_ot()','CREATE OR REPLACE FUNCTION public.plan_validar_cliente_ot_antes_perfil_20261014()');
 source:=replace(source,'u.proyecto_id=new.proyecto_id',
 'exists(select 1 from public.proyectos sitio join public.proyectos destino on destino.id=new.proyecto_id and destino.tenant_id=sitio.tenant_id where sitio.id=u.proyecto_id and coalesce(sitio.proyecto_padre_id,sitio.id)=coalesce(destino.proyecto_padre_id,destino.id))');
 execute source;
 source:=pg_get_functiondef('public.plan_documento_contexto_campos(uuid,text,jsonb,uuid)'::regprocedure);
 if position('''domicilio'',coalesce(c.direccion,'''')' in source)=0 then raise exception 'Definición inesperada del contexto documental';end if;
 alter function public.plan_documento_contexto_campos(uuid,text,jsonb,uuid) rename to plan_documento_contexto_antes_perfil_20261014;
 source:=replace(source,'''domicilio'',coalesce(c.direccion,'''')','''domicilio'',coalesce((select f.direccion from public.plan_obra_fichas f where f.obra_id=obra.id),'''')');
 source:=replace(source,'''direccion_obra'',coalesce(nullif(perfil->>''direccion'',''''),u.direccion,'''')','''direccion_obra'',coalesce((select f.direccion from public.plan_obra_fichas f where f.obra_id=obra.id),'''')');
 execute source;
end $$;
revoke all on function public.plan_validar_cliente_ot_antes_perfil_20261014(),public.plan_clientes_para_obra_antes_perfil_20261014(uuid),public.plan_documento_contexto_antes_perfil_20261014(uuid,text,jsonb,uuid),public.plan_clientes_para_obra(uuid),public.plan_documento_contexto_campos(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.plan_clientes_para_obra(uuid),public.plan_documento_contexto_campos(uuid,text,jsonb,uuid) to authenticated;

create function public.plan_cliente_obras(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('cliente.ver',p_tenant) or public.plan_tiene_permiso('cliente.crear',p_tenant)) then
 raise exception 'Sin permiso para consultar las obras del cliente' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'obra_id',w.id,'nombre',w.nombre,'proyecto_nombre',p.nombre,
 'direccion',f.direccion,'ciudad',dp.datos->>'ciudad','tipo',dp.datos->>'tipo','activo',coalesce(dp.activo,true)) order by w.nombre,p.nombre,p.id),'[]') into result
 from public.proyectos p join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=p.tenant_id and w.deleted_at is null
 left join public.plan_obra_fichas f on f.obra_id=w.id left join public.plan_directorio_perfiles dp on dp.tipo='obra' and dp.id=w.id
 where public.plan_cliente_obra_accesible(p_tenant,p.id);
 return result;
end $$;

create function public.plan_cliente_ubicaciones_listar(p_tenant uuid,p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('cliente.ver',p_tenant)) or not exists(
 select 1 from public.plan_clientes where id=p_cliente and tenant_id=p_tenant) then
 raise exception 'Cliente no disponible en esta empresa' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(u)-'direccion'-'nombre_obra'||jsonb_build_object(
 'nombre_obra',w.nombre,'direccion',f.direccion,'ciudad',dp.datos->>'ciudad','obra_id',w.id,'obra_tipo',dp.datos->>'tipo',
 'proyecto_nombre',p.nombre) order by w.nombre,u.unidad,u.id),'[]') into result
 from public.plan_cliente_ubicaciones u join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id
 join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.tenant_id=u.tenant_id and w.deleted_at is null
 left join public.plan_obra_fichas f on f.obra_id=w.id left join public.plan_directorio_perfiles dp on dp.tipo='obra' and dp.id=w.id
 where u.tenant_id=p_tenant and u.cliente_id=p_cliente and public.plan_cliente_obra_accesible(p_tenant,p.id);
 return result;
end $$;

create function public.plan_clientes_fichas(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare fichas jsonb;result jsonb;
begin
 fichas:=public.plan_directorio_listar('cliente',p_tenant);
 select coalesce(jsonb_agg(jsonb_set(f,'{datos}',(f->'datos')-array['direccion','ciudad','pais'])||jsonb_build_object(
 'ubicaciones',public.plan_cliente_ubicaciones_listar(p_tenant,(f->>'id')::uuid)) order by f->'datos'->>'nombre'),'[]') into result
 from jsonb_array_elements(fichas) f;
 return result;
end $$;

create function public.plan_cliente_ficha_guardar(p_tenant uuid,p_id uuid,p_datos jsonb,p_completa boolean,
 p_proyecto uuid default null,p_ubicacion uuid default null,p_lugar jsonb default '{}',p_solicitud uuid default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare cid uuid;w public.proyectos;address text;d jsonb:=p_datos-array['direccion','ciudad','pais'];location_data jsonb;request_row public.plan_directorio_eventos;request_hash text;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso(case when p_id is null then 'cliente.crear' else 'cliente.editar' end,p_tenant)) then
 raise exception 'Sin permiso para guardar esta ficha' using errcode='42501';end if;
 if p_id is null then
 if p_solicitud is null then raise exception 'Volvé a abrir el alta del cliente' using errcode='22023';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('datos',d,'completa',p_completa,'proyecto',p_proyecto,'ubicacion',p_ubicacion,'lugar',p_lugar)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
 select * into request_row from public.plan_directorio_eventos where tenant_id=p_tenant and tipo='cliente' and datos->>'solicitud'=p_solicitud::text;
 if found then
 if request_row.tipo<>'cliente' or request_row.tenant_id<>p_tenant or request_row.actor<>auth.uid() then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 if request_row.datos->>'huellaSolicitud' is distinct from request_hash then raise exception 'El intento anterior usó otros datos. Revisá el directorio antes de repetir el alta.' using errcode='22023';end if;
 return request_row.ficha_id;
 end if;
 end if;
 if p_proyecto is null and (p_id is null or not exists(select 1 from public.plan_cliente_ubicaciones u where u.cliente_id=p_id and u.tenant_id=p_tenant and public.plan_cliente_obra_accesible(p_tenant,u.proyecto_id))) then
 raise exception 'Seleccioná la obra del cliente' using errcode='22023';end if;
 if p_proyecto is not null then
 if not public.plan_cliente_obra_accesible(p_tenant,p_proyecto) then raise exception 'Obra no disponible en esta empresa' using errcode='42501';end if;
 if not (public.plan_es_creador() or public.plan_tiene_permiso('cliente.ubicaciones',p_tenant)) then raise exception 'Sin permiso para vincular ubicaciones' using errcode='42501';end if;
 select w0.* into w from public.proyectos p join public.proyectos w0 on w0.id=coalesce(p.proyecto_padre_id,p.id) where p.id=p_proyecto;
 select f.direccion into address from public.plan_obra_fichas f where f.obra_id=w.id;
 if nullif(btrim(address),'') is null then raise exception 'Completá la dirección en la ficha de la obra' using errcode='22023';end if;
 if jsonb_typeof(p_lugar) is distinct from 'object' or exists(select 1 from jsonb_each(p_lugar) x where x.key not in ('torre','piso','unidad','sector') or jsonb_typeof(x.value)<>'string' or length(x.value::text)>162) then
 raise exception 'Revisá la torre, unidad o sector' using errcode='22023';end if;
 end if;
 cid:=public.plan_directorio_guardar('cliente',p_tenant,p_id,d,p_completa);
 if p_proyecto is not null then
 if p_ubicacion is not null and not exists(select 1 from public.plan_cliente_ubicaciones where id=p_ubicacion and cliente_id=cid and tenant_id=p_tenant) then
 raise exception 'Ubicación de otro cliente o empresa' using errcode='42501';end if;
 location_data:=coalesce((select datos_adicionales from public.plan_cliente_ubicaciones where id=p_ubicacion),'{}')||p_lugar||jsonb_build_object(
 'proyecto_id',p_proyecto,'nombre_obra',w.nombre,'direccion',address,'tipo_inmueble',coalesce((select tipo_inmueble from public.plan_cliente_ubicaciones where id=p_ubicacion),'otro'),'activo',true);
 perform public.plan_directorio_ubicacion_guardar(p_tenant,cid,p_ubicacion,location_data);
 end if;
 if p_id is null then insert into public.plan_directorio_eventos(tipo,ficha_id,tenant_id,actor,datos) values('cliente',cid,p_tenant,auth.uid(),jsonb_build_object('solicitud',p_solicitud,'huellaSolicitud',request_hash));end if;
 return cid;
end $$;

create function public.plan_cliente_fecha(p_text text) returns date
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
begin
 if p_text !~ '^\d{4}-\d{2}-\d{2}$' then return null;end if;
 return p_text::date;
exception when datetime_field_overflow or invalid_datetime_format then return null;
end $$;

create function public.plan_cliente_perfil(p_tenant uuid,p_cliente uuid,p_desde date default null,p_hasta date default null,
 p_tab text default 'resumen',p_pagina integer default 0,p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare orders jsonb;responses jsonb;selected_orders jsonb;selected_responses jsonb;summary jsonb;monthly jsonb;order_total integer;response_total integer;page_size integer:=20;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('cliente.ver',p_tenant)) or not exists(select 1 from public.plan_clientes where id=p_cliente and tenant_id=p_tenant) then
 raise exception 'Cliente no disponible en esta empresa' using errcode='42501';end if;
 if p_tab not in ('resumen','reclamos','encuestas') or p_pagina not between 0 and 50000 or (p_desde is not null and p_hasta is not null and p_hasta<p_desde) or (p_estado is not null and p_estado not in ('Activos','Pendiente','En proceso','Cerrada','No aplica')) then
 raise exception 'Filtro del historial inválido' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'ot',o.ot,'proyecto_id',o.proyecto_id,'obra',w.nombre,'unidad',u.unidad,
 'torre',u.datos_adicionales->>'torre','sector',u.sector,'descripcion',o.descripcion,'rubro',o.rubro,'estado',o.estado,'prioridad',o.prioridad,'ubicacion',o.ubicacion,
 'responsable',o.responsable,'recepcion',coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date),
 'cierre',o.fecha_fin_trabajos,'comentarios',o.comentarios,'unidad_amenities',o.unidad_amenities,
 'en_garantia',o.en_garantia,'asiste_facility',o.asiste_facility,'reincidencia',o.reincidencia,'potencialmente_conflictivo',o.potencialmente_conflictivo,
 'nivel_riesgo',o.nivel_riesgo,'rubro_secundario',o.rubro_secundario,'contratistas',o.contratistas,'porcentaje_avance',o.porcentaje_avance,
 'fecha_inicio_trabajos',o.fecha_inicio_trabajos,'acta_conformidad',o.acta_conformidad,'informe_relevamiento',o.informe_relevamiento,'informe_avance',o.informe_avance,'informe_cierre',o.informe_cierre,
 'reclamos_qr',coalesce((select jsonb_agg(jsonb_build_object('numero','REC-'||r.numero,'fecha',r.recibido_en,'estado',r.estado) order by r.numero desc) from public.plan_reclamos r where r.orden_id=o.id and r.tenant_id=p_tenant),'[]')) order by coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date) desc,o.id),'[]') into orders
 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.deleted_at is null
 left join public.plan_cliente_ubicaciones u on u.id=o.cliente_ubicacion_id and u.cliente_id=p_cliente and u.tenant_id=p_tenant
 where o.cliente_id=p_cliente and o.deleted_at is null and public.plan_cliente_obra_accesible(p_tenant,p.id)
 and (p_desde is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)>=p_desde)
 and (p_hasta is null or coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date)<=p_hasta);

 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'codigo',d.codigo,'orden_id',o.id,'ot',o.ot,'obra',w.nombre,'revision_id',rv.id,'revision',rv.revision,
 'fecha',coalesce(public.plan_cliente_fecha(rv.datos->'encuesta'->>'fechaRespuesta'),(coalesce(rv.creada_en,d.creado_en) at time zone 'America/Asuncion')::date),
 'datos',coalesce(rv.datos->'encuesta','{}'),'guardada',rv.id is not null) order by coalesce(rv.creada_en,d.creado_en) desc,d.id),'[]') into responses
 from public.plan_documentos d join public.ordenes o on o.id=d.orden_id and o.deleted_at is null
 join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.deleted_at is null
 left join lateral(select r.id,r.revision,r.datos,r.creada_en from public.plan_documento_revisiones r where r.documento_id=d.id order by r.revision desc limit 1) rv on true
 left join public.plan_documento_fuentes sf on sf.revision_id=rv.id and sf.documento_id=d.id
 where d.tipo='encuesta' and d.tenant_id=p_tenant and public.plan_cliente_obra_accesible(p_tenant,p.id)
 and (case when rv.id is null then o.cliente_id=p_cliente else sf.fuentes->'orden'->>'cliente_id'=p_cliente::text end)
 and (p_desde is null or coalesce(public.plan_cliente_fecha(rv.datos->'encuesta'->>'fechaRespuesta'),(coalesce(rv.creada_en,d.creado_en) at time zone 'America/Asuncion')::date)>=p_desde)
 and (p_hasta is null or coalesce(public.plan_cliente_fecha(rv.datos->'encuesta'->>'fechaRespuesta'),(coalesce(rv.creada_en,d.creado_en) at time zone 'America/Asuncion')::date)<=p_hasta);

 order_total:=jsonb_array_length(orders);response_total:=jsonb_array_length(responses);
 select jsonb_build_object('total',order_total,'pendiente',count(*) filter(where x->>'estado'='Pendiente'),
 'enProceso',count(*) filter(where x->>'estado'='En proceso'),'cerrada',count(*) filter(where x->>'estado'='Cerrada'),
 'noAplica',count(*) filter(where x->>'estado'='No aplica'),
 'diasCierre',avg((x->>'cierre')::date-(x->>'recepcion')::date) filter(where x->>'estado'='Cerrada' and x->>'cierre'>=x->>'recepcion'),
 'cierresConFecha',count(*) filter(where x->>'estado'='Cerrada' and x->>'cierre'>=x->>'recepcion')) into summary from jsonb_array_elements(orders) x;
 select coalesce(jsonb_agg(jsonb_build_object('mes',mes,'cantidad',cantidad) order by mes),'[]') into monthly
 from(select left(x->>'recepcion',7) mes,count(*) cantidad from jsonb_array_elements(orders) x group by 1) m;
 if p_estado is not null then
 select coalesce(jsonb_agg(x),'[]') into orders from jsonb_array_elements(orders) x where
 x->>'estado'=p_estado or (p_estado='Activos' and x->>'estado' in ('Pendiente','En proceso'));
 order_total:=jsonb_array_length(orders);
 end if;
 select coalesce(jsonb_agg(x),'[]') into selected_orders from(select x from jsonb_array_elements(orders) with ordinality t(x,n) where n>p_pagina*page_size and n<=p_pagina*page_size+page_size) s;
 select coalesce(jsonb_agg(x),'[]') into selected_responses from(select x from jsonb_array_elements(responses) with ordinality t(x,n) where n>p_pagina*page_size and n<=p_pagina*page_size+page_size) s;
 return jsonb_build_object('resumen',summary,'meses',monthly,'ordenes',case when p_tab='encuestas' then '[]'::jsonb else selected_orders end,
 'encuestas',case when p_tab='reclamos' then '[]'::jsonb else selected_responses end,
 'valoraciones',coalesce((select jsonb_agg(x->'datos') from jsonb_array_elements(responses) x where x->>'guardada'='true'),'[]'),
 'totalOrdenes',order_total,'totalEncuestas',response_total,'pagina',p_pagina,'tamanoPagina',page_size);
end $$;

revoke all on function public.plan_cliente_obra_accesible(uuid,uuid),public.plan_cliente_ubicacion_obra(),public.plan_cliente_sin_domicilio_personal(),public.plan_cliente_requiere_obra(),public.plan_cliente_fecha(text),public.plan_cliente_obras(uuid),public.plan_cliente_ubicaciones_listar(uuid,uuid),public.plan_clientes_fichas(uuid),public.plan_cliente_ficha_guardar(uuid,uuid,jsonb,boolean,uuid,uuid,jsonb,uuid),public.plan_cliente_perfil(uuid,uuid,date,date,text,integer,text) from public,anon,authenticated;
grant execute on function public.plan_cliente_obras(uuid),public.plan_cliente_ubicaciones_listar(uuid,uuid),public.plan_clientes_fichas(uuid),public.plan_cliente_ficha_guardar(uuid,uuid,jsonb,boolean,uuid,uuid,jsonb,uuid),public.plan_cliente_perfil(uuid,uuid,date,date,text,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
