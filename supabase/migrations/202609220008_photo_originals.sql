begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Preserve the surviving source. Previously deleted originals cannot be recreated.
create table public.plan_foto_originales (
 foto_id uuid primary key references public.fotos(id) on delete cascade,
 proyecto_id uuid not null,
 file_path text not null,
 file_url text not null
);
alter table public.plan_foto_originales enable row level security;
revoke all on public.plan_foto_originales from public,anon,authenticated;
grant select on public.plan_foto_originales to authenticated;
create policy originales_select on public.plan_foto_originales for select to authenticated
using(public.plan_es_miembro_proyecto(proyecto_id) and exists(select 1 from public.fotos f where f.id=foto_id));
insert into public.plan_foto_originales(foto_id,proyecto_id,file_path,file_url) select id,proyecto_id,file_path,file_url from public.fotos;
alter table public.fotos add column edicion jsonb not null default '{}'::jsonb check(jsonb_typeof(edicion)='object');
alter table public.fotos add column revision bigint not null default 0;
create function public.plan_conservar_original_foto() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 insert into public.plan_foto_originales(foto_id,proyecto_id,file_path,file_url) values(new.id,new.proyecto_id,new.file_path,new.file_url);
 return null;
end $$;
create trigger plan_conservar_original after insert on public.fotos for each row execute function public.plan_conservar_original_foto();
create function public.plan_revision_foto() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 new.revision:=case when tg_op='INSERT' then 0 else old.revision+1 end;
 return new;
end $$;
create trigger plan_revision_foto before insert or update on public.fotos for each row execute function public.plan_revision_foto();
-- Old clients used to delete the previous image after replacing it. Protect the
-- source even when such a client is still open. No existing storage policy widens.
create function public.plan_es_original_foto(p_path text) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.plan_foto_originales where file_path=p_path);
$$;
create policy plan_conservar_original_storage on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'fotos' or not public.plan_es_original_foto(name));
revoke all on function public.plan_conservar_original_foto(),public.plan_revision_foto(),public.plan_es_original_foto(text) from public,anon,authenticated;
grant execute on function public.plan_es_original_foto(text) to authenticated;
-- A civil date for this Paraguay deployment, including the hours after UTC midnight.
alter table public.ordenes alter column fecha_ingreso set default (timezone('America/Asuncion',now())::date);
create or replace function public.plan_registrar_cambio_ot() returns trigger
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
 a:=a-array['id','orden_id','proyecto_id','created_by','updated_by','uploaded_by','user_id','user_email','user_name','created_at','updated_at','uploaded_at','url_expires_at','file_url','file_path','plano_ref_url','conflict_flag','conflict_data','revision','acta_conformidad_url','informe_relevamiento_url','informe_avance_url','informe_cierre_url'];
 b:=b-array['id','orden_id','proyecto_id','created_by','updated_by','uploaded_by','user_id','user_email','user_name','created_at','updated_at','uploaded_at','url_expires_at','file_url','file_path','plano_ref_url','conflict_flag','conflict_data','revision','acta_conformidad_url','informe_relevamiento_url','informe_avance_url','informe_cierre_url'];
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

notify pgrst,'reload schema';
commit;
