-- Additive release: a client's designated signature records the exact acta decision.
-- Rollback: revert frontend/renderer; leave immutable evidence intact, revoke new RPCs.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
create table public.plan_documento_conformidades (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),proyecto_id uuid not null references public.proyectos(id),
 documento_id uuid not null references public.plan_documentos(id),revision_id uuid not null unique references public.plan_documento_revisiones(id),firma_id uuid not null unique references public.plan_documento_firmas(id),
 contenido_sha256 text not null,decision text not null check(decision in ('Conforme','Conforme con observaciones','No conforme')),
 receptor text not null,calidad text not null check(calidad in ('Cliente','Contacto')),registrada_por uuid not null references auth.users(id),registrada_en timestamptz not null
);
create table public.plan_documento_pendientes (
 id uuid primary key default gen_random_uuid(),conformidad_id uuid not null references public.plan_documento_conformidades(id),espacio_id uuid not null,
 descripcion text not null,responsable text not null,fecha date not null,unique(conformidad_id,espacio_id)
);
create table public.plan_documento_pendiente_eventos (
 id uuid primary key default gen_random_uuid(),pendiente_id uuid not null unique references public.plan_documento_pendientes(id),
 constancia text not null check(length(btrim(constancia)) between 1 and 4000),resuelto_por uuid not null references auth.users(id),resuelto_en timestamptz not null default now(),solicitud_id uuid not null,
 unique(resuelto_por,solicitud_id)
);
alter table public.plan_documento_conformidades enable row level security;
alter table public.plan_documento_pendientes enable row level security;
alter table public.plan_documento_pendiente_eventos enable row level security;
revoke all on public.plan_documento_conformidades,public.plan_documento_pendientes,public.plan_documento_pendiente_eventos from anon,authenticated;
grant select on public.plan_documento_conformidades,public.plan_documento_pendientes,public.plan_documento_pendiente_eventos to service_role;
create function public.plan_conformidad_validar(p_datos jsonb) returns jsonb language plpgsql set search_path=pg_catalog,pg_temp as $$
declare c jsonb;p jsonb;n integer;
begin
 if coalesce(p_datos->'acta'->>'conformidadJSON','')='' then return null;end if;
 c:=(p_datos->'acta'->>'conformidadJSON')::jsonb;
 if jsonb_typeof(c)<>'object' or c->'version' is distinct from '1'::jsonb or coalesce(c->>'decision','') not in ('Conforme','Conforme con observaciones','No conforme') or
  jsonb_typeof(c->'receptor') is distinct from 'string' or length(btrim(c->>'receptor')) not between 1 and 200 or
  coalesce(c->>'calidad','') not in ('Cliente','Contacto') or c->'confirmada' is distinct from 'true'::jsonb or
  jsonb_typeof(c->'motivo') is distinct from 'string' or length(c->>'motivo')>4000 or jsonb_typeof(c->'pendientes') is distinct from 'array' then raise exception 'Revise decisión, receptor y confirmación de la conformidad' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(p_datos->'firmantes','[]'::jsonb)) s where s->>'id'=c->>'espacioReceptor' and s->>'categoria'=c->>'calidad') then raise exception 'El espacio de firma debe corresponder al receptor' using errcode='22023';end if;
 if c->>'decision'='No conforme' and length(btrim(c->>'motivo'))=0 then raise exception 'Indique el motivo de la no conformidad' using errcode='22023';end if;
 n:=jsonb_array_length(c->'pendientes');
 if n>100 or (c->>'decision'='Conforme' and n>0) or (c->>'decision'<>'Conforme' and n=0) then raise exception 'Revise los pendientes de esta decisión' using errcode='22023';end if;
 for p in select value from jsonb_array_elements(c->'pendientes') loop
  if jsonb_typeof(p)<>'object' or coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
   jsonb_typeof(p->'descripcion') is distinct from 'string' or length(btrim(p->>'descripcion')) not between 1 and 2000 or
   jsonb_typeof(p->'responsable') is distinct from 'string' or length(btrim(p->>'responsable')) not between 1 and 200 or
   coalesce(p->>'fecha','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Complete descripción, responsable y fecha del pendiente' using errcode='22023';end if;
  perform (p->>'fecha')::date;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(c->'pendientes'))<>n then raise exception 'Pendiente duplicado' using errcode='22023';end if;
 return c;
end $$;
create function public.plan_conformidad_validar_borrador() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if coalesce(new.datos->'acta'->>'conformidadJSON','')<>'' and not exists(select 1 from public.plan_documentos where id=new.documento_id and tipo='acta') then raise exception 'La conformidad corresponde al acta' using errcode='22023';end if;
 perform public.plan_conformidad_validar(new.datos);return new;
