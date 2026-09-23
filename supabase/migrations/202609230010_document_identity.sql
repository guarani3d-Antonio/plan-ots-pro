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
  constraint plan_documentos_tenant_proyecto foreign key(tenant_id,proyecto_id)
    references public.proyectos(tenant_id,id) on delete restrict,
  constraint plan_documentos_proyecto_orden foreign key(proyecto_id,orden_id)
    references public.ordenes(proyecto_id,id) on delete restrict,
  unique(creado_por,solicitud_id)
);
create index plan_documentos_orden on public.plan_documentos(orden_id,creado_en);
-- Una apertura, un cierre y un acta por ciclo; los relevamientos y avances
-- conservan su propia serie de documentos y pueden repetirse.
create unique index plan_documentos_fases_unicas on public.plan_documentos(orden_id,ciclo,tipo)
  where tipo in ('orden_servicio','cierre','acta');

create table public.plan_documento_revisiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.plan_documentos(id) on delete restrict,
  revision integer not null check(revision >= 0),
  datos jsonb not null check(jsonb_typeof(datos)='object'
    and octet_length(datos::text)<=1048576),
  motivo text,
  esquema_version integer not null check(esquema_version > 0),
  plantilla_version text not null check(length(btrim(plantilla_version)) > 0),
  contenido_sha256 text not null check(contenido_sha256 ~ '^[0-9a-f]{64}$'),
  borrador_version bigint not null check(borrador_version > 0),
  creada_por uuid not null references auth.users(id) on delete restrict,
  creada_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(documento_id,revision),
  unique(documento_id,borrador_version),
  unique(documento_id,solicitud_id)
);
create index plan_documento_revisiones_orden on public.plan_documento_revisiones(documento_id,revision desc);

-- Borrador recuperable con control de concurrencia. La validación de referencias
-- y la retención de binarios pertenecen al paso previo a la emisión.
create table public.plan_documento_borradores (
  documento_id uuid primary key references public.plan_documentos(id) on delete restrict,
  datos jsonb not null check(jsonb_typeof(datos)='object'
    and octet_length(datos::text)<=1048576),
  version bigint not null check(version > 0),
  actualizado_por uuid not null references auth.users(id) on delete restrict,
  actualizado_en timestamptz not null default now()
);
create table public.plan_documento_borrador_intentos (
  documento_id uuid not null references public.plan_documentos(id) on delete restrict,
  solicitud_id uuid not null,
  contenido_sha256 text not null check(contenido_sha256 ~ '^[0-9a-f]{64}$'),
  version_previa bigint not null check(version_previa >= 0),
  version_resultado bigint not null check(version_resultado > 0),
  creado_por uuid not null references auth.users(id) on delete restrict,
  creado_en timestamptz not null default now(),
  primary key(documento_id,solicitud_id)
);

alter table public.plan_documentos enable row level security;
alter table public.plan_documento_revisiones enable row level security;
alter table public.plan_documento_borradores enable row level security;
alter table public.plan_documento_borrador_intentos enable row level security;
create policy plan_documentos_ver on public.plan_documentos for select to authenticated
  using(public.plan_es_miembro_proyecto(proyecto_id));
create policy plan_revisiones_ver on public.plan_documento_revisiones for select to authenticated
  using(exists(select 1 from public.plan_documentos d where d.id=documento_id
    and public.plan_es_miembro_proyecto(d.proyecto_id)));
create policy plan_borradores_ver on public.plan_documento_borradores for select to authenticated
  using(exists(select 1 from public.plan_documentos d where d.id=documento_id
    and public.plan_es_miembro_proyecto(d.proyecto_id)));
revoke all on public.plan_documentos,public.plan_documento_revisiones,
  public.plan_documento_borradores,public.plan_documento_borrador_intentos
  from public,anon,authenticated;
