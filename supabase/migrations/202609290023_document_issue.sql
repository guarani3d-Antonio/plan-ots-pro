-- Candidato PDF, aprobacion del archivo exacto y emision inmutable.
-- El render y la verificacion de bytes son responsabilidad del servicio servidor.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if to_regclass('public.plan_documento_fuentes') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Faltan fuentes documentales o Storage';
  end if;
end $$;

create table public.plan_documento_candidatos (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references public.plan_documento_revisiones(id) on delete restrict,
  documento_id uuid not null references public.plan_documentos(id) on delete restrict,
  datos_sha256 text not null check(datos_sha256 ~ '^[0-9a-f]{64}$'),
  fuentes_sha256 text not null check(fuentes_sha256 ~ '^[0-9a-f]{64}$'),
  estado text not null default 'preparando' check(estado in ('preparando','listo','fallido')),
  pdf_path text unique,
  pdf_sha256 text check(pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes bigint check(pdf_bytes is null or pdf_bytes between 100 and 52428800),
  fuentes_binarias jsonb check(fuentes_binarias is null or
    (jsonb_typeof(fuentes_binarias)='array' and octet_length(fuentes_binarias::text)<=1048576)),
  solicitado_por uuid not null references auth.users(id) on delete restrict,
  solicitud_id uuid not null,
  solicitado_en timestamptz not null default now(),
  render_token uuid,
  render_inicio timestamptz,
  listo_en timestamptz,
  unique(solicitado_por,solicitud_id),
  check((render_token is null)=(render_inicio is null)),
  check((estado='listo' and pdf_path is not null and pdf_sha256 is not null
    and pdf_bytes is not null and fuentes_binarias is not null and listo_en is not null)
    or (estado<>'listo' and pdf_path is null and pdf_sha256 is null
      and pdf_bytes is null and fuentes_binarias is null and listo_en is null))
);
create table public.plan_documento_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null unique references public.plan_documento_candidatos(id) on delete restrict,
  decision text not null check(decision in ('aprobado','observado')),
  pdf_sha256 text not null check(pdf_sha256 ~ '^[0-9a-f]{64}$'),
  motivo text,
  decidido_por uuid not null references auth.users(id) on delete restrict,
  decidido_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(decidido_por,solicitud_id),
  check(decision<>'observado' or nullif(btrim(motivo),'') is not null)
);
create table public.plan_documento_emisiones (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid not null unique references public.plan_documento_candidatos(id) on delete restrict,
  aprobacion_id uuid not null unique references public.plan_documento_aprobaciones(id) on delete restrict,
  documento_id uuid not null unique references public.plan_documentos(id) on delete restrict,
  revision_id uuid not null unique references public.plan_documento_revisiones(id) on delete restrict,
  pdf_path text not null unique,
  pdf_sha256 text not null check(pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes bigint not null check(pdf_bytes between 100 and 52428800),
  fuentes_binarias jsonb not null check(jsonb_typeof(fuentes_binarias)='array'),
  politicas jsonb not null check(jsonb_typeof(politicas)='object'),
  emitido_por uuid not null references auth.users(id) on delete restrict,
  emitido_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(emitido_por,solicitud_id)
);
create index plan_documento_emisiones_documento on public.plan_documento_emisiones(documento_id,emitido_en);
create trigger plan_aprobaciones_inmutables before update or delete on public.plan_documento_aprobaciones
for each row execute function public.plan_documento_no_alterar_registro();
create trigger plan_emisiones_inmutables before update or delete on public.plan_documento_emisiones
for each row execute function public.plan_documento_no_alterar_registro();
create function public.plan_documento_no_revisar_emitido() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if exists(select 1 from public.plan_documento_emisiones e
    where e.documento_id=new.documento_id) then
    raise exception 'Documento emitido: requiere un nuevo ciclo documental'
      using errcode='42501';
  end if;
  return new;
end $$;
create trigger plan_no_revisar_emitido before insert on public.plan_documento_revisiones
for each row execute function public.plan_documento_no_revisar_emitido();

alter table public.plan_documento_candidatos enable row level security;
alter table public.plan_documento_aprobaciones enable row level security;
alter table public.plan_documento_emisiones enable row level security;
revoke all on public.plan_documento_candidatos,public.plan_documento_aprobaciones,
  public.plan_documento_emisiones from public,anon,authenticated;
grant select on public.plan_documento_candidatos,public.plan_documento_aprobaciones,
  public.plan_documento_emisiones to authenticated;
create policy plan_candidatos_ver on public.plan_documento_candidatos for select to authenticated
using(exists(select 1 from public.plan_documentos d where d.id=documento_id
  and public.plan_es_supervisor_proyecto(d.proyecto_id)));
create policy plan_aprobaciones_ver on public.plan_documento_aprobaciones for select to authenticated
using(exists(select 1 from public.plan_documento_candidatos c
  join public.plan_documentos d on d.id=c.documento_id
  where c.id=candidato_id and public.plan_es_supervisor_proyecto(d.proyecto_id)));
create policy plan_emisiones_ver on public.plan_documento_emisiones for select to authenticated
using(exists(select 1 from public.plan_documentos d where d.id=documento_id
  and public.plan_es_supervisor_proyecto(d.proyecto_id)));

-- Los PDF del expediente solo los sube el servicio y no se borran ni sobrescriben
-- desde una cuenta de la aplicacion. La ruta incluye tenant/proyecto/revision/hash.
create policy plan_documentos_storage_insert on storage.objects as restrictive
for insert to authenticated
with check(bucket_id<>'exports' or split_part(name,'/',3)<>'documentos');
create policy plan_documentos_storage_delete on storage.objects as restrictive
for delete to authenticated
using(bucket_id<>'exports' or split_part(name,'/',3)<>'documentos');
create policy plan_documentos_storage_update on storage.objects as restrictive
for update to authenticated
using(bucket_id<>'exports' or split_part(name,'/',3)<>'documentos')
with check(bucket_id<>'exports' or split_part(name,'/',3)<>'documentos');

create function public.plan_documento_preparar(p_revision uuid,p_solicitud uuid)
returns public.plan_documento_candidatos
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_rev public.plan_documento_revisiones; v_doc public.plan_documentos;
  v_fuente public.plan_documento_fuentes; v_candidato public.plan_documento_candidatos;
begin
  if auth.uid() is null or p_solicitud is null then
    raise exception 'Solicitud invalida' using errcode='22023';
  end if;
  select * into v_rev from public.plan_documento_revisiones where id=p_revision;
  select * into v_doc from public.plan_documentos where id=v_rev.documento_id for update;
  if v_doc.id is null or not public.plan_es_supervisor_proyecto(v_doc.proyecto_id) then
    raise exception 'Revision no disponible' using errcode='42501';
  end if;
  select * into v_fuente from public.plan_documento_fuentes where revision_id=p_revision;
  if v_fuente.revision_id is null then
    raise exception 'Revision anterior sin fuentes verificables: crear una nueva revision' using errcode='22023';
  end if;
  if exists(select 1 from public.plan_documento_revisiones r
    where r.documento_id=v_doc.id and r.revision>v_rev.revision) then
    raise exception 'Existe una revision posterior' using errcode='40001';
  end if;
  select * into v_candidato from public.plan_documento_candidatos
    where solicitado_por=auth.uid() and solicitud_id=p_solicitud;
  if v_candidato.id is not null and v_candidato.revision_id<>p_revision then
    raise exception 'Solicitud reutilizada para otra revision' using errcode='22023';
  end if;
  if v_candidato.id is not null then return v_candidato; end if;
  select * into v_candidato from public.plan_documento_candidatos where revision_id=p_revision;
  if v_candidato.id is not null then return v_candidato; end if;
  insert into public.plan_documento_candidatos(revision_id,documento_id,datos_sha256,
    fuentes_sha256,solicitado_por,solicitud_id)
  values(p_revision,v_doc.id,v_rev.contenido_sha256,v_fuente.fuentes_sha256,
    auth.uid(),p_solicitud)
  on conflict do nothing returning * into v_candidato;
  if v_candidato.id is null then
    select * into v_candidato from public.plan_documento_candidatos where revision_id=p_revision;
  end if;
  return v_candidato;
end $$;

create function public.plan_documento_render_reclamar(p_candidato uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_c public.plan_documento_candidatos;
begin
  if p_token is null then raise exception 'Token de render invalido' using errcode='22023'; end if;
  select * into v_c from public.plan_documento_candidatos where id=p_candidato for update;
  if v_c.id is null then raise exception 'Candidato no encontrado' using errcode='22023'; end if;
  if v_c.estado='listo' then return false; end if;
  if v_c.estado<>'preparando' then raise exception 'Candidato no renderizable' using errcode='22023'; end if;
  if v_c.render_token is not null and v_c.render_inicio>now()-interval '5 minutes' then
    return v_c.render_token=p_token;
  end if;
  update public.plan_documento_candidatos set render_token=p_token,render_inicio=now()
    where id=p_candidato;
  return true;
end $$;

create function public.plan_documento_render_liberar(p_candidato uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  update public.plan_documento_candidatos set render_token=null,render_inicio=null
    where id=p_candidato and render_token=p_token and estado='preparando';
  return found;
end $$;

-- Solo el backend con service_role puede declarar listo un PDF tras descargarlo
-- de Storage y verificar su SHA-256. La base comprueba ademas ruta y existencia.
create function public.plan_documento_pdf_listo(p_candidato uuid,p_token uuid,p_path text,
  p_sha256 text,p_bytes bigint,p_fuentes_binarias jsonb) returns public.plan_documento_candidatos
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_c public.plan_documento_candidatos; v_d public.plan_documentos;
  v_expected text; v_fotos jsonb; v_foto jsonb; v_archivo jsonb;
  v_item jsonb; v_tipo text; v_path text; v_sha text; v_bytes bigint;
  v_fuente_path text; v_index integer; v_max_index integer;
begin
  select * into v_c from public.plan_documento_candidatos where id=p_candidato for update;
  select * into v_d from public.plan_documentos where id=v_c.documento_id;
  if v_c.id is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_bytes not between 100 and 52428800 then
    raise exception 'PDF invalido' using errcode='22023';
  end if;
  v_expected:=v_d.tenant_id::text||'/'||v_d.proyecto_id::text||
    '/documentos/'||v_c.revision_id::text||'/'||p_sha256||'.pdf';
  if p_path is distinct from v_expected then
    raise exception 'Ruta del PDF invalida' using errcode='22023';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='exports' and o.name=p_path)
     or not exists(select 1 from storage.buckets b where b.id='exports' and not b.public) then
    raise exception 'PDF privado no encontrado' using errcode='22023';
  end if;
  select f.fuentes->'fotos' into v_fotos from public.plan_documento_fuentes f
    where f.revision_id=v_c.revision_id;
  if jsonb_typeof(p_fuentes_binarias) is distinct from 'array'
     or jsonb_typeof(v_fotos) is distinct from 'array'
     or jsonb_array_length(p_fuentes_binarias)<>jsonb_array_length(v_fotos) then
    raise exception 'Manifiesto de fotos invalido' using errcode='22023';
  end if;
  v_max_index:=jsonb_array_length(v_fotos)-1;
  for v_index in 0..v_max_index loop
    v_foto:=v_fotos->v_index;
    v_item:=p_fuentes_binarias->v_index;
    if jsonb_typeof(v_item) is distinct from 'object'
       or v_item->>'id' is distinct from v_foto->>'id' then
      raise exception 'Foto del manifiesto no coincide' using errcode='22023';
    end if;
    foreach v_tipo in array array['original','edicion'] loop
      v_archivo:=v_item->v_tipo;
      v_path:=v_archivo->>'path'; v_sha:=v_archivo->>'sha256';
      if jsonb_typeof(v_archivo) is distinct from 'object'
         or v_sha is null or v_sha !~ '^[0-9a-f]{64}$'
         or (v_archivo->>'bytes') is null
         or (v_archivo->>'bytes') !~ '^[0-9]{1,8}$' then
        raise exception 'Archivo de foto invalido' using errcode='22023';
      end if;
      v_bytes:=(v_archivo->>'bytes')::bigint;
      v_fuente_path:=case v_tipo when 'original' then v_foto->>'original_path'
        else v_foto->>'edicion_path' end;
      if v_bytes<1 or v_bytes>31457280
         or v_archivo->>'fuente_path' is distinct from v_fuente_path
         or v_path is distinct from v_d.tenant_id::text||'/'||v_d.proyecto_id::text||
           '/documentos/'||v_c.revision_id::text||'/fotos/'||
           (v_foto->>'id')||'/'||v_tipo||'/'||v_sha
         or not exists(select 1 from storage.objects o where o.bucket_id='exports'
           and o.name=v_path) then
        raise exception 'Archivo de foto no preservado' using errcode='22023';
      end if;
    end loop;
  end loop;
  if v_c.estado='listo' then
    if v_c.pdf_path is distinct from p_path or v_c.pdf_sha256 is distinct from p_sha256
       or v_c.pdf_bytes is distinct from p_bytes
       or v_c.fuentes_binarias is distinct from p_fuentes_binarias then
      raise exception 'Candidato ya preparado con otros bytes' using errcode='22023';
    end if;
    return v_c;
  end if;
  if v_c.estado<>'preparando' then
    raise exception 'Candidato no preparable' using errcode='22023';
  end if;
  if v_c.render_token is distinct from p_token or p_token is null then
    raise exception 'Render no reservado por este servicio' using errcode='42501';
  end if;
  update public.plan_documento_candidatos set estado='listo',pdf_path=p_path,
    pdf_sha256=p_sha256,pdf_bytes=p_bytes,
    fuentes_binarias=p_fuentes_binarias,listo_en=now(),
    render_token=null,render_inicio=null
    where id=p_candidato returning * into v_c;
  return v_c;
end $$;

create function public.plan_documento_revisar_pdf(p_candidato uuid,p_sha256 text,
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

create function public.plan_documento_emitir(p_candidato uuid,p_solicitud uuid)
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

revoke all on function public.plan_documento_preparar(uuid,uuid),
  public.plan_documento_no_revisar_emitido(),
  public.plan_documento_render_reclamar(uuid,uuid),
  public.plan_documento_render_liberar(uuid,uuid),
  public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb),
  public.plan_documento_revisar_pdf(uuid,text,text,text,uuid),
  public.plan_documento_emitir(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_documento_preparar(uuid,uuid),
  public.plan_documento_revisar_pdf(uuid,text,text,text,uuid),
  public.plan_documento_emitir(uuid,uuid) to authenticated;
grant execute on function public.plan_documento_render_reclamar(uuid,uuid),
  public.plan_documento_render_liberar(uuid,uuid),
  public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
