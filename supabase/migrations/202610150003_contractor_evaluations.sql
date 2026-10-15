begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
create table public.plan_contratista_evaluaciones(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants,
 proyecto_id uuid not null references public.proyectos,orden_id uuid not null references public.ordenes,
 contratista_id uuid not null references public.plan_contratistas,creada_en timestamptz not null default now(),unique(orden_id,contratista_id)
);
create table public.plan_contratista_evaluacion_versiones(
 id uuid primary key default gen_random_uuid(),evaluacion_id uuid not null references public.plan_contratista_evaluaciones,
 version integer not null,documento_revision uuid not null references public.plan_documento_revisiones,
 evaluador_id uuid not null references auth.users,evaluador_nombre text not null,
 criterios jsonb not null,fundamento text not null,fecha date not null,fuentes jsonb not null,
 contenido_sha256 text not null,registrada_por uuid not null references auth.users,registrada_nombre text not null,
 registrada_en timestamptz not null default now(),solicitud_id uuid not null,solicitud_sha256 text not null,
 unique(evaluacion_id,version),unique(registrada_por,solicitud_id)
);
alter table public.plan_contratista_evaluaciones enable row level security;
alter table public.plan_contratista_evaluacion_versiones enable row level security;
revoke all on public.plan_contratista_evaluaciones,public.plan_contratista_evaluacion_versiones from public,anon,authenticated;
grant select on public.plan_contratista_evaluaciones,public.plan_contratista_evaluacion_versiones to service_role;

create function public.plan_contratista_evaluadores(p_proyecto uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;
begin
 select tenant_id into tid from public.proyectos where id=p_proyecto and deleted_at is null;
 if auth.uid() is null or tid is null or not public.plan_permiso_proyecto('informe.ver',p_proyecto) then raise exception 'Sin acceso al equipo de esta obra' using errcode='42501';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'nombre',coalesce(nullif(btrim(concat_ws(' ',u.raw_user_meta_data->>'nombre',u.raw_user_meta_data->>'apellidos')),''),u.email),'perfil',coalesce(n.perfil,m.rol)) order by u.id),'[]')
 from public.tenant_miembros m join auth.users u on u.id=m.user_id left join public.plan_equipo_nodos n on n.tenant_id=m.tenant_id and n.user_id=m.user_id
 where m.tenant_id=tid and m.activo and m.rol in ('administrador','supervisor','tecnico') and coalesce(n.perfil,'tecnico') in ('jefe','tecnico')
 and public.plan_equipo_activo(tid,m.user_id) and public.plan_equipo_obra_usuario(tid,m.user_id,p_proyecto)
 and public.plan_equipo_permiso_usuario(tid,m.user_id,'informe.editar'));
end $$;

