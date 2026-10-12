-- Master data belongs to Administration/OT. New revisions may not invent an
-- identity or rewrite a referenced event/plan. No historical row is updated.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function public.plan_documento_contexto_campos(p_orden uuid,p_tipo text,p_vinculos jsonb default '{}',p_documento uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare
 o public.ordenes;p public.proyectos;obra public.proyectos;c public.plan_clientes;u public.plan_cliente_ubicaciones;
 perfil jsonb;identidad jsonb;protegidos jsonb:='{}';opciones jsonb:='{}';vinculos jsonb:='{}';
 refs jsonb:='{}';r record;k text;v text;datos jsonb;items jsonb:=null;
 personas jsonb:='[]';tecnicos jsonb:='[]';persona jsonb;cuenta jsonb;
 origen jsonb;plan jsonb;cierre jsonb;legado jsonb:='{}';principal record;
begin
 select * into o from public.ordenes where id=p_orden and deleted_at is null;
 select * into p from public.proyectos where id=o.proyecto_id and deleted_at is null;
 select * into obra from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id) and tenant_id=p.tenant_id and deleted_at is null;
 if auth.uid() is null or p.id is null or not public.plan_permiso_proyecto('informe.ver',p.id) then
  raise exception 'Sin acceso al documento de esta OT' using errcode='42501';end if;
 if p_tipo is null or p_tipo not in ('orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta') or
    jsonb_typeof(p_vinculos) is distinct from 'object' then raise exception 'Contexto documental inválido' using errcode='22023';end if;
 if p_documento is not null then
  if not exists(select 1 from public.plan_documentos d where d.id=p_documento and d.orden_id=o.id and d.tipo=p_tipo and d.proyecto_id=p.id) then raise exception 'Documento fuera de esta OT' using errcode='42501';end if;
  select coalesce(b.datos,'{}') into legado from public.plan_documento_borradores b where b.documento_id=p_documento;
 end if;
 -- Join the exact location, never another location of the same client.
 select cl.* into c from public.plan_clientes cl join public.plan_cliente_ubicaciones ub on ub.cliente_id=cl.id and ub.tenant_id=cl.tenant_id
 where cl.id=o.cliente_id and ub.id=o.cliente_ubicacion_id and ub.proyecto_id=p.id and cl.tenant_id=p.tenant_id;
 select * into u from public.plan_cliente_ubicaciones where id=o.cliente_ubicacion_id and cliente_id=c.id and proyecto_id=p.id and tenant_id=p.tenant_id;
 select dp.datos into perfil from public.plan_directorio_perfiles dp where dp.tipo='obra' and dp.id=obra.id and dp.tenant_id=p.tenant_id;
 select co.nombre,co.telefono,co.correo into principal from public.plan_contacto_vinculos cv join public.plan_contactos co on co.id=cv.contacto_id and co.tenant_id=cv.tenant_id
 where cv.cliente_id=c.id and cv.activo and cv.principal order by cv.id limit 1;
 identidad:=jsonb_build_object(
  'obra',coalesce(nullif(obra.nombre,''),nullif(p.nombre,''),o.obra,''),'unidad_amenities',coalesce(nullif(u.unidad,''),nullif(u.sector,''),o.unidad_amenities,''),
  'ubicacion',coalesce(o.ubicacion,''),'responsable',case when o.responsable_id is not null then coalesce((select nullif(btrim(concat_ws(' ',a.raw_user_meta_data->>'nombre',a.raw_user_meta_data->>'apellidos')),'') from auth.users a where a.id=o.responsable_id),o.responsable,'') else '' end,
  'rubro',coalesce(o.rubro,''),'fecha_ingreso',coalesce(o.fecha_ingreso::text,''),'descripcion',coalesce(o.descripcion,''),
  'cliente',coalesce(c.nombre,''),'identificacion',coalesce(c.identificacion,''),'contacto',coalesce(principal.nombre,c.contacto,''),
  'telefono',coalesce(principal.telefono,c.telefono,''),'correo',coalesce(principal.correo,c.correo,''),'domicilio',coalesce(c.direccion,''),
  'direccion_obra',coalesce(nullif(perfil->>'direccion',''),u.direccion,''),'piso',coalesce(u.piso,''));

 -- Only immutable revisions, and only from this OT, are offered as references.
 foreach k in array array['orden_servicio','visita','relevamiento','avance','cierre'] loop
  select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'nombre',d.codigo||' · R'||rr.revision,'detalle',d.tipo) order by d.folio desc,rr.revision desc),'[]') into datos
  from public.plan_documentos d join public.plan_documento_revisiones rr on rr.documento_id=d.id
  where d.orden_id=o.id and d.proyecto_id=p.id and d.tenant_id=p.tenant_id and d.ciclo=1 and d.tipo=k
   and (k<>'relevamiento' or p_tipo not in ('avance','cierre') or rr.datos->'relevamiento'->>'decisionAlcance'='Aprobado con referencia');
  opciones:=opciones||jsonb_build_object(k,datos);
  v:=nullif(p_vinculos->>k,'');
  if v is not null and not exists(select 1 from jsonb_array_elements(datos) x where x->>'id'=v) then
   raise exception 'La referencia no pertenece a esta OT: %',k using errcode='42501';end if;
  v:=coalesce(v,datos->0->>'id');
  if v is not null then
   select rr.datos,d.codigo||' · R'||rr.revision as etiqueta into r from public.plan_documento_revisiones rr join public.plan_documentos d on d.id=rr.documento_id where rr.id=v::uuid;
   refs:=refs||jsonb_build_object(k,jsonb_build_object('datos',r.datos,'etiqueta',r.etiqueta));
   vinculos:=vinculos||jsonb_build_object(k,v);
  end if;
 end loop;
 origen:=coalesce(refs->'orden_servicio'->'datos'->'origen','{}');
 plan:=coalesce(refs->'relevamiento'->'datos','{}');cierre:=coalesce(refs->'cierre'->'datos','{}');
 if p_tipo<>'orden_servicio' and refs ? 'orden_servicio' then
  identidad:=jsonb_set(identidad,'{descripcion}',coalesce(refs->'orden_servicio'->'datos'->'identificacion'->'descripcion',identidad->'descripcion'));
 end if;

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nombre',coalesce(nullif(btrim(concat_ws(' ',a.raw_user_meta_data->>'nombre',a.raw_user_meta_data->>'apellidos')),''),a.email,a.id::text),'detalle',pm.rol) order by a.id),'[]') into tecnicos
 from public.proyecto_miembros pm join public.tenant_miembros tm on tm.user_id=pm.user_id and tm.tenant_id=p.tenant_id and tm.activo join auth.users a on a.id=pm.user_id
 where pm.proyecto_id=p.id and pm.rol in ('supervisor','tecnico') and (public.plan_permiso_proyecto('ot.asignar',p.id) or pm.user_id=o.responsable_id);
 v:=coalesce(nullif(p_vinculos->>'tecnico',''),o.responsable_id::text);
 if v is not null then
  select x into cuenta from jsonb_array_elements(tecnicos) x where x->>'id'=v;
  if cuenta is null then raise exception 'Seleccioná un técnico autorizado de esta obra' using errcode='42501';end if;
  vinculos:=vinculos||jsonb_build_object('tecnico',v);
 end if;
 opciones:=opciones||jsonb_build_object('tecnico',tecnicos);
 if c.id is not null then personas:=jsonb_build_array(jsonb_build_object('id','cliente:'||c.id,'nombre',c.nombre,'detalle','Cliente vinculado','documento',coalesce(c.identificacion,''),'organizacion',coalesce((select dp.datos->>'razon_social' from public.plan_directorio_perfiles dp where dp.tipo='cliente' and dp.id=c.id),''),'cargo',''));end if;
 select personas||coalesce(jsonb_agg(jsonb_build_object('id','contacto:'||co.id,'nombre',co.nombre,'detalle',cv.funcion,'documento',coalesce(dp.datos->>'identificacion',''),'organizacion','','cargo',cv.funcion) order by co.nombre),'[]') into personas
 from public.plan_contactos co join public.plan_contacto_vinculos cv on cv.contacto_id=co.id and cv.tenant_id=co.tenant_id left join public.plan_directorio_perfiles dp on dp.tipo='contacto' and dp.id=co.id
 where co.tenant_id=p.tenant_id and co.activo and cv.activo and (cv.obra_id in (p.id,obra.id) or cv.cliente_id=c.id or cv.ubicacion_id=u.id);
 -- Keep each linked person once, even when linked to both client and work.
 select coalesce(jsonb_agg(x),'[]') into personas from (select distinct on (j->>'id') j as x from jsonb_array_elements(personas) j order by j->>'id') unique_personas;
 foreach k in array array['receptor','respondente'] loop
  v:=coalesce(nullif(p_vinculos->>k,''),case when c.id is not null then 'cliente:'||c.id end);
  if v is not null then
   select x into persona from jsonb_array_elements(personas) x where x->>'id'=v;
   if persona is null then raise exception 'Seleccioná una persona vinculada a esta OT' using errcode='42501';end if;
   vinculos:=vinculos||jsonb_build_object(k,v);
  end if;
  opciones:=opciones||jsonb_build_object(k,personas);
 end loop;

 if p_tipo='visita' then protegidos:=jsonb_build_object('edificio',identidad->>'obra','unidad',identidad->>'unidad_amenities','propietario',coalesce(origen->>'solicitante',identidad->>'cliente'),'contacto',coalesce(origen->>'contacto',identidad->>'telefono'),'responsableVisita',coalesce(cuenta->>'nombre',''));
 elsif p_tipo='relevamiento' then protegidos:=jsonb_build_object('tecnico',coalesce(cuenta->>'nombre',''),'visitaReferencia',coalesce(refs->'visita'->>'etiqueta',''),'antecedentes',identidad->>'descripcion');
 elsif p_tipo='avance' or p_tipo='cierre' then
  protegidos:=jsonb_build_object('alcanceReferencia',coalesce(refs->'relevamiento'->>'etiqueta',''));
  select coalesce(jsonb_agg(case when p_tipo='avance' then jsonb_build_object('id',x->>'id','previsto',coalesce(x->>'trabajo','')) else jsonb_build_object('id',x->>'id','trabajo',coalesce(x->>'trabajo',''),'criterio',coalesce(x->>'criterio','')) end),'[]') into items from jsonb_array_elements(coalesce(plan->'itemsAlcance','[]')) x;
  if p_tipo='cierre' then protegidos:=protegidos||jsonb_build_object('inicioReal',coalesce(left(o.fecha_inicio_trabajos::text,10),''),'finReal',coalesce(left(o.fecha_fin_trabajos::text,10),''),'cambiosAprobados',coalesce(legado->'cierre'->>'cambiosAprobados',''),'autorizacionInterna',coalesce(legado->'cierre'->>'autorizacionInterna',''));end if;
 elsif p_tipo='acta' then
  select x into persona from jsonb_array_elements(personas) x where x->>'id'=vinculos->>'receptor';
  protegidos:=jsonb_build_object('receptor',coalesce(persona->>'nombre',''),'documentoReceptor',coalesce(persona->>'documento',''),'organizacion',coalesce(persona->>'organizacion',''),'cierreReferencia',coalesce(refs->'cierre'->>'etiqueta',''),'objetoEntrega',coalesce(cierre->'cierre'->>'ejecucionPorItem',''),'anexosEntregados',coalesce(cierre->'cierre'->>'entregables',''),'garantiaReferencia',coalesce(legado->'acta'->>'garantiaReferencia',''),'garantiaCondiciones',coalesce(legado->'acta'->>'garantiaCondiciones',''));
 elsif p_tipo='encuesta' then
  select x into persona from jsonb_array_elements(personas) x where x->>'id'=vinculos->>'respondente';
  protegidos:=jsonb_build_object('respondente',coalesce(persona->>'nombre',''));
 end if;
 return jsonb_build_object('identificacion',identidad,'protegidos',protegidos,'items',items,'vinculos',vinculos,'opciones',opciones);
