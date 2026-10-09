begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Explicit actions replace role ceilings for ordinary editing. Sensitive
-- issuance/review checks remain in their own documentary procedures.
create or replace function public.plan_puede_editar_proyecto(p_proyecto_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select public.plan_es_creador() or (public.plan_es_miembro_proyecto(p_proyecto_id) and exists(
 select 1 from public.plan_permiso_catalogo c where c.clave in ('ot.crear','ot.editar','ot.clasificar','ot.asignar','ot.estado','ot.cerrar','ot.reabrir','ot.ubicacion','foto.cargar','foto.editar','informe.crear','informe.editar','proyecto.crear','proyecto.editar') and public.plan_permiso_proyecto(c.clave,p_proyecto_id)));
$$;
create or replace function public.plan_puede_crear_proyecto(p_tenant_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$select public.plan_tiene_permiso('obra.crear',p_tenant_id)$$;

create policy plan_permiso_proyectos_select on public.proyectos as restrictive for select to authenticated using(public.plan_permiso_proyecto('proyecto.ver',id));
create policy plan_permiso_proyectos_update on public.proyectos for update to authenticated using(public.plan_permiso_proyecto('proyecto.editar',id)) with check(public.plan_permiso_proyecto('proyecto.editar',id));
create policy plan_permiso_proyectos_delete on public.proyectos for delete to authenticated using(public.plan_permiso_proyecto('proyecto.eliminar',id));
create policy plan_permiso_ordenes_delete on public.ordenes for delete to authenticated using(public.plan_permiso_proyecto('ot.eliminar',proyecto_id));
-- Keep fotos_delete ownership/supervisor restrictions; the fine permission
-- trigger can revoke deletion, but must not silently authorize other people's photos.
create policy plan_permiso_costos_select on public.orden_costos for select to authenticated using(public.plan_permiso_proyecto('costos.ver',proyecto_id));
create policy plan_permiso_snapshots_costos on public.versiones as restrictive for select to authenticated using(public.plan_permiso_proyecto('costos.ver',proyecto_id));
create policy plan_permiso_eliminadas_costos on public.ordenes_eliminadas as restrictive for select to authenticated using(public.plan_permiso_proyecto('costos.ver',proyecto_id));
create policy plan_permiso_carpetas_select on public.plan_carpetas as restrictive for select to authenticated using(public.plan_tiene_permiso('carpeta.ver',tenant_id));
create policy plan_permiso_eventos_select on public.plan_ot_eventos as restrictive for select to authenticated using(public.plan_permiso_proyecto('ot.historial',proyecto_id));
create policy plan_permiso_borradores on public.plan_documento_borradores as restrictive for select to authenticated using(exists(select 1 from public.plan_documentos d where d.id=documento_id and public.plan_permiso_proyecto('informe.ver',d.proyecto_id)));
create policy plan_permiso_revisiones on public.plan_documento_revisiones as restrictive for select to authenticated using(exists(select 1 from public.plan_documentos d where d.id=documento_id and public.plan_permiso_proyecto('informe.ver',d.proyecto_id)));
create policy plan_permiso_candidatos on public.plan_documento_candidatos as restrictive for select to authenticated using(exists(select 1 from public.plan_documentos d where d.id=documento_id and public.plan_permiso_proyecto('informe.ver',d.proyecto_id)));
create policy plan_permiso_emisiones on public.plan_documento_emisiones as restrictive for select to authenticated using(exists(select 1 from public.plan_documentos d where d.id=documento_id and public.plan_permiso_proyecto('informe.ver',d.proyecto_id)));
create policy plan_permiso_aprobaciones on public.plan_documento_aprobaciones as restrictive for select to authenticated using(exists(select 1 from public.plan_documento_candidatos c join public.plan_documentos d on d.id=c.documento_id where c.id=candidato_id and public.plan_permiso_proyecto('informe.ver',d.proyecto_id)));

do $$ declare r record;f record;src text;begin
 for r in select * from (values
 ('plan_crear_plano_en_obra','proyecto.crear'),('plan_crear_plano_en_carpeta','proyecto.crear'),('plan_ubicar_proyecto','proyecto.mover'),('plan_vincular_plano_inicial','proyecto.editar'),
 ('plan_documento_reservar','informe.crear'),('plan_documento_borrador_guardar','informe.editar'),('plan_documento_revision_congelar','informe.editar'),('plan_documento_preparar','informe.preparar'),('plan_restaurar_version','ot.restaurar')
 ) x(nombre,clave) loop
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname=r.nombre loop
 src:=pg_get_functiondef(f.oid);
 src:=replace(src,'public.plan_puede_editar_proyecto(','public.plan_permiso_proyecto('''||r.clave||''',');
 src:=replace(src,'public.plan_es_supervisor_proyecto(','public.plan_permiso_proyecto('''||r.clave||''',');
 execute src;
 end loop;
 end loop;
 src:=pg_get_functiondef('public.plan_separar_costo()'::regprocedure);
 src:=replace(src,'public.plan_es_supervisor_proyecto(new.proyecto_id)','public.plan_permiso_proyecto(''costos.editar'',new.proyecto_id)');execute src;
 src:=pg_get_functiondef('public.plan_solicitar_exportacion(uuid,text,text,uuid)'::regprocedure);
 src:=replace(src,'public.plan_es_miembro_proyecto(o.proyecto_id)','public.plan_permiso_proyecto(''informe.imprimir'',o.proyecto_id)');execute src;
end $$;

-- Directory reads used by existing location pickers retain tenant isolation.
create policy plan_permiso_clientes_ver on public.plan_clientes for select to authenticated using(public.plan_tiene_permiso('cliente.ver',tenant_id));
create policy plan_permiso_ubicaciones_ver on public.plan_cliente_ubicaciones for select to authenticated using(public.plan_tiene_permiso('cliente.ver',tenant_id));
create policy plan_permiso_contactos_ver on public.plan_contactos for select to authenticated using(public.plan_tiene_permiso('contacto.ver',tenant_id));
grant select on public.plan_contactos to authenticated;

-- Editing a shared contact through an old work card must honor its directory
-- capability, not merely a supervisor role in one of the linked works.
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_contacto_legado_sync()'::regprocedure);
 src:=replace(src,'not public.plan_es_creador() and exists','not (public.plan_es_creador() or public.plan_tiene_permiso(''contacto.editar'',public.plan_directorio_entidad_tenant(''contacto'',new.contacto_id))) and exists');execute src;
end $$;

create function public.plan_equipo_historial(p_tenant uuid,p_usuario uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
 if not public.plan_es_creador() then raise exception 'Sin permiso para consultar la auditoría' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from (select * from public.plan_equipo_eventos where tenant_id=p_tenant and (p_usuario is null or usuario_id=p_usuario) order by id desc limit 100) v),'[]');
end $$;
revoke all on function public.plan_equipo_historial(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_equipo_historial(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
