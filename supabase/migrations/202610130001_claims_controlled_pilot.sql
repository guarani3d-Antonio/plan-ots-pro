-- Controlled QR pilot. Inactive until the owner explicitly enables ONE test
-- work. Public HTTP uses service-only RPCs; anonymous SQL reads remain denied.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create table public.plan_portales_piloto (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 obra_id uuid not null references public.proyectos(id),
 sector text not null default '' check(length(sector)<=180),
 activo boolean not null default true,
 vence_en timestamptz not null default now()+interval '48 hours',
 cupo integer not null default 6 check(cupo=6),
 creado_por uuid not null references auth.users(id),
 creado_en timestamptz not null default now()
);
create table public.plan_reclamos (
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tenant_id uuid not null references public.tenants(id),
 obra_id uuid not null references public.proyectos(id),
 portal_id uuid not null references public.plan_portales_piloto(id),
 solicitud_id uuid not null,
 datos jsonb not null check(jsonb_typeof(datos)='object'),
 estado text not null default 'Cargando' check(estado in ('Cargando','Recibido','En revisión','Vinculado a OT','Archivado')),
 intentos integer not null default 1 check(intentos between 1 and 3),
 recibido_en timestamptz,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 version integer not null default 0,
 orden_id uuid references public.ordenes(id),
 motivo text,
 unique(portal_id,solicitud_id)
);
create table public.plan_reclamo_archivos (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 reclamo_id uuid not null references public.plan_reclamos(id),
 indice integer not null check(indice between 0 and 2),
 file_path text not null unique,
 file_url text not null,
 mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 bytes integer not null check(bytes between 1 and 2097152),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 unique(reclamo_id,indice)
);
create table public.plan_reclamo_eventos (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 reclamo_id uuid not null references public.plan_reclamos(id),
 accion text not null,
 actor uuid references auth.users(id),
 orden_id uuid references public.ordenes(id),
 motivo text,
 creado_en timestamptz not null default now()
);
create index plan_reclamos_recepcion on public.plan_reclamos(obra_id,recibido_en,numero);

alter table public.plan_portales_piloto enable row level security;
alter table public.plan_reclamos enable row level security;
alter table public.plan_reclamo_archivos enable row level security;
alter table public.plan_reclamo_eventos enable row level security;
revoke all on public.plan_portales_piloto,public.plan_reclamos,public.plan_reclamo_archivos,public.plan_reclamo_eventos from public,anon,authenticated;
grant select on public.plan_reclamos,public.plan_reclamo_archivos,public.plan_reclamo_eventos to authenticated;
create policy plan_reclamos_creador on public.plan_reclamos for select to authenticated using(public.plan_es_creador());
create policy plan_reclamo_archivos_creador on public.plan_reclamo_archivos for select to authenticated using(public.plan_es_creador());
create policy plan_reclamo_eventos_creador on public.plan_reclamo_eventos for select to authenticated using(public.plan_es_creador());

