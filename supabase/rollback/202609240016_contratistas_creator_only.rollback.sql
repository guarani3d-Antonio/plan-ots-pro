begin;
create or replace function public.plan_agregar_contratista(p_tenant uuid,p_nombre text)
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
commit;

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

commit;