end $$;
create trigger plan_conformidad_validar before insert or update on public.plan_documento_borradores for each row execute function public.plan_conformidad_validar_borrador();
create function public.plan_conformidad_registrar_firma() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_documento_revisiones;c jsonb;cid uuid;p jsonb;
begin
 select * into r from public.plan_documento_revisiones where id=new.revision_id;
 if not exists(select 1 from public.plan_documentos where id=r.documento_id and tipo='acta') then return new;end if;
 c:=public.plan_conformidad_validar(r.datos);
 if c is null or c->>'espacioReceptor'<>new.espacio_id::text then return new;end if;
 if new.categoria<>c->>'calidad' or new.contenido_sha256<>r.contenido_sha256 then raise exception 'La firma no corresponde al receptor y versión' using errcode='22023';end if;
 if not exists(select 1 from public.plan_documento_fuentes where revision_id=r.id and fuentes->'orden'->>'estado'='Cerrada') then raise exception 'Guarde el cierre técnico antes de la conformidad' using errcode='22023';end if;
 insert into public.plan_documento_conformidades(tenant_id,proyecto_id,documento_id,revision_id,firma_id,contenido_sha256,decision,receptor,calidad,registrada_por,registrada_en)
 values(new.tenant_id,new.proyecto_id,new.documento_id,r.id,new.id,r.contenido_sha256,c->>'decision',c->>'receptor',c->>'calidad',new.registrada_por,new.registrada_en) returning id into cid;
 for p in select value from jsonb_array_elements(c->'pendientes') loop
  insert into public.plan_documento_pendientes(conformidad_id,espacio_id,descripcion,responsable,fecha) values(cid,(p->>'id')::uuid,p->>'descripcion',p->>'responsable',(p->>'fecha')::date);
 end loop;
 return new;
end $$;
create trigger plan_conformidad_registrar after insert on public.plan_documento_firmas for each row execute function public.plan_conformidad_registrar_firma();
create function public.plan_conformidad_inmutable() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin raise exception 'La conformidad y su seguimiento se conservan sin sobrescritura' using errcode='42501';end $$;
create trigger plan_conformidad_inmutable before update or delete on public.plan_documento_conformidades for each row execute function public.plan_conformidad_inmutable();
create trigger plan_pendiente_inmutable before update or delete on public.plan_documento_pendientes for each row execute function public.plan_conformidad_inmutable();
create trigger plan_resolucion_inmutable before update or delete on public.plan_documento_pendiente_eventos for each row execute function public.plan_conformidad_inmutable();
create function public.plan_documento_conformidad_leer(p_revision uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare proyecto uuid;c public.plan_documento_conformidades;
begin
 select d.proyecto_id into proyecto from public.plan_documento_revisiones r join public.plan_documentos d on d.id=r.documento_id where r.id=p_revision;
 if auth.uid() is null or proyecto is null or not public.plan_permiso_proyecto('informe.ver',proyecto) then raise exception 'Sin permiso para consultar esta conformidad' using errcode='42501';end if;
 select * into c from public.plan_documento_conformidades where revision_id=p_revision;
 return jsonb_build_object('conformidad',case when c.id is null then null else to_jsonb(c) end,'pendientes',(select coalesce(jsonb_agg(jsonb_build_object('id',p.espacio_id,'pendiente_id',p.id,'descripcion',p.descripcion,'responsable',p.responsable,'fecha',p.fecha,'resuelto_en',e.resuelto_en,'resuelto_por',e.resuelto_por,'constancia',e.constancia) order by p.fecha,p.id),'[]'::jsonb) from public.plan_documento_pendientes p left join public.plan_documento_pendiente_eventos e on e.pendiente_id=p.id where p.conformidad_id=c.id));
end $$;
create function public.plan_documento_pendiente_resolver(p_pendiente uuid,p_constancia text,p_solicitud uuid) returns public.plan_documento_pendiente_eventos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare p public.plan_documento_pendientes;c public.plan_documento_conformidades;e public.plan_documento_pendiente_eventos;
begin
 select * into p from public.plan_documento_pendientes where id=p_pendiente for update;select * into c from public.plan_documento_conformidades where id=p.conformidad_id;
 if auth.uid() is null or c.id is null or not public.plan_permiso_proyecto('informe.editar',c.proyecto_id) then raise exception 'Sin permiso para resolver este pendiente' using errcode='42501';end if;
 if p_solicitud is null or p_constancia is null or length(btrim(p_constancia)) not between 1 and 4000 then raise exception 'Indique una constancia de resolución (hasta 4000 caracteres)' using errcode='22023';end if;
 select * into e from public.plan_documento_pendiente_eventos where resuelto_por=auth.uid() and solicitud_id=p_solicitud;
 if e.id is not null then
  if e.pendiente_id<>p_pendiente or e.constancia<>btrim(p_constancia) then raise exception 'Solicitud reutilizada con otro seguimiento' using errcode='22023';end if;return e;
 end if;
 if exists(select 1 from public.plan_documento_pendiente_eventos where pendiente_id=p.id) then raise exception 'El pendiente ya fue resuelto. Actualice el seguimiento' using errcode='40001';end if;
 insert into public.plan_documento_pendiente_eventos(pendiente_id,constancia,resuelto_por,solicitud_id) values(p.id,btrim(p_constancia),auth.uid(),p_solicitud) returning * into e;return e;
end $$;
revoke all on function public.plan_conformidad_validar(jsonb),public.plan_conformidad_validar_borrador(),public.plan_conformidad_registrar_firma(),public.plan_conformidad_inmutable(),public.plan_documento_conformidad_leer(uuid),public.plan_documento_pendiente_resolver(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.plan_documento_conformidad_leer(uuid),public.plan_documento_pendiente_resolver(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';commit;