grant select on public.plan_documentos,public.plan_documento_revisiones,
  public.plan_documento_borradores to authenticated;

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
  if v_tenant is null or not public.plan_puede_editar_proyecto(v_proyecto) then
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
  if p_tipo in ('orden_servicio','cierre','acta') then
    select * into v_doc from public.plan_documentos
      where orden_id=p_orden and ciclo=p_ciclo and tipo=p_tipo;
    if v_doc.id is not null then return v_doc; end if;
  end if;
  v_folio:=nextval('public.plan_documento_folio_seq');
  insert into public.plan_documentos(
    tenant_id,proyecto_id,orden_id,tipo,ciclo,folio,codigo,creado_por,solicitud_id
  ) values (
    v_tenant,v_proyecto,p_orden,p_tipo,p_ciclo,v_folio,
    'POT-'||extract(year from now() at time zone 'UTC')::integer||'-'||
      case p_tipo when 'orden_servicio' then 'OS' when 'relevamiento' then 'REL'
        when 'avance' then 'AV' when 'cierre' then 'CIE' else 'ACT' end||'-'||
      -- lpad trunca si el número excede ocho dígitos: conservar el folio íntegro.
      case when length(v_folio::text)<8 then lpad(v_folio::text,8,'0')
        else v_folio::text end,
    auth.uid(),p_solicitud
  ) on conflict do nothing returning * into v_doc;
  if v_doc.id is null then
    select * into v_doc from public.plan_documentos
      where creado_por=auth.uid() and solicitud_id=p_solicitud;
    if v_doc.id is not null and (v_doc.orden_id is distinct from p_orden
       or v_doc.tipo is distinct from p_tipo or v_doc.ciclo is distinct from p_ciclo) then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
    if v_doc.id is null and p_tipo in ('orden_servicio','cierre','acta') then
      select * into v_doc from public.plan_documentos
        where orden_id=p_orden and ciclo=p_ciclo and tipo=p_tipo;
    end if;
    if v_doc.id is null then
      raise exception 'No se pudo reservar el documento' using errcode='23505';
    end if;
  end if;
  return v_doc;
end $$;

create function public.plan_documento_borrador_guardar(
  p_documento uuid,p_datos jsonb,p_version bigint,p_solicitud uuid
) returns public.plan_documento_borradores
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_doc public.plan_documentos; v_borrador public.plan_documento_borradores;
  v_intento public.plan_documento_borrador_intentos; v_hash text; v_actual bigint;
begin
  if auth.uid() is null or p_solicitud is null or p_version is null or p_version<0
     or p_datos is null or jsonb_typeof(p_datos)<>'object'
     or octet_length(p_datos::text)>1048576 then
    raise exception 'Borrador inválido' using errcode='22023';
  end if;
  select * into v_doc from public.plan_documentos where id=p_documento for update;
  if v_doc.id is null or not public.plan_puede_editar_proyecto(v_doc.proyecto_id) then
    raise exception 'Documento no disponible' using errcode='42501';
  end if;
  v_hash:=encode(pg_catalog.sha256(convert_to(p_datos::text,'UTF8')),'hex');
  select * into v_intento from public.plan_documento_borrador_intentos
    where documento_id=p_documento and solicitud_id=p_solicitud;
  if v_intento.documento_id is not null then
    if v_intento.creado_por is distinct from auth.uid()
       or v_intento.contenido_sha256 is distinct from v_hash
       or v_intento.version_previa is distinct from p_version then
      raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
    end if;
    select * into v_borrador from public.plan_documento_borradores
      where documento_id=p_documento;
    if v_borrador.version is distinct from v_intento.version_resultado then
      raise exception 'Solicitud aplicada; existe una versión posterior' using errcode='40001';
    end if;
    return v_borrador;
  end if;
  select * into v_borrador from public.plan_documento_borradores
    where documento_id=p_documento for update;
  v_actual:=coalesce(v_borrador.version,0);
  if v_actual<>p_version then
    raise exception 'Borrador modificado por otra sesión (versión %)',v_actual
      using errcode='40001';
  end if;
  insert into public.plan_documento_borradores(
    documento_id,datos,version,actualizado_por
  ) values (p_documento,p_datos,v_actual+1,auth.uid())
  on conflict(documento_id) do update set
    datos=excluded.datos,version=excluded.version,
    actualizado_por=excluded.actualizado_por,actualizado_en=now()
  returning * into v_borrador;
  insert into public.plan_documento_borrador_intentos(
    documento_id,solicitud_id,contenido_sha256,version_previa,version_resultado,creado_por
  ) values(p_documento,p_solicitud,v_hash,p_version,v_borrador.version,auth.uid());
  return v_borrador;