end $$;
revoke all on function public.plan_documento_contexto_campos(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.plan_documento_contexto_campos(uuid,text,jsonb,uuid) to authenticated;

-- The guard runs even if a stale client calls the existing save RPC directly.
create function public.plan_documento_proteger_campos() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.plan_documentos;ctx jsonb;k text;v jsonb;key text;identidad jsonb;campos jsonb;
 item jsonb;base jsonb;lista jsonb:='[]';itemkey text;doc_prev jsonb;decision text;
begin
 select * into d from public.plan_documentos where id=new.documento_id;
 if d.id is null or not public.plan_permiso_proyecto('informe.editar',d.proyecto_id) then raise exception 'Sin permiso para editar este informe' using errcode='42501';end if;
 -- Serialize source changes with this save; a revision cannot capture a stale
 -- identity followed by a newer source snapshot in the same transaction.
 perform 1 from public.ordenes where id=d.orden_id for share;
 perform 1 from public.proyectos where id=d.proyecto_id for share;
 ctx:=public.plan_documento_contexto_campos(d.orden_id,d.tipo,coalesce(new.datos->'vinculos','{}'),d.id);
 identidad:=coalesce(new.datos->'identificacion','{}');
 if jsonb_typeof(identidad)<>'object' then raise exception 'Identificación inválida' using errcode='22023';end if;
 for k,v in select * from jsonb_each(ctx->'identificacion') loop
  if k='ubicacion' then continue;end if;
  if identidad ? k and identidad->k is distinct from v then raise exception 'El dato % procede de Administración o de la OT. Actualizá su fuente y reabrí el informe.',k using errcode='22023';end if;
 end loop;
 identidad:=(ctx->'identificacion')||jsonb_build_object('ubicacion',coalesce(identidad->'ubicacion',ctx->'identificacion'->'ubicacion'));
 key:=case when d.tipo='orden_servicio' then 'origen' else d.tipo end;
 campos:=coalesce(new.datos->key,'{}');
 if jsonb_typeof(campos)<>'object' then raise exception 'Campos documentales inválidos' using errcode='22023';end if;
 for k,v in select * from jsonb_each(ctx->'protegidos') loop
  if campos ? k and campos->k is distinct from v then raise exception 'El dato % es heredado. Cambiá la fuente o seleccioná su referencia.',k using errcode='22023';end if;
 end loop;
 campos:=campos||(ctx->'protegidos');
 -- Approved plans/warranty decisions require the documentary approval action;
 -- technicians may still propose a plan and record their technical findings.
 if tg_op='UPDATE' then doc_prev:=old.datos;else select b.datos into doc_prev from public.plan_documento_borradores b where b.documento_id=new.documento_id;doc_prev:=coalesce(doc_prev,'{}');end if;
 new.datos:=new.datos-'decisionPlan';
 if d.tipo='relevamiento' then
  foreach k in array array['decisionAlcance','decisionGarantia'] loop
   decision:=campos->>k;
   if decision is distinct from doc_prev->key->>k and ((k='decisionAlcance' and decision='Aprobado con referencia') or (k='decisionGarantia' and decision in ('Aplica con fundamento','No aplica con fundamento'))) and not public.plan_permiso_proyecto('informe.aprobar',d.proyecto_id) then
    raise exception 'Sin permiso para registrar esta decisión' using errcode='42501';end if;
  end loop;
  if campos->>'decisionAlcance'='Aprobado con referencia' then
   if nullif(btrim(campos->>'cronograma'),'') is null then raise exception 'Indicá la referencia de aprobación del plan' using errcode='22023';end if;
   if exists(select 1 from unnest(array['alcance','exclusiones','criterios','cronograma','inicioPrevisto','finPrevisto','condicionesOperativas']) q where coalesce(campos->>q,'') is distinct from coalesce(doc_prev->key->>q,'')) or coalesce(new.datos->'itemsAlcance','[]') is distinct from coalesce(doc_prev->'itemsAlcance','[]') then
    if not public.plan_permiso_proyecto('informe.aprobar',d.proyecto_id) then raise exception 'El plan cambió. Registralo como propuesto o pendiente de aprobación.' using errcode='42501';end if;
    new.datos:=new.datos||jsonb_build_object('decisionPlan',jsonb_build_object('actor',auth.uid(),'fecha',now(),'referencia',campos->>'cronograma'));
   else new.datos:=new.datos||jsonb_build_object('decisionPlan',doc_prev->'decisionPlan');end if;
  end if;
 end if;
 if d.tipo='acta' and coalesce(campos->>'decisionPreparada','Pendiente') not in ('','Pendiente') and nullif(btrim(campos->>'decisionReferencia'),'') is null then
  raise exception 'Indicá la referencia de la decisión expresada por el receptor. No equivale a una firma.' using errcode='22023';end if;
 if d.tipo='encuesta' and exists(select 1 from jsonb_each_text(campos) x where x.key in ('rapidez','plazoPrometido','calidadTrabajo','profesionalismo','confianza','recontratacion','recomendacion','sugerencias','satisfaccionGeneral','resolucion','comunicacion','expectativas') and nullif(btrim(x.value),'') is not null) and nullif(btrim(campos->>'referenciaFuente'),'') is null then
  raise exception 'Indicá la procedencia de las respuestas del cliente' using errcode='22023';end if;
 if d.tipo in ('avance','cierre') then
  itemkey:=case when d.tipo='avance' then 'itemsAvance' else 'itemsCierre' end;
  if jsonb_typeof(coalesce(new.datos->itemkey,'[]'))<>'array' then raise exception 'Actividades inválidas' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(coalesce(new.datos->itemkey,'[]')))<>(select count(distinct x->>'id') from jsonb_array_elements(coalesce(new.datos->itemkey,'[]')) x) then raise exception 'Actividades repetidas o sin identificador' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(coalesce(new.datos->itemkey,'[]')) loop
   select x into base from jsonb_array_elements(ctx->'items') x where x->>'id'=item->>'id';
   if base is null then raise exception 'La actividad no pertenece al plan referenciado' using errcode='22023';end if;
   for k,v in select * from jsonb_each(base) loop
    if item ? k and item->k is distinct from v then raise exception 'El alcance y sus criterios proceden del plan referenciado' using errcode='22023';end if;
   end loop;
  end loop;
  for base in select * from jsonb_array_elements(ctx->'items') loop
   select x into item from jsonb_array_elements(coalesce(new.datos->itemkey,'[]')) x where x->>'id'=base->>'id';
   lista:=lista||jsonb_build_array(coalesce(item,'{}')||base);
  end loop;
  new.datos:=jsonb_set(new.datos,array[itemkey],lista);
 end if;
 new.datos:=new.datos||jsonb_build_object('identificacion',identidad,key,campos,'vinculos',ctx->'vinculos','politicaCampos',1);
 return new;
end $$;
create trigger plan_documento_proteger_campos before insert or update on public.plan_documento_borradores for each row execute function public.plan_documento_proteger_campos();
revoke all on function public.plan_documento_proteger_campos() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