create function public.plan_contratista_evaluacion_guardar(p_orden uuid,p_contratista uuid,p_datos jsonb,p_base uuid,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes;p public.proyectos;c public.plan_contratistas;e public.plan_contratista_evaluaciones;v public.plan_contratista_evaluacion_versiones;previous public.plan_contratista_evaluacion_versiones;r public.plan_documento_revisiones;d public.plan_documentos;score jsonb;uid uuid;uname text;actor_name text;h text;fuentes jsonb;f date;
begin
 o:=public.plan_comercio_orden(p_orden,'informe.editar');select * into p from public.proyectos where id=o.proyecto_id;
 select * into c from public.plan_contratistas where id=p_contratista and tenant_id=p.tenant_id;
 if c.id is null then raise exception 'Contratista fuera de esta empresa' using errcode='42501';end if;
 if p_solicitud is null or p_datos is null or octet_length(p_datos::text)>40000 or coalesce(length(btrim(p_datos->>'fundamento')),0) not between 1 and 6000 or
 jsonb_typeof(p_datos->'criterios') is distinct from 'array' or jsonb_array_length(p_datos->'criterios')<>4 or coalesce(p_datos->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Evaluación incompleta' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_orden,p_contratista,p_datos,p_base)::text,'UTF8')),'hex');
 select * into v from public.plan_contratista_evaluacion_versiones where registrada_por=auth.uid() and solicitud_id=p_solicitud;
 if v.id is not null then if v.solicitud_sha256<>h then raise exception 'Solicitud reutilizada' using errcode='22023';end if;return to_jsonb(v);end if;
 if o.estado<>'Cerrada' then raise exception 'La evaluación requiere una OT cerrada' using errcode='22023';end if;
 for score in select value from jsonb_array_elements(p_datos->'criterios') loop
  if score<>'null'::jsonb and (jsonb_typeof(score)<>'number' or score::text !~ '^[1-5]$') then raise exception 'Los criterios admiten 1 a 5 o No evaluable' using errcode='22023';end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(p_datos->'criterios') x where x<>'null'::jsonb) then raise exception 'Seleccioná al menos un criterio evaluable' using errcode='22023';end if;
 uid:=nullif(p_datos->>'evaluador_id','')::uuid;
 select x->>'nombre' into uname from jsonb_array_elements(public.plan_contratista_evaluadores(p.id)) x where x->>'id'=uid::text;
 if uname is null then raise exception 'Elegí una cuenta técnica o de supervisión activa y autorizada en esta obra' using errcode='42501';end if;
 select * into r from public.plan_documento_revisiones where id=nullif(p_datos->>'documento_revision','')::uuid;
 select * into d from public.plan_documentos where id=r.documento_id and orden_id=o.id;
 if d.id is null then raise exception 'Guardá y seleccioná una versión del informe de esta OT' using errcode='22023';end if;
 f:=(p_datos->>'fecha')::date;
 if f>(now() at time zone 'America/Asuncion')::date or o.fecha_fin_trabajos is not null and f<o.fecha_fin_trabajos then raise exception 'Revisá la fecha de evaluación y cierre del trabajo' using errcode='22023';end if;
 -- Lock the OT to serialize the first evaluation as well as later corrections.
 perform 1 from public.ordenes where id=o.id for update;
 select * into e from public.plan_contratista_evaluaciones where orden_id=o.id and contratista_id=c.id for update;
 if e.id is null then
  if p_base is not null or not (exists(select 1 from public.plan_orden_contratistas where orden_id=o.id and contratista_id=c.id) or exists(select 1 from public.plan_presupuestos where orden_id=o.id and contratista_id=c.id)) then raise exception 'No existe participación registrada del contratista' using errcode='22023';end if;
  insert into public.plan_contratista_evaluaciones(tenant_id,proyecto_id,orden_id,contratista_id) values(p.tenant_id,p.id,o.id,c.id) returning * into e;
 else
  select * into previous from public.plan_contratista_evaluacion_versiones where evaluacion_id=e.id order by version desc limit 1;
  if previous.id is distinct from p_base then raise exception 'Existe otra evaluación o corrección. Actualizá antes de continuar' using errcode='40001';end if;
 end if;
 select coalesce(nullif(btrim(concat_ws(' ',raw_user_meta_data->>'nombre',raw_user_meta_data->>'apellidos')),''),email) into actor_name from auth.users where id=auth.uid();
 if nullif(p_datos->'evidencia'->>'path','') is not null and (p_datos->'evidencia'->>'path' not like p.tenant_id::text||'/'||o.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='contractor-evidence' and name=p_datos->'evidencia'->>'path')) then raise exception 'Evidencia fuera de esta OT' using errcode='22023';end if;
 fuentes:=jsonb_build_object('ot',o.ot,'orden_id',o.id,'rubro',o.rubro,'descripcion',o.descripcion,'obra',(select nombre from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id)),
 'contratista',c.nombre,'documento',jsonb_build_object('id',d.id,'codigo',d.codigo,'tipo',d.tipo,'revision_id',r.id,'version',r.borrador_version,'sha256',r.contenido_sha256));
 if nullif(p_datos->'evidencia'->>'path','') is not null then fuentes:=fuentes||jsonb_build_object('evidencia',jsonb_build_object('path',p_datos->'evidencia'->>'path','nombre',left(p_datos->'evidencia'->>'nombre',220)));end if;
 insert into public.plan_contratista_evaluacion_versiones(evaluacion_id,version,documento_revision,evaluador_id,evaluador_nombre,criterios,fundamento,fecha,fuentes,contenido_sha256,registrada_por,registrada_nombre,solicitud_id,solicitud_sha256)
 values(e.id,coalesce(previous.version,0)+1,r.id,uid,uname,p_datos->'criterios',btrim(p_datos->>'fundamento'),f,fuentes,
 encode(sha256(convert_to(jsonb_build_object('criterios',p_datos->'criterios','fundamento',btrim(p_datos->>'fundamento'),'evaluador',uid,'nombre',uname,'fecha',f,'fuentes',fuentes,'version',coalesce(previous.version,0)+1)::text,'UTF8')),'hex'),auth.uid(),actor_name,p_solicitud,h) returning * into v;return to_jsonb(v);
end $$;

