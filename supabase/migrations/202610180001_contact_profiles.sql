begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Additive communication journal. Master identities, old links and signed
-- documents remain unchanged. No messaging provider is invoked here.
create table public.plan_contacto_comunicaciones(
 id uuid primary key,tenant_id uuid not null,contacto_id uuid not null,
 obra_id uuid not null references public.proyectos(id),orden_id uuid references public.ordenes(id),
 fecha timestamptz not null,canal text not null check(canal in ('WhatsApp','Llamada','Correo','Presencial','Otro')),
 direccion text not null check(direccion in ('Entrante','Saliente')),
 asunto text not null check(length(btrim(asunto)) between 1 and 180),
 resumen text not null check(length(btrim(resumen)) between 1 and 4000),
 resultado text not null check(resultado in ('Informado','Pendiente de respuesta','Resuelto')),
 seguimiento date,respuesta_a uuid references public.plan_contacto_comunicaciones(id),
 actor uuid not null references auth.users(id),actor_nombre text not null,registrado_en timestamptz not null default now(),
 foreign key(tenant_id,contacto_id) references public.plan_contactos(tenant_id,id),
 check((resultado='Pendiente de respuesta')=(seguimiento is not null))
);
create index plan_contacto_comunicaciones_historial on public.plan_contacto_comunicaciones(tenant_id,contacto_id,fecha desc,id);
create index plan_contacto_comunicaciones_respuestas on public.plan_contacto_comunicaciones(respuesta_a) where respuesta_a is not null;
alter table public.plan_contacto_comunicaciones enable row level security;
revoke all on public.plan_contacto_comunicaciones from public,anon,authenticated;
create table public.plan_contacto_altas(
 solicitud uuid primary key,tenant_id uuid not null references public.tenants(id),actor uuid not null references auth.users(id),contacto_id uuid not null references public.plan_contactos(id)
);
alter table public.plan_contacto_altas enable row level security;
revoke all on public.plan_contacto_altas from public,anon,authenticated;

create function public.plan_contacto_obra_visible(p_tenant uuid,p_obra uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.proyectos w where w.id=p_obra and w.tenant_id=p_tenant and w.proyecto_padre_id is null and w.deleted_at is null
 and (public.plan_es_creador() or public.plan_tiene_permiso('contacto.ver',p_tenant) and public.plan_equipo_obra_usuario(p_tenant,auth.uid(),w.id)))
$$;

create function public.plan_contacto_obras_base(p_tenant uuid,p_contacto uuid default null)
returns table(vinculo_id uuid,contacto_id uuid,id uuid,nombre text,direccion text,funcion text,activo boolean,principal boolean,tipo text,entidad_id uuid,referencia text)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 with enlaces as(
 select v.*,v.obra_id obra,'obra' clase,v.obra_id entidad from public.plan_contacto_vinculos v where v.obra_id is not null
 union all select v.*,coalesce(p.proyecto_padre_id,p.id),'ubicacion',v.ubicacion_id from public.plan_contacto_vinculos v join public.plan_cliente_ubicaciones u on u.id=v.ubicacion_id and u.tenant_id=v.tenant_id join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id and p.deleted_at is null
 union all select v.*,coalesce(p.proyecto_padre_id,p.id),'cliente',v.cliente_id from public.plan_contacto_vinculos v join public.plan_cliente_ubicaciones u on u.cliente_id=v.cliente_id and u.tenant_id=v.tenant_id join public.proyectos p on p.id=u.proyecto_id and p.tenant_id=u.tenant_id and p.deleted_at is null
 union all select distinct v.*,coalesce(p.proyecto_padre_id,p.id),'contratista',v.contratista_id from public.plan_contacto_vinculos v
 join public.plan_orden_contratistas k on k.contratista_id=v.contratista_id join public.ordenes o on o.id=k.orden_id and o.deleted_at is null
 join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=v.tenant_id and p.deleted_at is null
 ) select distinct e.id,e.contacto_id,w.id,w.nombre,coalesce(f.direccion,''),e.funcion,e.activo,e.principal,e.clase,e.entidad,
 case e.clase when 'obra' then w.nombre when 'cliente' then 'Cliente vinculado' when 'ubicacion' then 'Ubicación del cliente' else 'Contratista vinculado' end
 from enlaces e join public.proyectos w on w.id=e.obra and w.tenant_id=e.tenant_id left join public.plan_obra_fichas f on f.obra_id=w.id
 where e.tenant_id=p_tenant and (p_contacto is null or e.contacto_id=p_contacto) and public.plan_contacto_obra_visible(p_tenant,w.id)
$$;

