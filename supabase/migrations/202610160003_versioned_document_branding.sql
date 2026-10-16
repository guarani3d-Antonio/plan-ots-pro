begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Company identity for report authors, derived from an authorized work.
create function public.plan_empresa_marca_obra(p_proyecto uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid;begin
 if auth.uid() is null or not public.plan_permiso_proyecto('informe.ver',p_proyecto) then raise exception 'Sin acceso a los informes de esta obra' using errcode='42501';end if;
 select tenant_id into tid from public.proyectos where id=p_proyecto and deleted_at is null;
 if tid is null then raise exception 'Obra no disponible' using errcode='42501';end if;
 return (select jsonb_build_object('tenant_id',t.id,'nombre',t.nombre,'logo_path',(select file_path from public.plan_directorio_fotos where tipo='empresa' and ficha_id=t.id)) from public.tenants t where t.id=tid);
end $$;

create index plan_documento_logo_path on public.plan_documento_fuentes((fuentes->>'logo_path')) where fuentes->>'logo_path' is not null;
create function public.plan_documento_logo_leer(p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select auth.uid() is not null and (
  exists(select 1 from public.plan_documento_fuentes f join public.plan_documentos d on d.id=f.documento_id where f.fuentes->>'logo_path'=p_path and public.plan_permiso_proyecto('informe.ver',d.proyecto_id))
  or exists(select 1 from public.plan_directorio_fotos f join public.proyectos p on p.tenant_id=f.ficha_id where f.tipo='empresa' and f.file_path=p_path and p.deleted_at is null and public.plan_permiso_proyecto('informe.ver',p.id)))
$$;
create function public.plan_documento_logo_conservar(p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select not exists(select 1 from public.plan_documento_fuentes where fuentes->>'logo_path'=p_path)
 and not exists(select 1 from public.plan_presupuesto_versiones where fuentes->>'logo_path'=p_path)
$$;
create policy plan_documento_logo_read on storage.objects for select to authenticated using(bucket_id='directory-photos' and public.plan_documento_logo_leer(name));
create policy plan_documento_logo_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'directory-photos' or public.plan_documento_logo_conservar(name));
create policy plan_documento_logo_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'directory-photos' or public.plan_documento_logo_conservar(name)) with check(bucket_id<>'directory-photos' or public.plan_documento_logo_conservar(name));

-- Validate a preserved logo as a separate binary manifest entry; retain the
-- existing photo validation and the complete manifest stored on the candidate.
create function public.plan_documento_logo_binario_validar(p_candidato uuid,p_manifest jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare src jsonb;d public.plan_documentos;c public.plan_documento_candidatos;logo text;item jsonb;n integer;photos jsonb;sha text;bytes bigint;expected text;begin
 if jsonb_typeof(p_manifest) is distinct from 'array' then raise exception 'Manifiesto inválido' using errcode='22023';end if;
 select * into c from public.plan_documento_candidatos where id=p_candidato;
 select * into d from public.plan_documentos where id=c.documento_id;
 select fuentes into src from public.plan_documento_fuentes where revision_id=c.revision_id;
 if d.id is null or src is null then raise exception 'Fuentes no disponibles' using errcode='22023';end if;
 logo:=src->>'logo_path';
 select count(*) into n from jsonb_array_elements(p_manifest) x where x->>'tipo'='logo';
 if logo is null and n<>0 or logo is not null and n<>1 then raise exception 'El logo del manifiesto no coincide con la versión' using errcode='22023';end if;
 if logo is not null then
  if logo !~ ('^empresa/'||d.tenant_id::text||'/[0-9a-f-]{36}\.jpg$') then raise exception 'Logo ajeno al emisor' using errcode='22023';end if;
  select x into item from jsonb_array_elements(p_manifest) x where x->>'tipo'='logo';sha:=item->>'sha256';
  if sha is null or sha !~ '^[0-9a-f]{64}$' or coalesce(item->>'bytes','') !~ '^[0-9]{1,8}$' then raise exception 'Binario de logo inválido' using errcode='22023';end if;
  bytes:=(item->>'bytes')::bigint;expected:=d.tenant_id::text||'/'||d.proyecto_id::text||'/documentos/'||c.revision_id::text||'/logo/'||sha;
  if bytes not between 1 and 2097152 or item->>'fuente_path' is distinct from logo or item->>'path' is distinct from expected or item->>'mime' is distinct from 'image/jpeg'
   or not exists(select 1 from storage.objects where bucket_id='exports' and name=expected) then raise exception 'El logo verificado no fue preservado' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(x order by pos),'[]') into photos from jsonb_array_elements(p_manifest) with ordinality q(x,pos) where coalesce(x->>'tipo','')<>'logo';return photos;
end $$;

do $$ declare src text;anchor text;begin
 src:=pg_get_functiondef('public.plan_documento_capturar_fuentes()'::regprocedure);
 anchor:='  insert into public.plan_documento_fuentes(revision_id,documento_id,fuentes,fuentes_sha256)';
 if position(anchor in src)=0 then raise exception 'Captura de fuentes inesperada';end if;
 src:=replace(src,anchor,$patch$
  if new.plantilla_version='expediente-controlado-2026-10-16-marca' then
    v_fuentes:=v_fuentes||jsonb_build_object('logo_path',(select file_path from public.plan_directorio_fotos where tipo='empresa' and ficha_id=v_doc.tenant_id));
    if v_fuentes->>'logo_path' is not null and (v_fuentes->>'logo_path' !~ ('^empresa/'||v_doc.tenant_id::text||'/[0-9a-f-]{36}\.jpg$') or not exists(select 1 from storage.objects where bucket_id='directory-photos' and name=v_fuentes->>'logo_path')) then raise exception 'Logo privado de la empresa no disponible' using errcode='22023';end if;
  end if;
$patch$||anchor);execute src;
 src:=pg_get_functiondef('public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb)'::regprocedure);
 if position('v_fotos jsonb;' in src)=0 or position('v_item:=p_fuentes_binarias->v_index;' in src)=0 then raise exception 'Verificador de PDF inesperado';end if;
 src:=replace(src,'v_fotos jsonb;','v_fotos jsonb; v_manifest_fotos jsonb;');
 src:=replace(src,'  select f.fuentes->''fotos'' into v_fotos','  v_manifest_fotos:=public.plan_documento_logo_binario_validar(p_candidato,p_fuentes_binarias);'||E'\n'||'  select f.fuentes->''fotos'' into v_fotos');
 src:=replace(src,'jsonb_array_length(p_fuentes_binarias)','jsonb_array_length(v_manifest_fotos)');
 src:=replace(src,'v_item:=p_fuentes_binarias->v_index;','v_item:=v_manifest_fotos->v_index;');execute src;
 src:=pg_get_functiondef('public.plan_documento_version_guardar(uuid,jsonb,bigint,uuid,boolean,text,integer,text)'::regprocedure);
 if position('p_plantilla=''expediente-controlado-2026-10-14-cronograma-unificado''' in src)=0 then raise exception 'Guardia del plan inesperada';end if;
 src:=replace(src,'p_plantilla=''expediente-controlado-2026-10-14-cronograma-unificado''','p_plantilla in (''expediente-controlado-2026-10-14-cronograma-unificado'',''expediente-controlado-2026-10-16-marca'')');execute src;
 src:=pg_get_functiondef('public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid)'::regprocedure);
 if position('''logo_path'',logo' in src)=0 then raise exception 'Fuentes del presupuesto inesperadas';end if;
 src:=replace(src,'''logo_path'',logo','''plantilla_version'',''presupuesto-arquitectura-2026-10-16'',''logo_path'',logo');execute src;
end $$;

revoke all on function public.plan_empresa_marca_obra(uuid),public.plan_documento_logo_leer(text),public.plan_documento_logo_conservar(text),public.plan_documento_logo_binario_validar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.plan_empresa_marca_obra(uuid),public.plan_documento_logo_leer(text),public.plan_documento_logo_conservar(text) to authenticated;
notify pgrst,'reload schema';
commit;
