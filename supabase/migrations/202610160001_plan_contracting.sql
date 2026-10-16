begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Contracting is part of the immutable plan, not a separate mutable OT list.
-- Existing reports, contractor links, budgets, signatures and files are preserved.
create function public.plan_contrataciones_config(p_datos jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare raw text:=p_datos#>>'{relevamiento,contratacionJSON}';cfg jsonb;
begin
 if nullif(raw,'') is null then return null;end if;
 if length(raw)>60000 then raise exception 'Contratación demasiado extensa' using errcode='22023';end if;
 cfg:=raw::jsonb;
 if jsonb_typeof(cfg) is distinct from 'object' or cfg->>'version' is distinct from '1' or jsonb_typeof(cfg->'contrataciones') is distinct from 'array' or jsonb_array_length(cfg->'contrataciones')>20 then raise exception 'Contratación del plan inválida' using errcode='22023';end if;
 return cfg;
exception when invalid_text_representation then raise exception 'Contratación del plan inválida' using errcode='22023';
end $$;

create function public.plan_validar_contratacion_plan(p_datos jsonb,p_orden uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare cfg jsonb:=public.plan_contrataciones_config(p_datos);c jsonb;a text;ids text[]:='{}';tid uuid;items jsonb:=coalesce(p_datos->'itemsAlcance','[]');
begin
 if cfg is null then return;end if;
 select p.tenant_id into tid from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=p_orden;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Actividades del plan inválidas' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(cfg->'contrataciones') loop
  if jsonb_typeof(c) is distinct from 'object' or coalesce(c->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or c->>'id'=any(ids) then raise exception 'Identidad de contratación inválida o repetida' using errcode='22023';end if;
  ids:=ids||(c->>'id');
  if jsonb_typeof(c->'manoObra') is distinct from 'boolean' or jsonb_typeof(c->'materiales') is distinct from 'boolean' or not ((c->>'manoObra')::boolean or (c->>'materiales')::boolean) then raise exception 'Indicá mano de obra y/o materiales' using errcode='22023';end if;
  if jsonb_typeof(p_datos->'fotoIds') is distinct from 'array' or jsonb_array_length(p_datos->'fotoIds')=0 then raise exception 'Cargá la evidencia fotográfica antes de contratar desde el plan' using errcode='22023';end if;
  if coalesce(c->>'contratistaId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Seleccioná un contratista del plan' using errcode='22023';end if;
  if not exists(select 1 from public.plan_contratistas k where k.id=(c->>'contratistaId')::uuid and k.tenant_id=tid and coalesce((select activo from public.plan_directorio_perfiles where tipo='contratista' and id=k.id),true)) then raise exception 'Contratista no disponible en esta empresa' using errcode='42501';end if;
  if jsonb_typeof(c->'actividadIds') is distinct from 'array' or jsonb_array_length(c->'actividadIds') not between 1 and 100 or (select count(distinct x) from jsonb_array_elements_text(c->'actividadIds') x)<>jsonb_array_length(c->'actividadIds') then raise exception 'Seleccioná actividades para la contratación' using errcode='22023';end if;
  for a in select jsonb_array_elements_text(c->'actividadIds') loop
   if not exists(select 1 from jsonb_array_elements(items) x where x->>'id'=a and nullif(btrim(x->>'trabajo'),'') is not null) then raise exception 'La actividad contratada no pertenece a este plan' using errcode='22023';end if;
  end loop;
  if coalesce(c->>'costo','') not in ('con_costo','sin_costo') or jsonb_typeof(c->'motivoSinCosto') is distinct from 'string' or length(c->>'motivoSinCosto')>2000 or c->>'costo'='sin_costo' and nullif(btrim(c->>'motivoSinCosto'),'') is null then raise exception 'Definí el costo o el motivo de cobertura' using errcode='22023';end if;
 end loop;
end $$;

create function public.plan_fuentes_contratacion_actividades(p_datos jsonb,p_orden uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare cfg jsonb:=public.plan_contrataciones_config(p_datos);items jsonb;tid uuid;
begin
 if cfg is null then return p_datos;end if;
 select p.tenant_id into tid from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=p_orden;
 select coalesce(jsonb_agg(x||jsonb_build_object('contratista',coalesce((select string_agg(distinct k.nombre,' · ' order by k.nombre) from jsonb_array_elements(cfg->'contrataciones') c join public.plan_contratistas k on k.id=(c->>'contratistaId')::uuid and k.tenant_id=tid where (c->'actividadIds') ? (x->>'id')),'')) order by n),'[]') into items from jsonb_array_elements(coalesce(p_datos->'itemsAlcance','[]')) with ordinality e(x,n);
 return jsonb_set(p_datos,'{itemsAlcance}',items);
end $$;

do $$declare def text;anchor text:='if d.tipo=''relevamiento'' then new.datos:=public.plan_vincular_cronograma_reclamo(new.datos,d.orden_id);end if;';begin
 def:=pg_get_functiondef('public.plan_documento_proteger_campos()'::regprocedure);
 if position(anchor in def)=0 then raise exception 'La protección documental cambió. Revisá la instalación.';end if;
 def:=replace(def,' perform 1 from public.ordenes where id=d.orden_id for share;',E' if d.tipo=''relevamiento'' and nullif(new.datos#>>''{relevamiento,contratacionJSON}'','''') is not null then perform 1 from public.ordenes where id=d.orden_id for update;end if;\n perform 1 from public.ordenes where id=d.orden_id for share;');
 def:=replace(def,anchor,'if d.tipo=''relevamiento'' then if tg_op=''UPDATE'' and nullif(old.datos#>>''{relevamiento,contratacionJSON}'','''') is not null and nullif(new.datos#>>''{relevamiento,contratacionJSON}'','''') is null then raise exception ''El cliente no conservó la contratación del plan. Actualizá la aplicación antes de guardar'' using errcode=''22023'';end if;perform public.plan_validar_contratacion_plan(new.datos,d.orden_id);new.datos:=public.plan_vincular_cronograma_reclamo(new.datos,d.orden_id);new.datos:=public.plan_fuentes_contratacion_actividades(new.datos,d.orden_id);end if;');
 def:=replace(def,'''cronogramaJSON'',''fechaLimitePrevista''','''cronogramaJSON'',''contratacionJSON'',''fechaLimitePrevista''');execute def;
end $$;

-- Link saved plan identities without deleting historic OT participants. Names are
-- canonical directory values; duplicate names cannot select a different company.
create function public.plan_contratacion_proyectar_ot() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.plan_documentos;cfg jsonb;names text[];actual text[];
begin
 select * into d from public.plan_documentos where id=new.documento_id;
 if d.tipo<>'relevamiento' then return new;end if;
 cfg:=public.plan_contrataciones_config(new.datos);if cfg is null then return new;end if;
 select coalesce(array_agg(distinct k.nombre order by k.nombre),'{}') into names from jsonb_array_elements(cfg->'contrataciones') c join public.plan_contratistas k on k.id=(c->>'contratistaId')::uuid and k.tenant_id=d.tenant_id;
 select contratistas into actual from public.ordenes where id=d.orden_id for update;
 if not names<@coalesce(actual,'{}') then update public.ordenes set contratistas=(select array_agg(distinct n order by n) from unnest(coalesce(actual,'{}')||names) n) where id=d.orden_id;end if;
 return new;
end $$;
create trigger plan_contratacion_proyectar_ot after insert on public.plan_documento_revisiones for each row execute function public.plan_contratacion_proyectar_ot();

create function public.plan_presupuesto_validar_plan(p_orden uuid,p_contratista uuid,p_datos jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_documento_revisiones;d public.plan_documentos;cfg jsonb;c jsonb;item jsonb;
begin
 if coalesce(p_datos->>'documento_revision','') !~* '^[0-9a-f-]{36}$' or coalesce(p_datos->>'contratacion_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'Generá el presupuesto desde una contratación con costo del Plan de Trabajo guardado' using errcode='22023';end if;
 select * into r from public.plan_documento_revisiones where id=(p_datos->>'documento_revision')::uuid;
 select * into d from public.plan_documentos where id=r.documento_id;
 if d.orden_id is distinct from p_orden or d.tipo is distinct from 'relevamiento' then raise exception 'El plan de origen no pertenece a esta OT' using errcode='22023';end if;
 perform 1 from public.plan_documentos where id=d.id for share;
 if r.borrador_version is distinct from (select version from public.plan_documento_borradores where documento_id=d.id) then raise exception 'El Plan de Trabajo tiene una nueva versión. Revisá el presupuesto y elegí la versión vigente' using errcode='40001';end if;
 cfg:=public.plan_contrataciones_config(r.datos);
 select x into c from jsonb_array_elements(coalesce(cfg->'contrataciones','[]')) x where x->>'id'=p_datos->>'contratacion_id' and x->>'contratistaId'=p_contratista::text;
 if c is null or c->>'costo'<>'con_costo' then raise exception 'Esta contratación no tiene costo o no corresponde al contratista' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(coalesce(p_datos->'items','[]')) loop
  if not ((c->'actividadIds') ? coalesce(item->>'actividad_id','')) then raise exception 'Cada ítem debe referenciar una actividad contratada de este plan' using errcode='22023';end if;
 end loop;
end $$;

do $$declare def text;anchor text:=' -- Serialize versions, decisions, invoices and payments on the same budget.';begin
 def:=pg_get_functiondef('public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid)'::regprocedure);
 if position(anchor in def)=0 or position('''documento_revision'',doc.id);' in def)=0 then raise exception 'El guardado de presupuesto cambió. Revisá la instalación.';end if;
 def:=replace(def,anchor,E' perform public.plan_presupuesto_validar_plan(p_orden,p_contratista,p_datos);\n'||anchor);
 def:=replace(def,'''documento_revision'',doc.id);','''documento_revision'',doc.id,''contratacion_id'',p_datos->>''contratacion_id'');');
 def:=replace(def,'''id'',doc.id,''version'',doc.borrador_version,''sha256'',doc.contenido_sha256','''id'',doc.id,''version'',doc.borrador_version,''sha256'',doc.contenido_sha256,''codigo'',(select codigo from public.plan_documentos where id=doc.documento_id)');execute def;
end $$;

create function public.plan_presupuestos_planes(p_orden uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'codigo',d.codigo,'version',r.borrador_version,'contrataciones',public.plan_contrataciones_config(r.datos),'actividades',coalesce(r.datos->'itemsAlcance','[]')) order by r.creada_en desc),'[]') from public.plan_documentos d join public.plan_documento_borradores b on b.documento_id=d.id join public.plan_documento_revisiones r on r.documento_id=d.id and r.borrador_version=b.version where d.orden_id=p_orden and d.tipo='relevamiento'
$$;
do $$declare def text;anchor text:='from public.ordenes o join public.proyectos p on p.id=o.proyecto_id join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id)';begin
 def:=pg_get_functiondef('public.plan_presupuestos_leer(uuid,uuid)'::regprocedure);
 if position(anchor in def)=0 then raise exception 'La consulta de presupuestos cambió. Revisá la instalación.';end if;
 def:=replace(def,') documentos',') documentos,public.plan_presupuestos_planes(o.id) planes');
 if position(' planes' in def)=0 then raise exception 'No se pudo vincular la consulta de planes.';end if;execute def;
end $$;

-- A work editor may register a pending contractor for that work's company.
-- Existing directory records are never overwritten by this scoped create RPC.
create unique index plan_directorio_alta_plan_solicitud on public.plan_directorio_eventos(actor,(datos->>'alta_plan_solicitud')) where datos ? 'alta_plan_solicitud';
create function public.plan_contratista_crear_desde_plan(p_orden uuid,p_datos jsonb,p_solicitud uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes;tid uuid;k uuid;d jsonb;request_hash text;e public.plan_directorio_eventos;result jsonb;kv record;
begin
 o:=public.plan_comercio_orden(p_orden,'ot.editar');
 if not public.plan_permiso_proyecto('informe.editar',o.proyecto_id) then raise exception 'Sin permiso para contratar desde este plan' using errcode='42501';end if;
 select tenant_id into tid from public.proyectos where id=o.proyecto_id;
 if p_solicitud is null or jsonb_typeof(p_datos) is distinct from 'object' or length(p_datos::text)>5000 then raise exception 'Ficha inválida' using errcode='22023';end if;
 for kv in select * from jsonb_each(p_datos) loop if kv.key not in ('nombre','identificacion','especialidad','telefono','correo') or jsonb_typeof(kv.value) is distinct from 'string' or length(kv.value#>>'{}')>254 then raise exception 'Campo de alta no permitido' using errcode='22023';end if;end loop;
 if coalesce(length(btrim(p_datos->>'nombre')),0) not between 1 and 160 or coalesce(length(p_datos->>'identificacion'),0)>80 or coalesce(length(p_datos->>'telefono'),0)>80 or nullif(p_datos->>'correo','') is not null and p_datos->>'correo' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Revisá nombre, identificación, teléfono y correo' using errcode='22023';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_orden,p_datos)::text,'UTF8')),'hex');
 select * into e from public.plan_directorio_eventos where actor=auth.uid() and datos->>'alta_plan_solicitud'=p_solicitud::text;
 if e.id is not null then
  if e.actor is distinct from auth.uid() or e.tenant_id is distinct from tid or e.datos->>'alta_plan_sha256' is distinct from request_hash then raise exception 'Solicitud de alta reutilizada con otros datos' using errcode='22023';end if;k:=e.ficha_id;
 else
  insert into public.plan_contratistas(tenant_id,nombre,creado_por) values(tid,btrim(p_datos->>'nombre'),auth.uid()) returning id into k;
  insert into public.plan_contratista_fichas(contratista_id,tenant_id,identificacion,telefono,correo,activo) values(k,tid,nullif(btrim(p_datos->>'identificacion'),''),nullif(btrim(p_datos->>'telefono'),''),nullif(btrim(p_datos->>'correo'),''),true);
  d:=p_datos||jsonb_build_object('tipo','independiente','activo',true);
  insert into public.plan_directorio_perfiles(tipo,id,tenant_id,contratista_id,datos,completa,activo,creado_por,actualizado_por) values('contratista',k,tid,k,d,false,true,auth.uid(),auth.uid());
  insert into public.plan_directorio_eventos(tipo,ficha_id,tenant_id,actor,datos) values('contratista',k,tid,auth.uid(),d||jsonb_build_object('alta_plan_sha256',request_hash,'alta_plan_solicitud',p_solicitud,'orden_origen',p_orden));
 end if;
 select to_jsonb(f) into result from public.plan_fichas_contratistas_obra(o.proyecto_id) f where f.id=k;return result;
exception when unique_violation then raise exception 'Ya existe un contratista con ese nombre. Seleccionalo del directorio.' using errcode='23505';
end $$;

revoke all on function public.plan_contrataciones_config(jsonb),public.plan_validar_contratacion_plan(jsonb,uuid),public.plan_fuentes_contratacion_actividades(jsonb,uuid),public.plan_contratacion_proyectar_ot(),public.plan_presupuesto_validar_plan(uuid,uuid,jsonb),public.plan_presupuestos_planes(uuid),public.plan_contratista_crear_desde_plan(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.plan_contratista_crear_desde_plan(uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