create function public.plan_contactos_directorio(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare fichas jsonb;result jsonb;
begin
 -- Reuse the existing tenant-specific directory permission and identities.
 fichas:=public.plan_directorio_listar('contacto',p_tenant);
 with registros as materialized(select c.* from public.plan_contacto_comunicaciones c where c.tenant_id=p_tenant and public.plan_contacto_obra_visible(p_tenant,c.obra_id)
 and (c.orden_id is null or public.plan_permiso_proyecto('ot.ver',(select proyecto_id from public.ordenes where id=c.orden_id)))),
 counts as(select contacto_id,count(*) total,max(fecha) ultima,count(*) filter(where resultado='Pendiente de respuesta' and not exists(select 1 from registros r where r.respuesta_a=c.id and r.resultado='Resuelto')) pendientes from registros c group by contacto_id),
 obras as(select contacto_id,jsonb_agg(to_jsonb(w)-'contacto_id' order by nombre,funcion) lista from public.plan_contacto_obras_base(p_tenant) w group by contacto_id)
 select coalesce(jsonb_agg((f-'vinculos')||jsonb_build_object('actualizado_en',c.actualizado_en,'obras',coalesce(w.lista,'[]'),'indicadores',jsonb_build_object('total',coalesce(i.total,0),'ultima',i.ultima,'pendientes',coalesce(i.pendientes,0))) order by f->'datos'->>'nombre'),'[]') into result
 from jsonb_array_elements(fichas) f join public.plan_contactos c on c.id=(f->>'id')::uuid and c.tenant_id=p_tenant left join obras w on w.contacto_id=c.id left join counts i on i.contacto_id=c.id;
 return result;
end $$;

create function public.plan_contacto_opciones(p_tenant uuid,p_obra uuid default null,p_buscar text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare obras jsonb;ordenes jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contacto.ver',p_tenant)) then raise exception 'Sin acceso a contactos' using errcode='42501';end if;
 if p_obra is not null and not public.plan_contacto_obra_visible(p_tenant,p_obra) then raise exception 'Obra fuera de tu alcance' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'nombre',w.nombre,'direccion',coalesce(f.direccion,'')) order by w.nombre),'[]') into obras from public.proyectos w left join public.plan_obra_fichas f on f.obra_id=w.id where public.plan_contacto_obra_visible(p_tenant,w.id);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into ordenes from(select o.id,coalesce(o.ot,'OT')||' · '||left(coalesce(o.descripcion,''),100) nombre from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
 where p_obra is not null and coalesce(p.proyecto_padre_id,p.id)=p_obra and o.deleted_at is null and p.deleted_at is null and public.plan_permiso_proyecto('ot.ver',p.id)
 and (coalesce(o.ot,'')||' '||coalesce(o.descripcion,'')) ilike '%'||left(coalesce(p_buscar,''),180)||'%' order by o.ot,o.id limit 20)x;
 return jsonb_build_object('obras',obras,'ordenes',ordenes);
end $$;

create function public.plan_contacto_ficha_guardar(p_tenant uuid,p_id uuid,p_actualizado timestamptz,p_datos jsonb,p_obra uuid default null,p_funcion text default null,p_solicitud uuid default null) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare anterior public.plan_contactos;d jsonb;v uuid;alta public.plan_contacto_altas;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contacto'||case when p_id is null then '.crear' else '.editar' end,p_tenant)) then raise exception 'Sin permiso para guardar contactos' using errcode='42501';end if;
 if p_id is null and p_solicitud is not null then
  perform 1 from public.tenants where id=p_tenant for update;
  select * into alta from public.plan_contacto_altas where solicitud=p_solicitud;
  if found then
   if alta.tenant_id=p_tenant and alta.actor=auth.uid() then return alta.contacto_id;end if;
   raise exception 'La solicitud pertenece a otro contexto' using errcode='42501';
  end if;
 end if;
 if p_id is not null then
  select * into anterior from public.plan_contactos where id=p_id and tenant_id=p_tenant for update;
  if not found then raise exception 'Contacto fuera de esta empresa' using errcode='42501';end if;
  if anterior.actualizado_en is distinct from p_actualizado then raise exception 'La ficha cambió. Cerrá y volvé a abrirla antes de guardar.' using errcode='40001';end if;
 end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_each(p_datos) x where x.key not in ('nombre','telefono','correo','telefono_alternativo','correo_alternativo','canal','horarios','observaciones')) then raise exception 'Datos del contacto inválidos' using errcode='22023';end if;
 if nullif(btrim(p_datos->>'nombre'),'') is null or length(p_datos->>'nombre')>160 then raise exception 'Ingresá el nombre del contacto (hasta 160 caracteres)' using errcode='22023';end if;
 if nullif(btrim(p_datos->>'telefono'),'') is null and nullif(btrim(p_datos->>'correo'),'') is null then raise exception 'Ingresá un teléfono o correo para el contacto' using errcode='22023';end if;
 if coalesce(p_datos->>'canal','') not in ('','Teléfono','WhatsApp','Correo','Presencial','Otro') then raise exception 'Canal preferido inválido' using errcode='22023';end if;
 if p_id is null and (not public.plan_contacto_obra_visible(p_tenant,p_obra) or nullif(btrim(p_funcion),'') is null) then raise exception 'Elegí una obra autorizada y la función del contacto' using errcode='22023';end if;
 d:=coalesce((select datos from public.plan_directorio_perfiles where tipo='contacto' and id=p_id),'{}')||p_datos||jsonb_build_object('activo',coalesce(anterior.activo,true));
 -- Identity edits must not replay or change a legacy default link.
 d:=d-'vinculo_tipo'-'vinculo_id'-'funcion';
 if p_id is null then d:=d||jsonb_build_object('vinculo_tipo','obra','vinculo_id',p_obra,'funcion',p_funcion);end if;
 v:=public.plan_directorio_guardar('contacto',p_tenant,p_id,d,false);
 if p_id is null and p_solicitud is not null then insert into public.plan_contacto_altas values(p_solicitud,p_tenant,auth.uid(),v);end if;
 return v;
