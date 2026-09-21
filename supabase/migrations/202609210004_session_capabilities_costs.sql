begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
do $$ begin
 if current_user<>'postgres' or to_regprocedure('public.plan_storage_permitido(text,text,text)') is null then raise exception 'Requiere postgres y fase 3';end if;
end $$;

-- La columna antigua queda siempre NULL: REST, filtros, vistas y Realtime no
-- transportan importes a técnicos. La relación opcional se protege con RLS.
create table public.orden_costos (
 orden_id uuid primary key,
 proyecto_id uuid not null,
 costo numeric,
 foreign key(proyecto_id,orden_id) references public.ordenes(proyecto_id,id) on delete cascade deferrable initially deferred
);
alter table public.orden_costos enable row level security;
revoke all on public.orden_costos from public,anon,authenticated;
grant select on public.orden_costos to authenticated;
create policy costos_select on public.orden_costos for select to authenticated
using(public.plan_es_supervisor_proyecto(proyecto_id) and exists(select 1 from public.ordenes o join public.proyectos p on p.id=o.proyecto_id where o.id=orden_id and o.deleted_at is null and p.deleted_at is null));
insert into public.orden_costos(orden_id,proyecto_id,costo) select id,proyecto_id,costo from public.ordenes where costo is not null;
-- La copia no representa una edición de usuario: conservar fechas/autores.
alter table public.ordenes disable trigger user;
update public.ordenes set costo=null where costo is not null;
alter table public.ordenes enable trigger user;
alter table public.ordenes add constraint plan_costo_no_publico check(costo is null);

create function public.plan_separar_costo() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.costo is not null then
   if auth.uid() is not null and not public.plan_es_supervisor_proyecto(new.proyecto_id) then
     raise exception 'El costo requiere permiso de supervisor' using errcode='42501';end if;
   insert into public.orden_costos(orden_id,proyecto_id,costo) values(new.id,new.proyecto_id,new.costo)
   on conflict(orden_id) do update set costo=excluded.costo;
   new.costo:=null;
 end if;
 return new;
end $$;
revoke all on function public.plan_separar_costo() from public,anon,authenticated;
create trigger plan_separar_costo before insert or update on public.ordenes for each row execute function public.plan_separar_costo();

-- Los snapshots completos pueden contener costos: solo supervisor. El legado
-- se conserva íntegro y no se entrega como JSON parcialmente enmascarado.
drop policy versiones_select on public.versiones;
drop policy versiones_insert on public.versiones;
create policy versiones_select on public.versiones for select to authenticated using(public.plan_es_supervisor_proyecto(proyecto_id));
create policy versiones_insert on public.versiones for insert to authenticated with check(public.plan_es_supervisor_proyecto(proyecto_id) and (created_by is null or created_by=auth.uid()));

create or replace function public.fn_audit_orden_eliminada() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 insert into public.ordenes_eliminadas(orden_id,proyecto_id,ot,ubicacion,rubro,estado,responsable,prioridad,pos_x,pos_y,datos_completos,eliminado_por)
 values(old.id,old.proyecto_id,old.ot,old.ubicacion,old.rubro,old.estado,old.responsable,old.prioridad,old.pos_x,old.pos_y,
 to_jsonb(old)||jsonb_build_object('costo',(select costo from public.orden_costos where orden_id=old.id)),auth.uid());
 return old;
end $$;

create function public.plan_contexto_acceso() returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object(
  'creador',public.plan_es_creador(),
  'empresas',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'nombre',t.nombre,'activa',t.activo,
   'rol',case when public.plan_es_creador() then 'creador' else (select rol from public.tenant_miembros where tenant_id=t.id and user_id=auth.uid() and activo) end,
   'puede_crear',t.activo and public.plan_puede_crear_proyecto(t.id)) order by t.id) from public.tenants t),'[]'::jsonb),
  'obras',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'nombre',p.nombre,
   'editar',public.plan_puede_editar_proyecto(p.id),'administrar',public.plan_es_supervisor_proyecto(p.id),'ver_costos',public.plan_es_supervisor_proyecto(p.id)) order by p.id)
   from public.proyectos p where p.deleted_at is null),'[]'::jsonb));
$$;

-- Administración acotada del Creador, sin credenciales administrativas en web.
create function public.plan_admin_empresa(p_nombre text,p_id uuid default null,p_activa boolean default true) returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not public.plan_es_creador() then raise exception 'Solo Creador' using errcode='42501';end if;
 if nullif(btrim(p_nombre),'') is null then raise exception 'Falta el nombre';end if;
 if p_id is null then insert into public.tenants(id,nombre,slug,activo) values(v_id,btrim(p_nombre),'empresa-'||v_id::text,p_activa);
 else update public.tenants set nombre=btrim(p_nombre),activo=p_activa where id=p_id;
 if not found then raise exception 'Empresa inexistente';end if;end if;
 return v_id;
end $$;
create function public.plan_admin_miembro(p_tenant uuid,p_email text,p_rol text,p_activo boolean default true) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
 if not public.plan_es_creador() then raise exception 'Solo Creador' using errcode='42501';end if;
 select id into v_user from auth.users where lower(email)=lower(btrim(p_email));
 if v_user is null then raise exception 'La cuenta debe existir previamente en Auth';end if;
 insert into public.tenant_miembros(tenant_id,user_id,rol,activo) values(p_tenant,v_user,p_rol,p_activo)
 on conflict(tenant_id,user_id) do update set rol=excluded.rol,activo=excluded.activo;
end $$;
create function public.plan_admin_obra_miembro(p_proyecto uuid,p_email text,p_rol text) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_user uuid;
begin
 if not public.plan_es_creador() then raise exception 'Solo Creador' using errcode='42501';end if;
 select id into v_user from auth.users where lower(email)=lower(btrim(p_email));
 if v_user is null then raise exception 'La cuenta debe existir previamente en Auth';end if;
 if p_rol='sin_acceso' then delete from public.proyecto_miembros where proyecto_id=p_proyecto and user_id=v_user;
 else insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por) values(p_proyecto,v_user,p_rol,auth.uid())
 on conflict(proyecto_id,user_id) do update set rol=excluded.rol;end if;
end $$;
revoke all on function public.plan_contexto_acceso(),public.plan_admin_empresa(text,uuid,boolean),public.plan_admin_miembro(uuid,text,text,boolean),public.plan_admin_obra_miembro(uuid,text,text) from public,anon,authenticated;
grant execute on function public.plan_contexto_acceso(),public.plan_admin_empresa(text,uuid,boolean),public.plan_admin_miembro(uuid,text,text,boolean),public.plan_admin_obra_miembro(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
