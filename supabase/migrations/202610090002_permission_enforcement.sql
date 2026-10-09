begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Membership writes are exclusively through validated transactional RPCs.
revoke insert,update,delete on public.proyecto_miembros,public.tenant_miembros from authenticated,anon;

-- Keep the proven tenant/work checks and add live ancestor revocation.
do $$ declare r record;begin
 for r in select * from (values ('plan_es_miembro_proyecto','plan_miembro_proyecto_legacy'),('plan_puede_editar_proyecto','plan_editar_proyecto_legacy'),('plan_es_supervisor_proyecto','plan_supervisor_proyecto_legacy')) x(original,copia) loop
 execute replace(pg_get_functiondef(to_regprocedure('public.'||r.original||'(uuid)')),'FUNCTION public.'||r.original||'(','FUNCTION public.'||r.copia||'(');
 end loop;
end $$;
revoke all on function public.plan_miembro_proyecto_legacy(uuid),public.plan_editar_proyecto_legacy(uuid),public.plan_supervisor_proyecto_legacy(uuid) from public,anon,authenticated;
create or replace function public.plan_es_miembro_proyecto(p_proyecto_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select public.plan_miembro_proyecto_legacy(p_proyecto_id) and (public.plan_es_creador() or exists(select 1 from public.proyectos p where p.id=p_proyecto_id and (p.tenant_id is null or public.plan_equipo_obra_usuario(p.tenant_id,auth.uid(),p.id))));
$$;
create or replace function public.plan_puede_editar_proyecto(p_proyecto_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select public.plan_editar_proyecto_legacy(p_proyecto_id) and public.plan_es_miembro_proyecto(p_proyecto_id);
$$;
create or replace function public.plan_es_supervisor_proyecto(p_proyecto_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select public.plan_supervisor_proyecto_legacy(p_proyecto_id) and public.plan_es_miembro_proyecto(p_proyecto_id);
$$;
revoke all on function public.plan_es_miembro_proyecto(uuid),public.plan_puede_editar_proyecto(uuid),public.plan_es_supervisor_proyecto(uuid) from public,anon,authenticated;
grant execute on function public.plan_es_miembro_proyecto(uuid),public.plan_puede_editar_proyecto(uuid),public.plan_es_supervisor_proyecto(uuid) to authenticated;

-- Restrictive read policies coexist with the original permissive policies.
do $$ declare r record;begin
 for r in select * from (values
 ('ordenes','ot.ver'),('fotos','foto.ver'),('comentarios_ot','conversacion.ver'),('ot_comentarios','conversacion.ver'),
 ('orden_costos','costos.ver'),('versiones','ot.historial'),('ordenes_eliminadas','ot.historial'),('campos_definicion','campo.ver'),
 ('plan_documentos','informe.ver'),('plan_documento_revisiones','informe.ver'),('plan_documento_candidatos','informe.ver'),('plan_documento_emisiones','informe.ver')
 ) as x(tabla,clave) loop
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.tabla and column_name='proyecto_id') then
  execute format('create policy plan_permiso_lectura on public.%I as restrictive for select to authenticated using(public.plan_permiso_proyecto(%L,proyecto_id))',r.tabla,r.clave);
 end if;
 end loop;
end $$;

create function public.plan_exigir_accion(p_clave text,p_proyecto uuid,p_tenant uuid default null) returns void
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
 if auth.uid() is null or public.plan_es_creador() then return;end if;
 if not (case when p_proyecto is not null then public.plan_permiso_proyecto(p_clave,p_proyecto) else public.plan_tiene_permiso(p_clave,p_tenant) end) then raise exception 'No tenés autorización para: %',p_clave using errcode='42501';end if;
end $$;
-- Triggers also cover direct REST writes and SECURITY DEFINER RPCs. A UI-only
-- switch is never considered sufficient authorization for a database mutation.
create function public.plan_validar_accion_fila() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 b jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 p uuid;tid uuid;k text;prefix text;operation text;
begin
 if auth.uid() is null or public.plan_es_creador() then if tg_op='DELETE' then return old;else return new;end if;end if;
 p:=nullif(a->>'proyecto_id','')::uuid;tid:=nullif(a->>'tenant_id','')::uuid;
 operation:=case tg_op when 'INSERT' then 'crear' when 'DELETE' then 'eliminar' else 'editar' end;
 if tg_table_name='ordenes' then
  -- Preserve the existing narrow undo-creation RPC without granting general
  -- deletion. Direct DELETE still needs its RLS policy; no client-set flag is trusted.
  if tg_op='DELETE' and (a->>'created_by')::uuid=auth.uid()
    and (a->>'created_at')::timestamptz>=now()-interval '15 minutes'
    and a->>'estado'='Pendiente' and a->>'deleted_at' is null
    and public.plan_permiso_proyecto('ot.crear',p)
    and not exists(select 1 from public.fotos where orden_id=(a->>'id')::uuid)
    and not exists(select 1 from public.ot_comentarios where orden_id=(a->>'id')::uuid)
    and not exists(select 1 from public.comentarios_ot where orden_id=(a->>'id')::uuid)
    and not exists(select 1 from public.plan_documentos where orden_id=(a->>'id')::uuid)
    then return old;
  elsif tg_op<>'UPDATE' then perform public.plan_exigir_accion('ot.'||operation,p);
  else
   if a->'deleted_at' is distinct from b->'deleted_at' then perform public.plan_exigir_accion(case when a->>'deleted_at' is null then 'ot.restaurar' else 'ot.eliminar' end,p);end if;
   if a->'estado' is distinct from b->'estado' then perform public.plan_exigir_accion(case when a->>'estado' in ('cerrada','Cerrada') then 'ot.cerrar' when b->>'estado' in ('cerrada','Cerrada') then 'ot.reabrir' else 'ot.estado' end,p);end if;
   foreach k in array array['rubro','rubro_secundario','prioridad','nivel_riesgo','reincidencia','en_garantia','potencialmente_conflictivo','asiste_facility'] loop if a->k is distinct from b->k then perform public.plan_exigir_accion('ot.clasificar',p);end if;end loop;
   foreach k in array array['responsable','responsable_id','contratistas'] loop if a->k is distinct from b->k then perform public.plan_exigir_accion('ot.asignar',p);end if;end loop;
   if a->'pos_x' is distinct from b->'pos_x' or a->'pos_y' is distinct from b->'pos_y' then perform public.plan_exigir_accion('ot.ubicacion',p);end if;
   if exists(select 1 from public.campos_definicion c where c.proyecto_id=p and (a->'campos'->c.id::text) is distinct from (b->'campos'->c.id::text)) then perform public.plan_exigir_accion('campo.editar',p);end if;
   if a->'costo' is distinct from b->'costo' then perform public.plan_exigir_accion('costos.editar',p);end if;
   if (a-array['estado','deleted_at','rubro','rubro_secundario','prioridad','nivel_riesgo','reincidencia','en_garantia','potencialmente_conflictivo','asiste_facility','responsable','responsable_id','contratistas','pos_x','pos_y','costo','updated_at','updated_by','revision']) is distinct from (b-array['estado','deleted_at','rubro','rubro_secundario','prioridad','nivel_riesgo','reincidencia','en_garantia','potencialmente_conflictivo','asiste_facility','responsable','responsable_id','contratistas','pos_x','pos_y','costo','updated_at','updated_by','revision']) then perform public.plan_exigir_accion('ot.editar',p);end if;
  end if;
 elsif tg_table_name='proyectos' then
  if tg_op='INSERT' then perform public.plan_exigir_accion(case when a->>'proyecto_padre_id' is null then 'obra.crear' else 'proyecto.crear' end,nullif(a->>'proyecto_padre_id','')::uuid,tid);
  else
   p:=(a->>'id')::uuid;
   if tg_op='DELETE' or a->'deleted_at' is distinct from b->'deleted_at' then perform public.plan_exigir_accion(case when coalesce((a->>'es_ficha_obra')::boolean,false) then 'obra.eliminar' else 'proyecto.eliminar' end,p);
   elsif a->'carpeta_id' is distinct from b->'carpeta_id' then perform public.plan_exigir_accion('proyecto.mover',p);
   else perform public.plan_exigir_accion(case when coalesce((a->>'es_ficha_obra')::boolean,false) then 'obra.editar' else 'proyecto.editar' end,p);end if;
  end if;
 elsif tg_table_name='plan_carpetas' then
  if tg_op='UPDATE' and (a->'padre_id' is distinct from b->'padre_id' or a->'profundidad' is distinct from b->'profundidad') then operation:='mover';end if;
  perform public.plan_exigir_accion('carpeta.'||operation,null,tid);
 elsif tg_table_name='fotos' then perform public.plan_exigir_accion('foto.'||case when tg_op='INSERT' then 'cargar' else operation end,p);
 elsif tg_table_name in ('comentarios_ot','ot_comentarios') then perform public.plan_exigir_accion('conversacion.'||operation,p);
 elsif tg_table_name='orden_costos' then perform public.plan_exigir_accion('costos.editar',p);
 elsif tg_table_name='campos_definicion' then perform public.plan_exigir_accion('campo.configurar',p);
 elsif tg_table_name='plan_documentos' then perform public.plan_exigir_accion(case when tg_op='INSERT' then 'informe.crear' else 'informe.editar' end,p);
 elsif tg_table_name in ('plan_documento_borradores','plan_documento_revisiones') then
  select proyecto_id into p from public.plan_documentos where id=(a->>'documento_id')::uuid;
  perform public.plan_exigir_accion('informe.editar',p);
 elsif tg_table_name='plan_documento_candidatos' then
  select proyecto_id into p from public.plan_documentos where id=(a->>'documento_id')::uuid;perform public.plan_exigir_accion('informe.preparar',p);
 elsif tg_table_name='plan_documento_aprobaciones' then
  select d.proyecto_id into p from public.plan_documento_candidatos c join public.plan_documentos d on d.id=c.documento_id where c.id=(a->>'candidato_id')::uuid;perform public.plan_exigir_accion('informe.aprobar',p);
 elsif tg_table_name='plan_documento_emisiones' then
  select proyecto_id into p from public.plan_documentos where id=(a->>'documento_id')::uuid;perform public.plan_exigir_accion('informe.emitir',p);
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$ declare tabla text;begin
 foreach tabla in array array['ordenes','proyectos','plan_carpetas','fotos','comentarios_ot','ot_comentarios','orden_costos','campos_definicion','plan_documentos','plan_documento_borradores','plan_documento_revisiones','plan_documento_candidatos','plan_documento_aprobaciones','plan_documento_emisiones'] loop
 execute format('create trigger aa_plan_validar_accion before insert or update or delete on public.%I for each row execute function public.plan_validar_accion_fila()',tabla);
 end loop;
end $$;
revoke all on function public.plan_exigir_accion(text,uuid,uuid),public.plan_validar_accion_fila() from public,anon,authenticated;

do $$ begin execute replace(pg_get_functiondef('public.plan_storage_permitido(text,text,text)'::regprocedure),'FUNCTION public.plan_storage_permitido(','FUNCTION public.plan_storage_permitido_legacy(');end $$;
revoke all on function public.plan_storage_permitido_legacy(text,text,text) from public,anon,authenticated;
create or replace function public.plan_storage_permitido(p_bucket text,p_name text,p_action text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p uuid;clave text;
begin
 if not public.plan_storage_permitido_legacy(p_bucket,p_name,p_action) then return false;end if;
 if public.plan_es_creador() then return true;end if;
 p:=public.plan_storage_proyecto(p_bucket,p_name);
 clave:=case p_bucket when 'fotos' then case p_action when 'read' then 'foto.ver' when 'delete' then 'foto.eliminar' else 'foto.cargar' end when 'exports' then case p_action when 'read' then 'informe.ver' else 'informe.preparar' end else case p_action when 'read' then 'proyecto.ver' when 'delete' then 'proyecto.eliminar' else 'proyecto.editar' end end;
 if p is not null then return public.plan_permiso_proyecto(clave,p);end if;
 return exists(select 1 from public.plan_archivos_legados a where a.bucket_id=p_bucket and a.object_name=p_name and public.plan_permiso_proyecto(clave,a.proyecto_id));
end $$;
revoke all on function public.plan_storage_permitido(text,text,text) from public,anon,authenticated;
grant execute on function public.plan_storage_permitido(text,text,text) to authenticated;

alter function public.plan_contexto_acceso() rename to plan_contexto_acceso_legacy;
revoke all on function public.plan_contexto_acceso_legacy() from public,anon,authenticated;
create function public.plan_contexto_acceso() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare c jsonb;companies jsonb;works jsonb;
begin
 -- Reproduce the old invoker result explicitly: a definer must never select
 -- every tenant/project on behalf of a client.
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'nombre',t.nombre,'activa',t.activo,
 'rol',case when public.plan_es_creador() then 'creador' else m.rol end,'puede_crear',public.plan_tiene_permiso('obra.crear',t.id),
 'permisos',(select coalesce(jsonb_agg(clave),'[]') from public.plan_permiso_catalogo where public.plan_tiene_permiso(clave,t.id))) order by t.id),'[]') into companies
 from public.tenants t left join public.tenant_miembros m on m.tenant_id=t.id and m.user_id=auth.uid() and m.activo
 where public.plan_es_creador() or (m.user_id is not null and t.activo);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'nombre',p.nombre,
 'editar',public.plan_puede_editar_proyecto(p.id),'administrar',public.plan_es_supervisor_proyecto(p.id),'ver_costos',public.plan_es_supervisor_proyecto(p.id) and public.plan_permiso_proyecto('costos.ver',p.id),
 'permisos',(select coalesce(jsonb_agg(clave),'[]') from public.plan_permiso_catalogo where public.plan_permiso_proyecto(clave,p.id))) order by p.id),'[]') into works from public.proyectos p where p.deleted_at is null and public.plan_es_miembro_proyecto(p.id);
 c:=jsonb_build_object('creador',public.plan_es_creador(),'empresas',companies,'obras',works,'permisos_version',1);
 return c;
end $$;
revoke all on function public.plan_contexto_acceso() from public,anon,authenticated;
grant execute on function public.plan_contexto_acceso() to authenticated;
notify pgrst,'reload schema';
commit;
