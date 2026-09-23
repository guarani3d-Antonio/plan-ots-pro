begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Additive migration: no domain rows, memberships or previous audit are deleted.
create table public.plan_contratistas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 nombre text not null check(length(btrim(nombre)) between 1 and 160),
 nombre_clave text generated always as (lower(btrim(nombre))) stored,
 creado_por uuid,
 created_at timestamptz not null default now(),
 unique(tenant_id,nombre_clave)
);
alter table public.plan_contratistas enable row level security;
revoke all on public.plan_contratistas from public,anon,authenticated;
grant select on public.plan_contratistas to authenticated;
create policy contratistas_select on public.plan_contratistas for select to authenticated
 using(public.plan_es_creador() or tenant_id=public.plan_tenant_id());

create function public.plan_agregar_contratista(p_tenant uuid,p_nombre text)
 returns public.plan_contratistas language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.plan_contratistas;
begin
 if auth.uid() is null or not exists(select 1 from public.tenants t where t.id=p_tenant and t.activo)
 or not (public.plan_es_admin_tenant(p_tenant) or exists(
 select 1 from public.proyectos p where p.tenant_id=p_tenant and p.deleted_at is null and public.plan_puede_editar_proyecto(p.id))) then
 raise exception 'Sin permiso para agregar contratistas en esta empresa' using errcode='42501';end if;
 if p_nombre is null or length(btrim(p_nombre)) not between 1 and 160 then
 raise exception 'El nombre debe tener entre 1 y 160 caracteres' using errcode='22023';end if;
 insert into public.plan_contratistas(tenant_id,nombre,creado_por) values(p_tenant,btrim(p_nombre),auth.uid())
 on conflict(tenant_id,nombre_clave) do nothing;
 select * into r from public.plan_contratistas where tenant_id=p_tenant and nombre_clave=lower(btrim(p_nombre));
 return r;
end $$;

-- No FK to order/project: deletion must not erase evidence. Access still requires
-- a currently accessible project; orphan events are never returned to clients.
create table public.plan_ot_eventos (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid,
 proyecto_id uuid not null,
 orden_id uuid not null,
 ot text not null,
 actor_id uuid,
 actor_email text,
 tipo text not null,
 entidad_id uuid,
 cambios jsonb not null,
 restringido boolean not null default false,
 legado boolean not null default false,
 solicitud_id uuid unique,
 created_at timestamptz not null default clock_timestamp()
);
create index plan_eventos_orden on public.plan_ot_eventos(orden_id,created_at desc,id desc);
create index plan_eventos_proyecto on public.plan_ot_eventos(proyecto_id,created_at desc,id desc);
alter table public.plan_ot_eventos enable row level security;
revoke all on public.plan_ot_eventos from public,anon,authenticated;
grant select on public.plan_ot_eventos to authenticated;
create policy eventos_visibles on public.plan_ot_eventos for select to authenticated using(
 public.plan_es_miembro_proyecto(proyecto_id)
 and exists(select 1 from public.proyectos p where p.id=proyecto_id and p.deleted_at is null)
 and (not restringido or public.plan_es_supervisor_proyecto(proyecto_id)));

create table public.plan_eventos_lecturas (
 evento_id uuid not null references public.plan_ot_eventos(id),
 user_id uuid not null default auth.uid(),
 leido_at timestamptz not null default clock_timestamp(),
 primary key(evento_id,user_id)
);
alter table public.plan_eventos_lecturas enable row level security;
revoke all on public.plan_eventos_lecturas from public,anon,authenticated;
grant select,insert on public.plan_eventos_lecturas to authenticated;
create policy lecturas_select on public.plan_eventos_lecturas for select to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.plan_ot_eventos e where e.id=evento_id));
create policy lecturas_insert on public.plan_eventos_lecturas for insert to authenticated
 with check(user_id=auth.uid() and exists(select 1 from public.plan_ot_eventos e where e.id=evento_id));

