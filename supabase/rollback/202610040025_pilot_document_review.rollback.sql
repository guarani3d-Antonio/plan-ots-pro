-- Solo ante rollback autorizado: restaura revisores supervisores; no borra datos.
-- Piloto: prepara el supervisor; revisa y emite el Creador.
-- No cambia PDFs ni decisiones historicas. Mantiene doble persona e idempotencia.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create or replace function public.plan_documento_revisar_pdf(p_candidato uuid,p_sha256 text,
  p_decision text,p_motivo text,p_solicitud uuid)
returns public.plan_documento_aprobaciones
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_c public.plan_documento_candidatos; v_d public.plan_documentos;
  v_a public.plan_documento_aprobaciones; v_motivo text:=nullif(btrim(p_motivo),'');
begin
  if auth.uid() is null or p_solicitud is null
     or p_decision not in ('aprobado','observado')
     or (p_decision='observado' and v_motivo is null) then
    raise exception 'Decision invalida' using errcode='22023';
  end if;
  select * into v_c from public.plan_documento_candidatos where id=p_candidato for update;
  select * into v_d from public.plan_documentos where id=v_c.documento_id;
  if v_c.id is null or not public.plan_es_supervisor_proyecto(v_d.proyecto_id) then
    raise exception 'Candidato no disponible' using errcode='42501';
  end if;
  if v_c.estado<>'listo' or v_c.pdf_sha256 is distinct from p_sha256 then
    raise exception 'El PDF revisado no coincide con el candidato' using errcode='40001';
  end if;
  if p_decision='aprobado' and v_c.solicitado_por=auth.uid() then
    raise exception 'La aprobacion requiere otra persona' using errcode='42501';
  end if;
  select * into v_a from public.plan_documento_aprobaciones
    where decidido_por=auth.uid() and solicitud_id=p_solicitud;
  if v_a.id is not null and (v_a.candidato_id<>p_candidato or v_a.decision<>p_decision
      or v_a.pdf_sha256<>p_sha256 or v_a.motivo is distinct from v_motivo) then
    raise exception 'Solicitud reutilizada con otra decision' using errcode='22023';
  end if;
  if v_a.id is not null then return v_a; end if;
  select * into v_a from public.plan_documento_aprobaciones where candidato_id=p_candidato;
  if v_a.id is not null then
    raise exception 'Candidato ya decidido' using errcode='23505';
  end if;
  insert into public.plan_documento_aprobaciones(candidato_id,decision,pdf_sha256,
    motivo,decidido_por,solicitud_id)
  values(p_candidato,p_decision,p_sha256,v_motivo,auth.uid(),p_solicitud)
  returning * into v_a;
  return v_a;
end $$;

create or replace function public.plan_documento_emitir(p_candidato uuid,p_solicitud uuid)
returns public.plan_documento_emisiones
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_c public.plan_documento_candidatos; v_d public.plan_documentos;
  v_a public.plan_documento_aprobaciones; v_e public.plan_documento_emisiones;
  v_modulo text; v_politica public.plan_politica_decisiones;
  v_politicas jsonb:='{}'::jsonb;
begin
  if auth.uid() is null or p_solicitud is null then
    raise exception 'Solicitud invalida' using errcode='22023';
  end if;
  select * into v_d from public.plan_documentos where id=(
    select documento_id from public.plan_documento_candidatos where id=p_candidato
  ) for update;
  select * into v_c from public.plan_documento_candidatos where id=p_candidato for update;
  if v_c.id is null or not public.plan_es_supervisor_proyecto(v_d.proyecto_id) then
    raise exception 'Candidato no disponible' using errcode='42501';
  end if;
  select * into v_e from public.plan_documento_emisiones
    where emitido_por=auth.uid() and solicitud_id=p_solicitud;
  if v_e.id is not null and v_e.candidato_id<>p_candidato then
    raise exception 'Solicitud reutilizada para otro candidato' using errcode='22023';
  end if;
  if v_e.id is not null then return v_e; end if;
  select * into v_e from public.plan_documento_emisiones where candidato_id=p_candidato;
  if v_e.id is not null then return v_e; end if;
  if exists(select 1 from public.plan_documento_emisiones e where e.documento_id=v_d.id) then
    raise exception 'Documento ya emitido; requiere flujo de reemplazo' using errcode='23505';
  end if;
  if exists(select 1 from public.plan_documento_revisiones r
    where r.documento_id=v_d.id and r.revision>(select x.revision
      from public.plan_documento_revisiones x where x.id=v_c.revision_id)) then
    raise exception 'Existe una revision posterior' using errcode='40001';
  end if;
  select * into v_a from public.plan_documento_aprobaciones where candidato_id=p_candidato;
  if v_c.estado<>'listo' or v_a.decision is distinct from 'aprobado'
     or v_a.pdf_sha256 is distinct from v_c.pdf_sha256 then
    raise exception 'PDF sin aprobacion exacta' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='exports' and o.name=v_c.pdf_path)
     or not exists(select 1 from storage.buckets b where b.id='exports' and not b.public) then
    raise exception 'Archivo emitible ausente' using errcode='22023';
  end if;
  foreach v_modulo in array array['identidad','revision','conservacion'] loop
    select * into v_politica from public.plan_politica_decisiones
      where tenant_id=v_d.tenant_id and modulo=v_modulo order by id desc limit 1;
    if v_politica.estado is distinct from 'aprobada'
       or v_politica.vigente_desde is null or v_politica.vigente_desde>current_date then
      raise exception 'Politica documental % pendiente o suspendida',v_modulo using errcode='22023';
    end if;
    v_politicas:=v_politicas||jsonb_build_object(v_modulo,v_politica.id);
  end loop;
  insert into public.plan_documento_emisiones(candidato_id,aprobacion_id,
    documento_id,revision_id,pdf_path,pdf_sha256,pdf_bytes,fuentes_binarias,
    politicas,emitido_por,solicitud_id)
  values(v_c.id,v_a.id,v_d.id,v_c.revision_id,v_c.pdf_path,v_c.pdf_sha256,
    v_c.pdf_bytes,v_c.fuentes_binarias,v_politicas,auth.uid(),p_solicitud)
  returning * into v_e;
  return v_e;
end $$;

notify pgrst,'reload schema';
commit;