create function public.plan_contratista_evaluaciones_leer(p_contratista uuid default null,p_orden uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or p_contratista is null and p_orden is null then raise exception 'Indicá una OT o contratista' using errcode='42501';end if;
 with visibles as materialized(select e.* from public.plan_contratista_evaluaciones e join public.ordenes o on o.id=e.orden_id join public.proyectos p on p.id=e.proyecto_id where o.deleted_at is null and p.deleted_at is null and public.plan_permiso_proyecto('informe.ver',p.id) and (p_contratista is null or e.contratista_id=p_contratista) and (p_orden is null or e.orden_id=p_orden)),
 ordenes as materialized(select o.id,o.proyecto_id,o.ot,o.descripcion,o.rubro,o.estado,p.tenant_id,w.nombre obra,o.fecha_fin_trabajos,
 public.plan_permiso_proyecto('informe.editar',p.id) editar,
 public.plan_contratista_evaluadores(p.id) evaluadores,
 coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre) order by c.nombre) from public.plan_contratistas c where c.tenant_id=p.tenant_id and (exists(select 1 from public.plan_orden_contratistas x where x.orden_id=o.id and x.contratista_id=c.id) or exists(select 1 from public.plan_presupuestos b where b.orden_id=o.id and b.contratista_id=c.id) or exists(select 1 from visibles e where e.orden_id=o.id and e.contratista_id=c.id))),'[]') contratistas,
 coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'codigo',d.codigo,'tipo',d.tipo,'version',r.borrador_version,'hash',r.contenido_sha256) order by r.creada_en desc) from public.plan_documentos d join public.plan_documento_revisiones r on r.documento_id=d.id where d.orden_id=o.id),'[]') documentos
 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id)
 where o.deleted_at is null and p.deleted_at is null and w.deleted_at is null and o.estado='Cerrada' and public.plan_permiso_proyecto('informe.ver',p.id)
 and (p_orden is null or o.id=p_orden) and (p_contratista is null or exists(select 1 from public.plan_orden_contratistas x where x.orden_id=o.id and x.contratista_id=p_contratista) or exists(select 1 from public.plan_presupuestos b where b.orden_id=o.id and b.contratista_id=p_contratista) or exists(select 1 from visibles e where e.orden_id=o.id)))
 select jsonb_build_object('evaluaciones',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('versiones',(select jsonb_agg(to_jsonb(v) order by v.version) from public.plan_contratista_evaluacion_versiones v where v.evaluacion_id=e.id)) order by e.creada_en desc) from visibles e),'[]'),
 'ordenes',coalesce((select jsonb_agg(to_jsonb(o) order by o.ot desc) from ordenes o),'[]')) into result;return result;
end $$;
create index plan_presupuestos_contratista on public.plan_presupuestos(contratista_id,orden_id);
create index plan_presupuestos_orden on public.plan_presupuestos(orden_id);
create index plan_presupuesto_pagos_presupuesto on public.plan_presupuesto_pagos(presupuesto_id);
create index plan_presupuesto_pagos_comprobante on public.plan_presupuesto_pagos(comprobante_id);
create index plan_evaluaciones_contratista on public.plan_contratista_evaluaciones(contratista_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('contractor-evidence','contractor-evidence',false,8388608,array['application/pdf','image/png','image/jpeg']);
create function public.plan_evaluacion_archivo(p_name text,p_escribir boolean) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;oid uuid;
begin
 if auth.uid() is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false;end if;
 tid:=split_part(p_name,'/',1)::uuid;oid:=split_part(p_name,'/',2)::uuid;
 return exists(select 1 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=oid and p.tenant_id=tid and o.deleted_at is null and p.deleted_at is null and public.plan_permiso_proyecto(case when p_escribir then 'informe.editar' else 'informe.ver' end,p.id));
 exception when invalid_text_representation then return false;
end $$;
create policy plan_contractor_evidence_read on storage.objects for select to authenticated using(bucket_id='contractor-evidence' and public.plan_evaluacion_archivo(name,false));
create policy plan_contractor_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='contractor-evidence' and owner_id=auth.uid()::text and public.plan_evaluacion_archivo(name,true));
create function public.plan_comercio_inmutable() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$begin raise exception 'Registro conservado: cree una versión o movimiento nuevo' using errcode='22023';end $$;
do $$declare tabla text;begin foreach tabla in array array['plan_presupuestos','plan_presupuesto_versiones','plan_presupuesto_eventos','plan_presupuesto_comprobantes','plan_presupuesto_pagos','plan_presupuesto_firmas','plan_contratista_evaluaciones','plan_contratista_evaluacion_versiones'] loop execute format('create trigger plan_comercio_inmutable before update or delete on public.%I for each row execute function public.plan_comercio_inmutable()',tabla);end loop;end $$;
revoke all on function public.plan_evaluacion_archivo(text,boolean),public.plan_comercio_inmutable() from public,anon,authenticated;
grant execute on function public.plan_evaluacion_archivo(text,boolean) to authenticated;
revoke all on function public.plan_contratista_evaluadores(uuid),public.plan_contratista_evaluacion_guardar(uuid,uuid,jsonb,uuid,uuid),public.plan_contratista_evaluaciones_leer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_contratista_evaluadores(uuid),public.plan_contratista_evaluacion_guardar(uuid,uuid,jsonb,uuid,uuid),public.plan_contratista_evaluaciones_leer(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