end $$;

create function public.plan_contacto_vinculo_guardar(p_tenant uuid,p_contacto uuid,p_tipo text,p_entidad uuid,p_funcion text,p_principal boolean default false,p_activo boolean default true) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contacto.editar',p_tenant)) then raise exception 'Sin permiso para editar vínculos' using errcode='42501';end if;
 if p_tipo='obra' then
  if not public.plan_contacto_obra_visible(p_tenant,p_entidad) then raise exception 'Obra fuera de tu alcance' using errcode='42501';end if;
 elsif not exists(select 1 from public.plan_contacto_obras_base(p_tenant,p_contacto) where tipo=p_tipo and entidad_id=p_entidad) then raise exception 'Vínculo fuera de tu alcance' using errcode='42501';end if;
 return public.plan_vincular_contacto(p_tenant,p_contacto,p_tipo,p_entidad,p_funcion,p_activo,p_principal);
end $$;

create function public.plan_contacto_comunicacion_guardar(p_tenant uuid,p_contacto uuid,p_id uuid,p_datos jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d jsonb:=p_datos;c public.plan_contactos;v_obra uuid;v_orden uuid;v_respuesta uuid;v_fecha timestamptz;v_seguimiento date;v_actor_nombre text;existente public.plan_contacto_comunicaciones;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contacto.editar',p_tenant)) then raise exception 'Sin permiso para registrar comunicaciones' using errcode='42501';end if;
 select * into c from public.plan_contactos where id=p_contacto and tenant_id=p_tenant for update;
 if not found or not c.activo then raise exception 'Contacto no disponible en esta empresa' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(d) is distinct from 'object' or length(d::text)>12000 or exists(select 1 from jsonb_each(d) x where x.key not in ('obra_id','orden_id','respuesta_a','fecha','canal','direccion','asunto','resumen','resultado','seguimiento')) then raise exception 'Registro de comunicación inválido' using errcode='22023';end if;
 v_obra:=nullif(d->>'obra_id','')::uuid;v_orden:=nullif(d->>'orden_id','')::uuid;v_respuesta:=nullif(d->>'respuesta_a','')::uuid;v_fecha:=(d->>'fecha')::timestamptz;v_seguimiento:=nullif(d->>'seguimiento','')::date;
 if not public.plan_contacto_obra_visible(p_tenant,v_obra) or not exists(select 1 from public.plan_contacto_obras_base(p_tenant,p_contacto) w where w.id=v_obra and w.activo) then raise exception 'Vinculá primero el contacto con una obra autorizada' using errcode='42501';end if;
 if v_orden is not null and not exists(select 1 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant where o.id=v_orden and o.deleted_at is null and p.deleted_at is null and coalesce(p.proyecto_padre_id,p.id)=v_obra and public.plan_permiso_proyecto('ot.ver',p.id)) then raise exception 'La OT no corresponde a esta obra o no está autorizada' using errcode='42501';end if;
 if v_respuesta is not null and not exists(select 1 from public.plan_contacto_comunicaciones e where e.id=v_respuesta and e.tenant_id=p_tenant and e.contacto_id=p_contacto and e.obra_id=v_obra and (e.orden_id is null or public.plan_permiso_proyecto('ot.ver',(select proyecto_id from public.ordenes where id=e.orden_id)))) then raise exception 'La respuesta no corresponde a este contacto y obra' using errcode='42501';end if;
 if v_fecha is null or not isfinite(v_fecha) or v_fecha>now()+interval '5 minutes' or v_fecha<'2000-01-01'::timestamptz or v_seguimiento is not null and not isfinite(v_seguimiento) then raise exception 'Revisá la fecha de la comunicación; las acciones futuras se anotan como seguimiento' using errcode='22023';end if;
 select * into existente from public.plan_contacto_comunicaciones where id=p_id;
 if found then
  if existente.tenant_id=p_tenant and existente.contacto_id=p_contacto and existente.actor=auth.uid() and (existente.obra_id,existente.orden_id,existente.fecha,existente.canal,existente.direccion,existente.asunto,existente.resumen,existente.resultado,existente.seguimiento,existente.respuesta_a) is not distinct from (v_obra,v_orden,v_fecha,d->>'canal',d->>'direccion',btrim(d->>'asunto'),btrim(d->>'resumen'),d->>'resultado',v_seguimiento,v_respuesta) then return p_id;end if;
  raise exception 'Ese registro ya existe con otro contenido; el historial no se sobrescribe' using errcode='23505';
 end if;
 select coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email,'Usuario') into v_actor_nombre from auth.users u where u.id=auth.uid();
 insert into public.plan_contacto_comunicaciones(id,tenant_id,contacto_id,obra_id,orden_id,fecha,canal,direccion,asunto,resumen,resultado,seguimiento,respuesta_a,actor,actor_nombre)
 values(p_id,p_tenant,p_contacto,v_obra,v_orden,v_fecha,d->>'canal',d->>'direccion',btrim(d->>'asunto'),btrim(d->>'resumen'),d->>'resultado',v_seguimiento,v_respuesta,auth.uid(),v_actor_nombre);
 return p_id;