create function public.plan_portal_piloto_guardar(p_obra uuid,p_sector text,p_activar boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p public.proyectos;v public.plan_portales_piloto;begin
 if auth.uid() is null or not coalesce(public.plan_es_creador(),false) then raise exception 'Solo el Creador administra este piloto' using errcode='42501';end if;
 if p_activar is null or p_sector is null or length(p_sector)>180 then raise exception 'Configuración inválida' using errcode='22023';end if;
 select * into p from public.proyectos where id=p_obra and deleted_at is null and proyecto_padre_id is null;
 if p.id is null or not exists(select 1 from public.tenants t where t.id=p.tenant_id and t.activo and t.nombre ilike '%prueba%') or
    exists(select 1 from public.plan_directorio_perfiles d where d.tipo='obra' and d.id=p.id and not d.activo) then
  raise exception 'Elegí una obra activa de una empresa de prueba' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('plan-qr-pilot',0));
 select * into v from public.plan_portales_piloto where obra_id=p.id order by creado_en desc,id desc limit 1;
 if not p_activar then
  update public.plan_portales_piloto set activo=false where obra_id=p.id;
  return jsonb_build_object('activo',false);
 end if;
 if not public.plan_respaldo_listo(p.tenant_id) then raise exception 'El respaldo debe estar operativo y con recuperación vigente' using errcode='22023';end if;
 if exists(select 1 from public.plan_portales_piloto where activo and vence_en>now() and obra_id<>p.id) then raise exception 'El piloto admite una sola obra activa' using errcode='22023';end if;
 -- Pausing does not reset the six admissions or extend the window.
 if v.id is not null and v.vence_en>now() then
  if v.sector is distinct from btrim(p_sector) then raise exception 'El sector queda fijado durante este piloto' using errcode='22023';end if;
  update public.plan_portales_piloto set activo=true where id=v.id returning * into v;
 else
  insert into public.plan_portales_piloto(tenant_id,obra_id,sector,creado_por) values(p.tenant_id,p.id,btrim(p_sector),auth.uid()) returning * into v;
 end if;
 return to_jsonb(v)||jsonb_build_object('vigente',v.activo and v.vence_en>now(),'usados',(select count(*) from public.plan_reclamos where portal_id=v.id));
