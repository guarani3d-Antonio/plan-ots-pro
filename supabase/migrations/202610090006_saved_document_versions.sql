-- Every explicit save preserves an immutable revision, atomically. A saved
-- version can only be corrected by creating a successor with an explicit reason.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function public.plan_documento_version_guardar(
 p_documento uuid,p_datos jsonb,p_version bigint,p_solicitud uuid,
 p_correccion boolean,p_motivo text,p_esquema integer,p_plantilla text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare d public.plan_documentos;b public.plan_documento_borradores;r public.plan_documento_revisiones;
begin
 select * into d from public.plan_documentos where id=p_documento for update;
 if auth.uid() is null or d.id is null or not public.plan_permiso_proyecto('informe.editar',d.proyecto_id) then
  raise exception 'Sin permiso para guardar este documento' using errcode='42501';
 end if;
 if p_correccion is null or p_esquema is null or p_esquema<1 or nullif(btrim(p_plantilla),'') is null then
  raise exception 'Solicitud de versión inválida' using errcode='22023';
 end if;
 -- The inner procedure verifies request identity, content and stale versions.
 -- Retry the same save without creating another revision or losing its author.
 if exists(select 1 from public.plan_documento_borrador_intentos where documento_id=p_documento and solicitud_id=p_solicitud) then
  b:=public.plan_documento_borrador_guardar(p_documento,p_datos,p_version,p_solicitud);
  select * into r from public.plan_documento_revisiones where documento_id=p_documento and borrador_version=b.version;
  if r.id is null or r.motivo is distinct from nullif(btrim(p_motivo),'') or r.esquema_version<>p_esquema or r.plantilla_version<>btrim(p_plantilla) then
   raise exception 'Solicitud reutilizada con una versión distinta' using errcode='22023';
  end if;
  return jsonb_build_object('borrador',to_jsonb(b),'revision',to_jsonb(r),'revisiones',(select coalesce(jsonb_agg(to_jsonb(v) order by v.revision),'[]'::jsonb) from public.plan_documento_revisiones v where v.documento_id=p_documento));
 end if;
 select * into b from public.plan_documento_borradores where documento_id=p_documento;
 if coalesce(b.version,0)<>p_version then
  raise exception 'La versión cambió en otra sesión' using errcode='40001';
 end if;
 if p_version>0 then
  if not p_correccion or nullif(btrim(p_motivo),'') is null then
   raise exception 'La versión guardada es de solo lectura. Cree una versión corregida e indique su motivo' using errcode='22023';
  end if;
  if not public.plan_permiso_proyecto('informe.crear',d.proyecto_id) then
   raise exception 'Sin permiso para crear una versión corregida' using errcode='42501';
  end if;
  -- Preserve a legacy saved draft before its first correction. Nothing is
  -- rewritten; the migration itself never fabricates historical versions.
  if not exists(select 1 from public.plan_documento_revisiones where documento_id=p_documento and borrador_version=p_version) then
   perform public.plan_documento_revision_congelar(p_documento,p_version,
    case when exists(select 1 from public.plan_documento_revisiones where documento_id=p_documento) then 'Conservación de la versión previamente guardada' else null end,
    p_esquema,p_plantilla,gen_random_uuid());
  end if;
 elsif p_correccion then
  raise exception 'No existe una versión anterior para corregir' using errcode='22023';
 end if;
 b:=public.plan_documento_borrador_guardar(p_documento,p_datos,p_version,p_solicitud);
 r:=public.plan_documento_revision_congelar(p_documento,b.version,
  case when p_version>0 then btrim(p_motivo) else null end,p_esquema,p_plantilla,p_solicitud);
 return jsonb_build_object('borrador',to_jsonb(b),'revision',to_jsonb(r),'revisiones',(select coalesce(jsonb_agg(to_jsonb(v) order by v.revision),'[]'::jsonb) from public.plan_documento_revisiones v where v.documento_id=p_documento));
end $$;

-- The legacy mutable entry point is internal only; stale clients cannot bypass
-- the new save contract. Approval, signatures and issuance stay independent.
revoke execute on function public.plan_documento_borrador_guardar(uuid,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.plan_documento_version_guardar(uuid,jsonb,bigint,uuid,boolean,text,integer,text) from public,anon,authenticated;
grant execute on function public.plan_documento_version_guardar(uuid,jsonb,bigint,uuid,boolean,text,integer,text) to authenticated;
create function public.plan_documento_fuentes_version(p_revision uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p uuid;f jsonb;
begin
 select d.proyecto_id into p from public.plan_documento_revisiones r join public.plan_documentos d on d.id=r.documento_id where r.id=p_revision;
 if p is null or not public.plan_permiso_proyecto('informe.ver',p) then raise exception 'Sin permiso para consultar esta versión' using errcode='42501';end if;
 select fuentes into f from public.plan_documento_fuentes where revision_id=p_revision;
 if f is null then raise exception 'Las fuentes de esta versión no están disponibles' using errcode='22023';end if;
 return f;
end $$;
revoke all on function public.plan_documento_fuentes_version(uuid) from public,anon,authenticated;
grant execute on function public.plan_documento_fuentes_version(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