end $$;

create function public.plan_documento_revision_congelar(
  p_documento uuid,p_version bigint,p_motivo text,p_esquema integer,
  p_plantilla text,p_solicitud uuid
) returns public.plan_documento_revisiones
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_doc public.plan_documentos; v_borrador public.plan_documento_borradores;
  v_rev public.plan_documento_revisiones; v_num integer; v_hash text;
begin
  if auth.uid() is null or p_solicitud is null or p_version is null or p_version<1
     or p_esquema is null or p_esquema<1 or nullif(btrim(p_plantilla),'') is null then
    raise exception 'Revisión inválida' using errcode='22023';
  end if;
  select * into v_doc from public.plan_documentos where id=p_documento for update;
  if v_doc.id is null or not public.plan_es_supervisor_proyecto(v_doc.proyecto_id) then
    raise exception 'Documento no disponible' using errcode='42501';
  end if;
  select * into v_rev from public.plan_documento_revisiones
    where documento_id=p_documento and solicitud_id=p_solicitud;
  if v_rev.id is not null then
    if v_rev.creada_por is distinct from auth.uid()
       or v_rev.borrador_version is distinct from p_version
       or v_rev.motivo is distinct from nullif(btrim(p_motivo),'')
       or v_rev.esquema_version is distinct from p_esquema
       or v_rev.plantilla_version is distinct from btrim(p_plantilla) then
      raise exception 'Solicitud reutilizada con revisión distinta' using errcode='22023';
    end if;
    return v_rev;
  end if;
  select * into v_borrador from public.plan_documento_borradores
    where documento_id=p_documento for update;
  if v_borrador.documento_id is null or v_borrador.version<>p_version then
    raise exception 'El borrador cambió; revisar antes de congelar' using errcode='40001';
  end if;
  v_hash:=encode(pg_catalog.sha256(convert_to(v_borrador.datos::text,'UTF8')),'hex');
  select * into v_rev from public.plan_documento_revisiones
    where documento_id=p_documento and borrador_version=p_version;
  if v_rev.id is not null then
    raise exception 'Este borrador ya tiene una revisión congelada' using errcode='23505';
  end if;
  select coalesce(max(revision),-1)+1 into v_num from public.plan_documento_revisiones
    where documento_id=p_documento;
  if v_num>0 and nullif(btrim(p_motivo),'') is null then
    raise exception 'La corrección requiere motivo' using errcode='22023';
  end if;
  insert into public.plan_documento_revisiones(
    documento_id,revision,datos,motivo,esquema_version,plantilla_version,
    contenido_sha256,borrador_version,creada_por,solicitud_id
  ) values (
    p_documento,v_num,v_borrador.datos,nullif(btrim(p_motivo),''),p_esquema,btrim(p_plantilla),
    v_hash,p_version,auth.uid(),p_solicitud
  ) returning * into v_rev;
  return v_rev;
end $$;

revoke all on function public.plan_documento_reservar(uuid,text,integer,uuid),
 public.plan_documento_borrador_guardar(uuid,jsonb,bigint,uuid),
 public.plan_documento_revision_congelar(uuid,bigint,text,integer,text,uuid)
 from public,anon,authenticated;
grant execute on function public.plan_documento_reservar(uuid,text,integer,uuid),
 public.plan_documento_borrador_guardar(uuid,jsonb,bigint,uuid),
 public.plan_documento_revision_congelar(uuid,bigint,text,integer,text,uuid)
 to authenticated;
notify pgrst,'reload schema';
commit;