end$$;
create function public.plan_portal_piloto_estado(p_obra uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare v public.plan_portales_piloto;begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into v from public.plan_portales_piloto where obra_id=p_obra order by creado_en desc,id desc limit 1;
 return jsonb_build_object('portal',case when v.id is null then null else to_jsonb(v)||jsonb_build_object('vigente',v.activo and v.vence_en>now(),'usados',(select count(*) from public.plan_reclamos where portal_id=v.id)) end,'respaldo_listo',public.plan_respaldo_listo((select tenant_id from public.proyectos where id=p_obra)));
end$$;

-- Only the edge function receives this capability. No table/API enumerates it
-- for visitors, and it never grants access to requests, people, OT or Storage.
create function public.plan_portal_publico_contexto(p_portal uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('obraId',p.id,'obra',p.nombre,'empresa',t.nombre,'sector',v.sector,'vence_en',v.vence_en,'cupo',v.cupo,
   'disponible',public.plan_respaldo_listo(t.id) and (select count(*) from public.plan_reclamos r where r.portal_id=v.id)<v.cupo)
 from public.plan_portales_piloto v join public.proyectos p on p.id=v.obra_id and p.tenant_id=v.tenant_id join public.tenants t on t.id=v.tenant_id
 where v.id=p_portal and v.activo and v.vence_en>now() and p.deleted_at is null and t.activo
 and not exists(select 1 from public.plan_directorio_perfiles d where d.tipo='obra' and d.id=p.id and not d.activo)
$$;
create function public.plan_portal_reservar(p_portal uuid,p_solicitud uuid,p_datos jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v public.plan_portales_piloto;r public.plan_reclamos;f jsonb;k text;begin
 if p_solicitud is null or p_datos is null or jsonb_typeof(p_datos)<>'object' or octet_length(p_datos::text)>16000 then raise exception 'Solicitud inválida' using errcode='22023';end if;
 if (p_datos->>'consentimiento') is distinct from 'true' or (p_datos->>'aviso') is distinct from 'piloto-qr-v1' then raise exception 'Confirmá el aviso de la prueba' using errcode='22023';end if;
 foreach k in array array['nombre','telefono','unidad','descripcion'] loop
  if jsonb_typeof(p_datos->k) is distinct from 'string' or nullif(btrim(p_datos->>k),'') is null or length(p_datos->>k)>(case when k='descripcion' then 4000 else 180 end) then raise exception 'Completá contacto, unidad y descripción' using errcode='22023';end if;
 end loop;
 if regexp_replace(p_datos->>'telefono','[^0-9]','','g') !~ '^[0-9]{6,18}$' or length(coalesce(p_datos->>'correo',''))>180 or
    coalesce(p_datos->>'relacion','') not in ('Propietario/a','Inquilino/a','Administración','Otro') or
    coalesce(p_datos->>'atencion','') not in ('No','Sí','No estoy seguro/a') or coalesce(p_datos->>'previo','') not in ('No','Sí','No estoy seguro/a') then raise exception 'Datos de contacto inválidos' using errcode='22023';end if;
 if jsonb_typeof(p_datos->'fotos') is distinct from 'array' or jsonb_array_length(p_datos->'fotos')>3 then raise exception 'Hasta tres fotos' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(p_datos->'fotos') loop
  if jsonb_typeof(f) is distinct from 'object' or coalesce(f->>'mime','') not in ('image/png','image/jpeg','image/webp') or
    coalesce(f->>'bytes','') !~ '^[0-9]{1,7}$' or coalesce(f->>'sha256','') !~ '^[0-9a-f]{64}$' then raise exception 'Foto inválida' using errcode='22023';end if;
  if (f->>'bytes')::integer not between 1 and 2097152 then raise exception 'Hasta 2 MB por foto' using errcode='22023';end if;
 end loop;
 select * into v from public.plan_portales_piloto where id=p_portal for update;
 if v.id is null or public.plan_portal_publico_contexto(v.id) is null or not public.plan_respaldo_listo(v.tenant_id) then raise exception 'El portal está pausado o vencido' using errcode='22023';end if;
 select * into r from public.plan_reclamos where portal_id=v.id and solicitud_id=p_solicitud for update;
 if r.id is not null then
  if r.datos is distinct from p_datos then raise exception 'Este envío ya tiene otro contenido' using errcode='22023';end if;
  if r.recibido_en is null then
   if r.intentos>=3 then raise exception 'Se agotaron los reintentos de este envío' using errcode='22023';end if;
   update public.plan_reclamos set intentos=intentos+1 where id=r.id returning * into r;
  end if;
 else
  if (select count(*) from public.plan_reclamos where portal_id=v.id)>=v.cupo then raise exception 'Se alcanzó el cupo de seis solicitudes' using errcode='22023';end if;
  insert into public.plan_reclamos(tenant_id,obra_id,portal_id,solicitud_id,datos) values(v.tenant_id,v.obra_id,v.id,p_solicitud,p_datos) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'tenant_id',r.tenant_id,'numero','REC-'||r.numero,'recibido_en',r.recibido_en);
end$$;
create function public.plan_portal_confirmar(p_portal uuid,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_reclamos;f jsonb;i integer:=0;path text;begin
 select * into r from public.plan_reclamos where portal_id=p_portal and solicitud_id=p_solicitud for update;
 if r.id is null then raise exception 'No existe la reserva' using errcode='22023';end if;
 if r.recibido_en is not null then return jsonb_build_object('numero','REC-'||r.numero,'recibido_en',r.recibido_en);end if;
 if public.plan_portal_publico_contexto(p_portal) is null or not public.plan_respaldo_listo(r.tenant_id) then raise exception 'El portal quedó pausado' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(r.datos->'fotos') loop
  path:=r.tenant_id::text||'/reclamos/'||r.id::text||'/'||i::text||case f->>'mime' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.jpg' end;
  if not exists(select 1 from storage.objects o where o.bucket_id='fotos' and o.name=path and o.metadata->>'size'=f->>'bytes' and o.metadata->>'mimetype'=f->>'mime') then raise exception 'La evidencia no se guardó completa' using errcode='22023';end if;
  insert into public.plan_reclamo_archivos(tenant_id,reclamo_id,indice,file_path,file_url,mime,bytes,sha256) values(r.tenant_id,r.id,i,path,'storage://fotos/'||path,f->>'mime',(f->>'bytes')::integer,f->>'sha256');
  i:=i+1;
 end loop;
 update public.plan_reclamos set estado='Recibido',recibido_en=clock_timestamp(),actualizado_en=clock_timestamp(),version=1 where id=r.id returning * into r;
 insert into public.plan_reclamo_eventos(tenant_id,reclamo_id,accion) values(r.tenant_id,r.id,'Recibido por QR');
 return jsonb_build_object('numero','REC-'||r.numero,'recibido_en',r.recibido_en);
end$$;

create function public.plan_reclamo_tecnicos(p_obra uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$begin
 if not coalesce(public.plan_es_creador(),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nombre',coalesce(nullif(btrim(concat_ws(' ',a.raw_user_meta_data->>'nombre',a.raw_user_meta_data->>'apellidos')),''),'Técnico sin nombre'),'detalle',pm.rol) order by a.id),'[]')
 from public.proyecto_miembros pm join public.proyectos p on p.id=pm.proyecto_id join public.tenant_miembros tm on tm.user_id=pm.user_id and tm.tenant_id=p.tenant_id and tm.activo join auth.users a on a.id=pm.user_id
 where pm.proyecto_id=p_obra and p.deleted_at is null and pm.rol in ('supervisor','tecnico'));
end$$;
create function public.plan_reclamo_resolver(p_reclamo uuid,p_version integer,p_accion text,p_orden uuid default null,p_motivo text default '',p_tecnico uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_reclamos;o public.ordenes;f public.plan_reclamo_archivos;oid uuid;p public.proyectos;begin
 if auth.uid() is null or not coalesce(public.plan_es_creador(),false) then raise exception 'Solo el Creador revisa este piloto' using errcode='42501';end if;
 if p_accion is null or p_accion not in ('revisar','crear','vincular','archivar') or p_version is null or p_motivo is null or length(p_motivo)>1000 then raise exception 'Acción inválida' using errcode='22023';end if;
 select * into r from public.plan_reclamos where id=p_reclamo for update;
 if r.id is null or r.recibido_en is null then raise exception 'Reclamo no disponible' using errcode='22023';end if;
 if r.version<>p_version then raise exception 'El reclamo cambió. Actualizá antes de continuar' using errcode='40001';end if;
 if r.estado in ('Vinculado a OT','Archivado') then raise exception 'Este reclamo ya fue resuelto; conservamos su historial' using errcode='22023';end if;
 if p_accion='archivar' and length(btrim(p_motivo))<3 then raise exception 'Indicá el motivo de archivo' using errcode='22023';end if;
 if p_accion in ('crear','vincular') then
  select * into p from public.proyectos where id=r.obra_id and tenant_id=r.tenant_id and deleted_at is null;
  if p.id is null then raise exception 'La obra no está disponible' using errcode='22023';end if;
  if p_accion='crear' then
   if p_tecnico is null or not exists(select 1 from public.proyecto_miembros pm join public.tenant_miembros tm on tm.user_id=pm.user_id and tm.tenant_id=r.tenant_id and tm.activo
     where pm.proyecto_id=r.obra_id and pm.user_id=p_tecnico and pm.rol in ('supervisor','tecnico')) then raise exception 'Seleccioná un técnico autorizado de esta obra' using errcode='42501';end if;
   oid:=public.plan_crear_orden(r.obra_id,0.5,0.5);
   update public.ordenes set ubicada_en_plano=false,responsable_id=p_tecnico,responsable=coalesce((select nullif(btrim(concat_ws(' ',a.raw_user_meta_data->>'nombre',a.raw_user_meta_data->>'apellidos')),'') from auth.users a where a.id=p_tecnico),''),unidad_amenities=r.datos->>'unidad',ubicacion=r.datos->>'unidad',descripcion=r.datos->>'descripcion',obra=p.nombre,
    fecha_ingreso=(r.recibido_en at time zone 'America/Asuncion')::date,
    campos=campos||jsonb_build_object('canal_solicitud','Otro','fecha_solicitud',to_char(r.recibido_en at time zone 'America/Asuncion','YYYY-MM-DD"T"HH24:MI'),
     'solicitante',r.datos->>'nombre','contacto_solicitante',r.datos->>'telefono','referencia_solicitud','Portal QR · REC-'||r.numero,
     'urgencia_solicitada',case r.datos->>'atencion' when 'Sí' then 'Urgente' when 'No' then 'Normal' else 'Por evaluar' end)
   where id=oid;
  else
   select * into o from public.ordenes where id=p_orden and deleted_at is null and proyecto_id in (select id from public.proyectos where tenant_id=r.tenant_id and coalesce(proyecto_padre_id,id)=r.obra_id and deleted_at is null);
   if o.id is null then raise exception 'Seleccioná una OT de esta misma obra y empresa' using errcode='42501';end if;
   oid:=o.id;
   -- Preserve the OT's original request and all conserved document versions.
   insert into public.comentarios_ot(orden_id,proyecto_id,user_id,user_name,texto) values(oid,o.proyecto_id,auth.uid(),'Recepción QR','REC-'||r.numero||' · Solicitud adicional: '||(r.datos->>'descripcion'));
  end if;
  select * into o from public.ordenes where id=oid;
  for f in select * from public.plan_reclamo_archivos where reclamo_id=r.id order by indice loop
   -- Existing private Storage readers accept registered project references.
   -- No copy or public bucket is introduced; the original remains immutable.
   insert into public.plan_archivos_legados(bucket_id,object_name,proyecto_id) values('fotos',f.file_path,o.proyecto_id) on conflict do nothing;
   insert into public.fotos(id,orden_id,proyecto_id,categoria,file_path,file_url,file_type,file_size_kb,mime_type,label,descripcion,uploaded_by)
   values(f.id,oid,o.proyecto_id,'ANTES',f.file_path,f.file_url,'imagen',ceil(f.bytes/1024.0),f.mime,'Evidencia recibida por QR','REC-'||r.numero||' · Evidencia aportada por el solicitante. No acredita una visita técnica.',auth.uid());
  end loop;
 end if;
 update public.plan_reclamos set estado=case p_accion when 'revisar' then 'En revisión' when 'archivar' then 'Archivado' else 'Vinculado a OT' end,
  orden_id=oid,motivo=nullif(btrim(p_motivo),''),version=version+1,actualizado_en=clock_timestamp() where id=r.id returning * into r;
 insert into public.plan_reclamo_eventos(tenant_id,reclamo_id,accion,actor,orden_id,motivo) values(r.tenant_id,r.id,p_accion,auth.uid(),oid,nullif(btrim(p_motivo),''));
 return jsonb_build_object('id',r.id,'estado',r.estado,'orden_id',oid,'ot',(select ot from public.ordenes where id=oid));
end$$;

create function public.plan_reclamo_archivo(p_name text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.plan_reclamos r where p_name like r.tenant_id::text||'/reclamos/'||r.id::text||'/%')
$$;
create policy plan_reclamo_storage_creador on storage.objects for select to authenticated
 using(bucket_id='fotos' and public.plan_es_creador() and public.plan_reclamo_archivo(name));
create policy plan_reclamo_original_no_borrar on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'fotos' or not public.plan_reclamo_archivo(name));
create policy plan_reclamo_original_no_reescribir on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'fotos' or not public.plan_reclamo_archivo(name)) with check(bucket_id<>'fotos' or not public.plan_reclamo_archivo(name));

revoke all on function public.plan_portal_piloto_guardar(uuid,text,boolean),public.plan_portal_piloto_estado(uuid),public.plan_portal_publico_contexto(uuid),public.plan_portal_reservar(uuid,uuid,jsonb),public.plan_portal_confirmar(uuid,uuid),public.plan_reclamo_resolver(uuid,integer,text,uuid,text,uuid),public.plan_reclamo_tecnicos(uuid),public.plan_reclamo_archivo(text) from public,anon,authenticated;
grant execute on function public.plan_portal_piloto_guardar(uuid,text,boolean),public.plan_portal_piloto_estado(uuid),public.plan_reclamo_resolver(uuid,integer,text,uuid,text,uuid),public.plan_reclamo_tecnicos(uuid),public.plan_reclamo_archivo(text) to authenticated;
grant execute on function public.plan_portal_publico_contexto(uuid),public.plan_portal_reservar(uuid,uuid,jsonb),public.plan_portal_confirmar(uuid,uuid) to service_role;
commit;