end $$;

create function public.plan_contacto_historial(p_tenant uuid,p_contacto uuid,p_obra uuid default null,p_canal text default null,p_pagina integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not (public.plan_es_creador() or public.plan_tiene_permiso('contacto.ver',p_tenant)) or not exists(select 1 from public.plan_contactos where id=p_contacto and tenant_id=p_tenant) then raise exception 'Contacto fuera de tu alcance' using errcode='42501';end if;
 if p_pagina is null or p_pagina<0 or p_pagina>100000 or p_canal is not null and p_canal not in ('WhatsApp','Llamada','Correo','Presencial','Otro') or p_obra is not null and not public.plan_contacto_obra_visible(p_tenant,p_obra) then raise exception 'Filtros del historial inválidos' using errcode='22023';end if;
 with visibles as materialized(select e.* from public.plan_contacto_comunicaciones e where e.tenant_id=p_tenant and e.contacto_id=p_contacto and public.plan_contacto_obra_visible(p_tenant,e.obra_id)
 and (e.orden_id is null or public.plan_permiso_proyecto('ot.ver',(select proyecto_id from public.ordenes where id=e.orden_id)))),
 filtrados as(select * from visibles e where (p_obra is null or e.obra_id=p_obra) and (p_canal is null or e.canal=p_canal)),
 pagina as(select e.*,w.nombre obra,o.ot,case when e.resultado='Pendiente de respuesta' and exists(select 1 from visibles r where r.respuesta_a=e.id and r.resultado='Resuelto') then 'Resuelto por respuesta' else e.resultado end estado_actual
 from filtrados e join public.proyectos w on w.id=e.obra_id left join public.ordenes o on o.id=e.orden_id order by e.fecha desc,e.id limit 20 offset p_pagina*20)
 select jsonb_build_object('registros',coalesce((select jsonb_agg(to_jsonb(p) order by p.fecha desc,p.id) from pagina p),'[]'),'total',(select count(*) from filtrados),'pagina',p_pagina) into result;
 return result;
end $$;

revoke all on function public.plan_contacto_obra_visible(uuid,uuid),public.plan_contacto_obras_base(uuid,uuid),public.plan_contactos_directorio(uuid),public.plan_contacto_opciones(uuid,uuid,text),public.plan_contacto_ficha_guardar(uuid,uuid,timestamptz,jsonb,uuid,text,uuid),public.plan_contacto_vinculo_guardar(uuid,uuid,text,uuid,text,boolean,boolean),public.plan_contacto_comunicacion_guardar(uuid,uuid,uuid,jsonb),public.plan_contacto_historial(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.plan_contactos_directorio(uuid),public.plan_contacto_opciones(uuid,uuid,text),public.plan_contacto_ficha_guardar(uuid,uuid,timestamptz,jsonb,uuid,text,uuid),public.plan_contacto_vinculo_guardar(uuid,uuid,text,uuid,text,boolean,boolean),public.plan_contacto_comunicacion_guardar(uuid,uuid,uuid,jsonb),public.plan_contacto_historial(uuid,uuid,uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