create function public.plan_registrar_cambio_ot() returns trigger
 language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a jsonb; b jsonb; r jsonb; d jsonb; pid uuid; oid uuid; tid uuid; codigo text; tipo_evento text; campo text;
begin
 a:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 b:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 r:=case when tg_op='DELETE' then a else b end;
 pid:=(r->>'proyecto_id')::uuid;
 oid:=case when tg_table_name='ordenes' then (r->>'id')::uuid else (r->>'orden_id')::uuid end;
 if oid is null then return null;end if;
 select p.tenant_id into tid from public.proyectos p where p.id=pid;
 select o.ot into codigo from public.ordenes o where o.id=oid;
 codigo:=coalesce(codigo,r->>'ot',oid::text);
 -- Skip cascaded child deletion; the parent deletion retains its own event.
 if tg_op='DELETE' and tg_table_name<>'ordenes' and not exists(select 1 from public.ordenes o where o.id=oid) then return null;end if;
 tipo_evento:=tg_table_name||'.'||lower(tg_op);
 -- Exclude transport URLs, authors supplied by old clients and technical metadata.
 a:=a-array['id','orden_id','proyecto_id','created_by','updated_by','uploaded_by','user_id','user_email','user_name','created_at','updated_at','uploaded_at','url_expires_at','file_url','file_path','plano_ref_url','conflict_flag','conflict_data','acta_conformidad_url','informe_relevamiento_url','informe_avance_url','informe_cierre_url'];
 b:=b-array['id','orden_id','proyecto_id','created_by','updated_by','uploaded_by','user_id','user_email','user_name','created_at','updated_at','uploaded_at','url_expires_at','file_url','file_path','plano_ref_url','conflict_flag','conflict_data','acta_conformidad_url','informe_relevamiento_url','informe_avance_url','informe_cierre_url'];
 if tg_table_name='ordenes' then a:=a-'costo';b:=b-'costo';end if;
 d:='{}'::jsonb;
 for campo in select jsonb_object_keys(a||b) loop
 if a->campo is distinct from b->campo then d:=d||jsonb_build_object(campo,jsonb_build_object('antes',a->campo,'despues',b->campo));end if;
 end loop;
 if d<>'{}'::jsonb then
 insert into public.plan_ot_eventos(tenant_id,proyecto_id,orden_id,ot,actor_id,actor_email,tipo,entidad_id,cambios,restringido)
 values(tid,pid,oid,codigo,auth.uid(),(select u.email from auth.users u where u.id=auth.uid()),tipo_evento,
 coalesce((r->>'id')::uuid,oid),d,tg_table_name='orden_costos');
 end if;
 -- Compatibility with old clients: OT assignment and directory registration are
 -- one transaction, always in the project's company (never from a local cache).
 if tg_table_name='ordenes' and tg_op<>'DELETE' and tid is not null then
 insert into public.plan_contratistas(tenant_id,nombre,creado_por)
 select tid,btrim(v),auth.uid() from jsonb_array_elements_text(coalesce(nullif(r->'contratistas','null'::jsonb),'[]'::jsonb)) v
 where length(btrim(v)) between 1 and 160 on conflict(tenant_id,nombre_clave) do nothing;
 end if;
 return null;
end $$;
create trigger plan_audit_orden after insert or update or delete on public.ordenes for each row execute function public.plan_registrar_cambio_ot();
create trigger plan_audit_foto after insert or update or delete on public.fotos for each row execute function public.plan_registrar_cambio_ot();
create trigger plan_audit_costo after insert or update or delete on public.orden_costos for each row execute function public.plan_registrar_cambio_ot();
create trigger plan_audit_conversacion after insert or update or delete on public.comentarios_ot for each row execute function public.plan_registrar_cambio_ot();
create trigger plan_audit_estado after insert or update or delete on public.ot_comentarios for each row execute function public.plan_registrar_cambio_ot();

