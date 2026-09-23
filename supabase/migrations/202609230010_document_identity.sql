-- Identidad documental global y revisiones anexables. No habilita emisión.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
end $$;

create sequence public.plan_documento_folio_seq as bigint no cycle;
revoke all on sequence public.plan_documento_folio_seq from public,anon,authenticated;

create table public.plan_documentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  orden_id uuid not null references public.ordenes(id) on delete restrict,
  ciclo integer not null default 1 check(ciclo > 0),
  tipo text not null check(tipo in ('orden_servicio','relevamiento','avance','cierre','acta')),
  folio bigint not null unique check(folio > 0),
  codigo text not null unique,
  creado_por uuid not null references auth.users(id) on delete restrict,
  creado_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(creado_por,solicitud_id)
);
create index plan_documentos_orden on public.plan_documentos(orden_id,creado_en);

create table public.plan_documento_revisiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.plan_documentos(id) on delete restrict,
  revision integer not null check(revision >= 0),
  datos jsonb not null check(jsonb_typeof(datos)='object'),
  motivo text,
  esquema_version integer not null check(esquema_version > 0),
  plantilla_version text not null check(length(btrim(plantilla_version)) > 0),
  contenido_sha256 text not null check(contenido_sha256 ~ '^[0-9a-f]{64}$'),
  creada_por uuid not null references auth.users(id) on delete restrict,
  creada_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(documento_id,revision),
  unique(documento_id,solicitud_id)
);
create index plan_documento_revisiones_orden on public.plan_documento_revisiones(documento_id,revision desc);

alter table public.plan_documentos enable row level security;
alter table public.plan_documento_revisiones enable row level security;
create policy plan_documentos_ver on public.plan_documentos for select to authenticated
  using(public.plan_es_miembro_proyecto(proyecto_id));
create policy plan_revisiones_ver on public.plan_documento_revisiones for select to authenticated
  using(exists(select 1 from public.plan_documentos d where d.id=documento_id
    and public.plan_es_miembro_proyecto(d.proyecto_id)));
revoke all on public.plan_documentos,public.plan_documento_revisiones from public,anon,authenticated;
grant select on public.plan_documentos,public.plan_documento_revisiones to authenticated;

create function public.plan_documento_reservar(
  p_orden uuid,p_tipo text,p_ciclo integer,p_solicitud uuid
) returns public.plan_documentos
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_doc public.plan_documentos; v_tenant uuid; v_proyecto uuid; v_folio bigint;
begin
  if auth.uid() is null or p_solicitud is null or p_ciclo is null or p_ciclo < 1
     or p_tipo is null or p_tipo not in ('orden_servicio','relevamiento','avance','cierre','acta') then
    raise exception 'Solicitud documental inválida' using errcode='22023';
  end if;
  select o.proyecto_id,p.tenant_id into v_proyecto,v_tenant
    from public.ordenes o join public.proyectos p on p.id=o.proyecto_id
    where o.id=p_orden and o.deleted_at is null and p.deleted_at is null and p.tenant_id is not null;
  if v_tenant is null or not public.plan_es_supervisor_proyecto(v_proyecto) then
    raise exception 'OT no disponible para reservar documento' using errcode='42501';
  end if;
  select * into v_doc from public.plan_documentos
    where creado_por=auth.uid() and solicitud_id=p_solicitud;
  if v_doc.id is not null then
    if v_doc.orden_id is distinct from p_orden or v_doc.tipo is distinct from p_tipo
       or v_doc.ciclo is distinct from p_ciclo then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
    return v_doc;
  end if;
  v_folio:=nextval('public.plan_documento_folio_seq');
  insert into public.plan_documentos(
    tenant_id,proyecto_id,orden_id,tipo,ciclo,folio,codigo,creado_por,solicitud_id
  ) values (
    v_tenant,v_proyecto,p_orden,p_tipo,p_ciclo,v_folio,
    'POT-'||extract(year from now() at time zone 'UTC')::integer||'-'||
      case p_tipo when 'orden_servicio' then 'OS' when 'relevamiento' then 'REL'
        when 'avance' then 'AV' when 'cierre' then 'CIE' else 'ACT' end||'-'||
      lpad(v_folio::text,8,'0'),
    auth.uid(),p_solicitud
  ) on conflict(creado_por,solicitud_id) do nothing returning * into v_doc;
  if v_doc.id is null then
    select * into v_doc from public.plan_documentos
      where creado_por=auth.uid() and solicitud_id=p_solicitud;
    if v_doc.id is null or v_doc.orden_id is distinct from p_orden
       or v_doc.tipo is distinct from p_tipo or v_doc.ciclo is distinct from p_ciclo then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
  end if;
  return v_doc;
end $$;

create function public.plan_documento_revision_crear(
  p_documento uuid,p_datos jsonb,p_motivo text,p_esquema integer,
  p_plantilla text,p_solicitud uuid
) returns public.plan_documento_revisiones
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_doc public.plan_documentos; v_rev public.plan_documento_revisiones;
  v_num integer; v_hash text;
begin
  if auth.uid() is null or p_solicitud is null or p_datos is null
     or jsonb_typeof(p_datos)<>'object' or p_esquema is null or p_esquema<1
     or nullif(btrim(p_plantilla),'') is null then
    raise exception 'Revisión inválida' using errcode='22023';
  end if;
  select * into v_doc from public.plan_documentos where id=p_documento for update;
  if v_doc.id is null or not public.plan_es_supervisor_proyecto(v_doc.proyecto_id) then
    raise exception 'Documento no disponible' using errcode='42501';
  end if;
  select * into v_rev from public.plan_documento_revisiones
    where documento_id=p_documento and solicitud_id=p_solicitud;
  v_hash:=encode(pg_catalog.sha256(convert_to(p_datos::text,'UTF8')),'hex');
  if v_rev.id is not null then
    if v_rev.contenido_sha256 is distinct from v_hash
       or v_rev.motivo is distinct from nullif(btrim(p_motivo),'')
       or v_rev.esquema_version is distinct from p_esquema
       or v_rev.plantilla_version is distinct from btrim(p_plantilla) then
      raise exception 'Solicitud reutilizada con revisión distinta' using errcode='22023';
    end if;
    return v_rev;
  end if;
  select coalesce(max(revision),-1)+1 into v_num from public.plan_documento_revisiones
    where documento_id=p_documento;
  if v_num>0 and nullif(btrim(p_motivo),'') is null then
    raise exception 'La corrección requiere motivo' using errcode='22023';
  end if;
  insert into public.plan_documento_revisiones(
    documento_id,revision,datos,motivo,esquema_version,plantilla_version,
    contenido_sha256,creada_por,solicitud_id
  ) values (
    p_documento,v_num,p_datos,nullif(btrim(p_motivo),''),p_esquema,btrim(p_plantilla),
    v_hash,auth.uid(),p_solicitud
  ) returning * into v_rev;
  return v_rev;
end $$;

revoke all on function public.plan_documento_reservar(uuid,text,integer,uuid),
 public.plan_documento_revision_crear(uuid,jsonb,text,integer,text,uuid)
 from public,anon,authenticated;
grant execute on function public.plan_documento_reservar(uuid,text,integer,uuid),
 public.plan_documento_revision_crear(uuid,jsonb,text,integer,text,uuid)
 to authenticated;
notify pgrst,'reload schema';
commit;
