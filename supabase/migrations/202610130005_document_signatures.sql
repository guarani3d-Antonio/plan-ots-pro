-- Signatures append to an immutable saved revision, never to mutable OT fields.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
create table public.plan_documento_firmas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 proyecto_id uuid not null references public.proyectos(id),
 documento_id uuid not null references public.plan_documentos(id),
 revision_id uuid not null references public.plan_documento_revisiones(id),
 espacio_id uuid not null,
 categoria text not null check(categoria in ('Cliente','Contacto','Técnico / Supervisor','Contratista')),
 contenido_sha256 text not null check(contenido_sha256 ~ '^[0-9a-f]{64}$'),
 imagen_png text not null check(length(imagen_png)<=160000),
 imagen_sha256 text not null check(imagen_sha256 ~ '^[0-9a-f]{64}$'),
 registrada_por uuid not null references auth.users(id),
 registrada_en timestamptz not null default now(),
 solicitud_id uuid not null,
 unique(revision_id,espacio_id),unique(registrada_por,solicitud_id)
);
alter table public.plan_documento_firmas enable row level security;
revoke all on public.plan_documento_firmas from anon,authenticated;
grant select on public.plan_documento_firmas to service_role;
create function public.plan_validar_espacios_firma() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare slots jsonb; item jsonb; n integer;
begin
 slots:=new.datos->'firmantes';
 if slots is null then return new;end if;
 if jsonb_typeof(slots)<>'array' then raise exception 'Firmantes inválidos' using errcode='22023';end if;
 if jsonb_array_length(slots)>4 then raise exception 'Máximo cuatro firmantes' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(slots) loop
  if jsonb_typeof(item)<>'object' or (item->>'id') is null or (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   (item->>'categoria') is null or (item->>'categoria') not in ('Cliente','Contacto','Técnico / Supervisor','Contratista') then
   raise exception 'Categoría o espacio de firma inválido' using errcode='22023';end if;
 end loop;
 select count(distinct value->>'id') into n from jsonb_array_elements(slots);
 if n<>jsonb_array_length(slots) then raise exception 'Espacio duplicado' using errcode='22023';end if;
 return new;
end $$;
create trigger plan_validar_espacios_firma before insert or update on public.plan_documento_borradores
 for each row execute function public.plan_validar_espacios_firma();
create function public.plan_documento_firmas_leer(p_revision uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p uuid;
begin
 select d.proyecto_id into p from public.plan_documento_revisiones r join public.plan_documentos d on d.id=r.documento_id where r.id=p_revision;
 if auth.uid() is null or p is null or not public.plan_permiso_proyecto('informe.ver',p) then raise exception 'Sin permiso para consultar estas firmas' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(f) order by f.registrada_en,f.id),'[]'::jsonb) from public.plan_documento_firmas f where revision_id=p_revision);
end $$;
create function public.plan_documento_firmar(p_revision uuid,p_sha256 text,p_espacio uuid,p_imagen text,p_solicitud uuid)
returns public.plan_documento_firmas language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_documento_revisiones; d public.plan_documentos; f public.plan_documento_firmas; cat text; raw bytea; ih text;w bigint;h bigint;
begin
 select * into r from public.plan_documento_revisiones where id=p_revision;
 select * into d from public.plan_documentos where id=r.documento_id for update;
 if auth.uid() is null or d.id is null or not public.plan_permiso_proyecto('informe.editar',d.proyecto_id) then raise exception 'Sin permiso para registrar la firma' using errcode='42501';end if;
 if p_solicitud is null or p_espacio is null or p_sha256 is distinct from r.contenido_sha256 then raise exception 'La firma no corresponde a esta versión' using errcode='22023';end if;
 if p_imagen is null or length(p_imagen)>160000 or p_imagen !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$' then raise exception 'Firma PNG inválida o demasiado grande' using errcode='22023';end if;
 raw:=decode(substring(p_imagen from 23),'base64');
 if octet_length(raw)<65 or encode(substring(raw from 1 for 8),'hex')<>'89504e470d0a1a0a' or convert_from(substring(raw from 13 for 4),'SQL_ASCII')<>'IHDR' then raise exception 'Firma PNG inválida' using errcode='22023';end if;
 w:=get_byte(raw,16)::bigint*16777216+get_byte(raw,17)*65536+get_byte(raw,18)*256+get_byte(raw,19);
 h:=get_byte(raw,20)::bigint*16777216+get_byte(raw,21)*65536+get_byte(raw,22)*256+get_byte(raw,23);
 if w<32 or w>2048 or h<16 or h>1024 then raise exception 'Dimensiones de firma inválidas' using errcode='22023';end if;
 ih:=encode(sha256(raw),'hex');
 select * into f from public.plan_documento_firmas where registrada_por=auth.uid() and solicitud_id=p_solicitud;
 if f.id is not null then
  if f.revision_id<>p_revision or f.espacio_id<>p_espacio or f.imagen_sha256<>ih then raise exception 'Solicitud reutilizada con otra firma' using errcode='22023';end if;
  return f;
 end if;
 if exists(select 1 from public.plan_documento_revisiones where documento_id=d.id and revision>r.revision) then raise exception 'Existe una versión posterior. Abra la versión vigente' using errcode='40001';end if;
 if exists(select 1 from public.plan_documento_candidatos where revision_id=p_revision) then raise exception 'Esta versión ya inició su PDF formal. Cree una versión corregida para registrar otra firma' using errcode='22023';end if;
 if not exists(select 1 from public.plan_documento_fuentes where revision_id=p_revision) then raise exception 'Faltan las fuentes conservadas de esta versión' using errcode='22023';end if;
 select value->>'categoria' into cat from jsonb_array_elements(coalesce(r.datos->'firmantes','[]'::jsonb)) where value->>'id'=p_espacio::text;
 if cat is null then raise exception 'Guarde una versión con los espacios de firma antes de firmar' using errcode='22023';end if;
 if exists(select 1 from public.plan_documento_firmas where revision_id=p_revision and espacio_id=p_espacio) then raise exception 'Ese espacio ya tiene una firma conservada' using errcode='22023';end if;
 insert into public.plan_documento_firmas(tenant_id,proyecto_id,documento_id,revision_id,espacio_id,categoria,contenido_sha256,imagen_png,imagen_sha256,registrada_por,solicitud_id)
 values(d.tenant_id,d.proyecto_id,d.id,p_revision,p_espacio,cat,r.contenido_sha256,p_imagen,ih,auth.uid(),p_solicitud) returning * into f;
 return f;
end $$;
revoke all on function public.plan_validar_espacios_firma(),public.plan_documento_firmas_leer(uuid),public.plan_documento_firmar(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.plan_documento_firmas_leer(uuid),public.plan_documento_firmar(uuid,text,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