-- Preserve only actual historical facts, clearly distinguished from new events.
insert into public.plan_ot_eventos(id,tenant_id,proyecto_id,orden_id,ot,actor_id,actor_email,tipo,entidad_id,cambios,legado,created_at)
select c.id,p.tenant_id,c.proyecto_id,c.orden_id,o.ot,c.user_id,c.user_email,'estado.legado',c.id,
jsonb_build_object('estado',jsonb_build_object('antes',c.estado_anterior,'despues',c.estado_nuevo),
'comentario',jsonb_build_object('antes',null,'despues',c.comentario)),true,coalesce(c.created_at,o.created_at)
from public.ot_comentarios c join public.ordenes o on o.id=c.orden_id join public.proyectos p on p.id=c.proyecto_id;
insert into public.plan_contratistas(tenant_id,nombre,creado_por)
select p.tenant_id,btrim(v),null from public.ordenes o join public.proyectos p on p.id=o.proyecto_id
cross join lateral unnest(o.contratistas) v where p.tenant_id is not null and length(btrim(v)) between 1 and 160
on conflict(tenant_id,nombre_clave) do nothing;

create function public.plan_solicitar_exportacion(p_orden uuid,p_tipo text,p_formato text,p_solicitud uuid)
 returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare o public.ordenes; eid uuid;
begin
 select * into o from public.ordenes where id=p_orden and deleted_at is null;
 if auth.uid() is null or o.id is null or not public.plan_es_miembro_proyecto(o.proyecto_id)
 or not exists(select 1 from public.proyectos p where p.id=o.proyecto_id and p.deleted_at is null) then
 raise exception 'OT no disponible' using errcode='42501';end if;
 if p_tipo is null or p_tipo not in ('ficha','relevamiento','avance','cierre','acta') or p_formato is null or p_formato not in ('HTML','PDF') or p_solicitud is null then
 raise exception 'Solicitud de exportación inválida' using errcode='22023';end if;
 insert into public.plan_ot_eventos(tenant_id,proyecto_id,orden_id,ot,actor_id,actor_email,tipo,cambios,solicitud_id)
 values((select tenant_id from public.proyectos where id=o.proyecto_id),o.proyecto_id,o.id,o.ot,auth.uid(),
 (select email from auth.users where id=auth.uid()),'informe.solicitado',jsonb_build_object(
 'informe',jsonb_build_object('antes',null,'despues',p_tipo),'formato',jsonb_build_object('antes',null,'despues',p_formato)),p_solicitud)
 on conflict(solicitud_id) do nothing returning id into eid;
 if eid is null then
 select id into eid from public.plan_ot_eventos where solicitud_id=p_solicitud and actor_id=auth.uid() and orden_id=p_orden
 and cambios->'informe'->>'despues'=p_tipo and cambios->'formato'->>'despues'=p_formato;
 if eid is null then raise exception 'Identificador de solicitud ya utilizado' using errcode='22023';end if;
 end if;
 return eid;
end $$;

-- Invoker: both the events and read receipts are filtered by their own RLS.
create function public.plan_eventos_pagina(p_orden uuid default null,p_antes timestamptz default null,p_id uuid default null)
 returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 with pagina as (
 select e.*,exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid()) as leida
 from public.plan_ot_eventos e
 where (p_orden is null and not e.legado or e.orden_id=p_orden)
 and (p_antes is null or (e.created_at,e.id)<(p_antes,p_id))
 order by e.created_at desc,e.id desc limit 51
 ) select jsonb_build_object('eventos',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from
 (select * from pagina order by created_at desc,id desc limit 50) x),'[]'::jsonb),
 'hayMas',(select count(*)>50 from pagina),
 'sinLeer',(select count(*) from public.plan_ot_eventos e where not e.legado and not exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid())));
 $$;
revoke all on function public.plan_agregar_contratista(uuid,text),public.plan_registrar_cambio_ot(),public.plan_solicitar_exportacion(uuid,text,text,uuid),public.plan_eventos_pagina(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.plan_agregar_contratista(uuid,text),public.plan_solicitar_exportacion(uuid,text,text,uuid),public.plan_eventos_pagina(uuid,timestamptz,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
