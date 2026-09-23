-- Decisiones documentales por empresa. Aditiva: no cambia informes existentes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if current_user <> 'postgres' then
    raise exception 'Ejecutar la migración como postgres';
  end if;
end $$;

create table public.plan_politica_modulos (
  clave text primary key,
  titulo text not null,
  descripcion text not null,
  activo boolean not null default true,
  constraint plan_politica_modulos_clave check (clave ~ '^[a-z_]+$')
);
insert into public.plan_politica_modulos(clave,titulo,descripcion) values
 ('identidad','Identidad documental','Marca, emisor y códigos de formulario autorizados'),
 ('revision','Revisión y autorización','Roles y secuencia de revisión institucional'),
 ('evidencias','Evidencias por trabajo','Requisitos adicionales y excepciones justificadas'),
 ('firma','Firma y recepción','Métodos admitidos y representantes habilitados'),
 ('garantia','Garantía y condiciones','Condiciones contractuales aprobadas'),
 ('conservacion','Conservación y entrega','Retención, canales y destinatarios autorizados');

create table public.plan_politica_decisiones (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  modulo text not null references public.plan_politica_modulos(clave) on delete restrict,
  estado text not null check (estado in ('pendiente','aprobada','no_aprobada','suspendida')),
  autoridad text,
  respaldo text,
  detalle text,
  vigente_desde date,
  decidido_por uuid not null references auth.users(id) on delete restrict,
  decidido_en timestamptz not null default now(),
  solicitud_id uuid not null,
  unique(tenant_id,modulo,solicitud_id),
  constraint plan_politica_aprobacion_respaldo check (
    estado <> 'aprobada' or (
      nullif(btrim(coalesce(autoridad,'')),'') is not null and
      nullif(btrim(coalesce(respaldo,'')),'') is not null and
      vigente_desde is not null
    )
  )
);
create index plan_politica_actual on public.plan_politica_decisiones(tenant_id,modulo,id desc);

-- El historial es anexable. El dueño de la tabla puede migrar datos, el cliente no.
alter table public.plan_politica_modulos enable row level security;
alter table public.plan_politica_decisiones enable row level security;
revoke all on public.plan_politica_modulos,public.plan_politica_decisiones from public,anon,authenticated;
revoke all on sequence public.plan_politica_decisiones_id_seq from public,anon,authenticated;

create function public.plan_politicas_listar(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not public.plan_es_creador() then raise exception 'Solo Creador' using errcode='42501'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant) then
    raise exception 'Empresa inexistente' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'modulo',m.clave,'titulo',m.titulo,'descripcion',m.descripcion,
      'estado',coalesce(d.estado,'pendiente'),'decision_id',d.id,
      'version',(select count(*) from public.plan_politica_decisiones v
        where v.tenant_id=p_tenant and v.modulo=m.clave),
      'autoridad',d.autoridad,'respaldo',d.respaldo,'detalle',d.detalle,
      'vigente_desde',d.vigente_desde,'decidido_en',d.decidido_en
    ) order by m.clave)
    from public.plan_politica_modulos m
    left join lateral (
      select * from public.plan_politica_decisiones x
      where x.tenant_id=p_tenant and x.modulo=m.clave
      order by x.id desc limit 1
    ) d on true
    where m.activo
  ),'[]'::jsonb);
end $$;

create function public.plan_politica_decidir(
  p_tenant uuid,p_modulo text,p_estado text,p_autoridad text,p_respaldo text,
  p_detalle text,p_vigente_desde date,p_solicitud uuid
) returns bigint language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_id bigint; v_anterior public.plan_politica_decisiones;
begin
  if not public.plan_es_creador() then raise exception 'Solo Creador' using errcode='42501'; end if;
  if p_solicitud is null or not exists(select 1 from public.tenants where id=p_tenant and activo)
     or not exists(select 1 from public.plan_politica_modulos where clave=p_modulo and activo)
     or p_estado is null or p_estado not in ('pendiente','aprobada','no_aprobada','suspendida') then
    raise exception 'Decisión documental inválida' using errcode='22023';
  end if;
  insert into public.plan_politica_decisiones(
    tenant_id,modulo,estado,autoridad,respaldo,detalle,vigente_desde,decidido_por,solicitud_id
  ) values (
    p_tenant,p_modulo,p_estado,nullif(btrim(p_autoridad),''),nullif(btrim(p_respaldo),''),
    nullif(btrim(p_detalle),''),p_vigente_desde,auth.uid(),p_solicitud
  ) on conflict(tenant_id,modulo,solicitud_id) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into v_anterior from public.plan_politica_decisiones
    where tenant_id=p_tenant and modulo=p_modulo and solicitud_id=p_solicitud;
  if v_anterior.id is null or v_anterior.decidido_por is distinct from auth.uid()
     or v_anterior.estado is distinct from p_estado
     or v_anterior.autoridad is distinct from nullif(btrim(p_autoridad),'')
     or v_anterior.respaldo is distinct from nullif(btrim(p_respaldo),'')
     or v_anterior.detalle is distinct from nullif(btrim(p_detalle),'')
     or v_anterior.vigente_desde is distinct from p_vigente_desde then
    raise exception 'Solicitud reutilizada con datos distintos' using errcode='22023';
  end if;
  return v_anterior.id;
end $$;

revoke all on function public.plan_politicas_listar(uuid),
  public.plan_politica_decidir(uuid,text,text,text,text,text,date,uuid)
  from public,anon,authenticated;
grant execute on function public.plan_politicas_listar(uuid),
  public.plan_politica_decidir(uuid,text,text,text,text,text,date,uuid)
  to authenticated;
notify pgrst,'reload schema';
commit;
