-- Plan-OTs · aislamiento multitenant, fase 2
-- Se aplica después de 202609200001. Mantiene visibles los proyectos legados
-- con tenant_id null solo para sus miembros históricos hasta el reset acordado.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $$ begin
  if current_user <> 'postgres' then
    raise exception 'Ejecutar fase 2 mediante el rol administrativo postgres';
  end if;
  if to_regclass('public.tenants') is null then
    raise exception 'Falta la fase 1 multitenant';
  end if;
end $$;

-- Integridad: toda referencia que lleva proyecto + entidad debe apuntar a la
-- misma obra. Las restricciones se validan antes del commit y abortan todo si
-- el catálogo legado ya contiene una referencia cruzada.
alter table public.proyectos
  add constraint proyectos_tenant_id_id_key unique (tenant_id, id);
alter table public.ordenes
  add constraint ordenes_proyecto_id_id_key unique (proyecto_id, id);
alter table public.campos_definicion
  add constraint campos_definicion_proyecto_id_id_key unique (proyecto_id, id);

update public.proyecto_miembros pm
set tenant_id = p.tenant_id
from public.proyectos p
where p.id = pm.proyecto_id
  and p.tenant_id is not null
  and pm.tenant_id is distinct from p.tenant_id;

alter table public.proyecto_miembros add constraint proyecto_miembros_tenant_proyecto_fkey
  foreign key (tenant_id, proyecto_id)
  references public.proyectos(tenant_id, id) not valid;
alter table public.fotos add constraint fotos_proyecto_orden_fkey
  foreign key (proyecto_id, orden_id)
  references public.ordenes(proyecto_id, id) not valid;
alter table public.fotos add constraint fotos_proyecto_campo_fkey
  foreign key (proyecto_id, campo_id)
  references public.campos_definicion(proyecto_id, id) not valid;
alter table public.comentarios_ot add constraint comentarios_ot_proyecto_orden_fkey
  foreign key (proyecto_id, orden_id)
  references public.ordenes(proyecto_id, id) not valid;
alter table public.ot_comentarios add constraint ot_comentarios_proyecto_orden_fkey
  foreign key (proyecto_id, orden_id)
  references public.ordenes(proyecto_id, id) not valid;

alter table public.proyecto_miembros validate constraint proyecto_miembros_tenant_proyecto_fkey;
alter table public.fotos validate constraint fotos_proyecto_orden_fkey;
alter table public.fotos validate constraint fotos_proyecto_campo_fkey;
alter table public.comentarios_ot validate constraint comentarios_ot_proyecto_orden_fkey;
alter table public.ot_comentarios validate constraint ot_comentarios_proyecto_orden_fkey;

create function public.plan_es_miembro_proyecto(p_proyecto_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_creador() or exists (
    select 1
    from public.proyectos p
    join public.proyecto_miembros pm
      on pm.proyecto_id = p.id and pm.user_id = auth.uid()
    left join public.tenants t on t.id = p.tenant_id
    left join public.tenant_miembros tm
      on tm.tenant_id = p.tenant_id and tm.user_id = auth.uid() and tm.activo
    where p.id = p_proyecto_id
      and (
        (p.tenant_id is null and pm.tenant_id is null)
        or (p.tenant_id is not null and t.activo and pm.tenant_id = p.tenant_id and tm.user_id is not null)
      )
  );
$$;

create function public.plan_puede_editar_proyecto(p_proyecto_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_creador() or exists (
    select 1
    from public.proyectos p
    join public.proyecto_miembros pm
      on pm.proyecto_id = p.id and pm.user_id = auth.uid()
      and pm.rol in ('supervisor','tecnico')
    left join public.tenants t on t.id = p.tenant_id
    left join public.tenant_miembros tm
      on tm.tenant_id = p.tenant_id and tm.user_id = auth.uid() and tm.activo
    where p.id = p_proyecto_id
      and ((p.tenant_id is null and pm.tenant_id is null)
        or (p.tenant_id is not null and t.activo and pm.tenant_id = p.tenant_id and tm.user_id is not null))
  );
$$;

create function public.plan_es_supervisor_proyecto(p_proyecto_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_creador() or exists (
    select 1
    from public.proyectos p
    join public.proyecto_miembros pm
      on pm.proyecto_id = p.id and pm.user_id = auth.uid() and pm.rol = 'supervisor'
    left join public.tenants t on t.id = p.tenant_id
    left join public.tenant_miembros tm
      on tm.tenant_id = p.tenant_id and tm.user_id = auth.uid() and tm.activo
    where p.id = p_proyecto_id
      and ((p.tenant_id is null and pm.tenant_id is null)
        or (p.tenant_id is not null and t.activo and pm.tenant_id = p.tenant_id and tm.user_id is not null))
  );
$$;

create function public.plan_puede_crear_proyecto(p_tenant_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_creador() or exists (
    select 1 from public.tenants t
    join public.tenant_miembros tm on tm.tenant_id=t.id
    where t.id=p_tenant_id and t.activo and tm.user_id=auth.uid()
      and tm.activo and tm.rol in ('administrador','supervisor')
  );
$$;

-- Compatibilidad de firmas antiguas: las políticas y cualquier RPC histórico
-- pasan por las comprobaciones nuevas.
create or replace function public.es_miembro(p_proyecto_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_miembro_proyecto(p_proyecto_id);
$$;
create or replace function public.es_supervisor(p_proyecto_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select public.plan_es_supervisor_proyecto(p_proyecto_id);
$$;

-- Endurecer también los trigger functions heredados. Nunca se invocan desde el
-- cliente, por lo que no necesitan EXECUTE para anon/authenticated.
create or replace function public.agregar_creador_como_supervisor()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  values(new.id,new.created_by,'supervisor',new.created_by);
  return new;
end;
$$;
create or replace function public.fn_audit_orden_eliminada()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  insert into public.ordenes_eliminadas(
    orden_id,proyecto_id,ot,ubicacion,rubro,estado,responsable,prioridad,
    pos_x,pos_y,datos_completos,eliminado_por
  ) values(
    old.id,old.proyecto_id,old.ot,old.ubicacion,old.rubro,old.estado,old.responsable,old.prioridad,
    old.pos_x,old.pos_y,pg_catalog.to_jsonb(old),auth.uid()
  );
  return old;
end;
$$;
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp as $$
begin new.updated_at=pg_catalog.now(); return new; end;
$$;

revoke all on function public.plan_es_miembro_proyecto(uuid) from public, anon, authenticated;
revoke all on function public.plan_puede_editar_proyecto(uuid) from public, anon, authenticated;
revoke all on function public.plan_es_supervisor_proyecto(uuid) from public, anon, authenticated;
revoke all on function public.plan_puede_crear_proyecto(uuid) from public, anon, authenticated;
revoke all on function public.es_miembro(uuid) from public, anon, authenticated;
revoke all on function public.es_supervisor(uuid) from public, anon, authenticated;
revoke all on function public.agregar_creador_como_supervisor() from public, anon, authenticated;
revoke all on function public.fn_audit_orden_eliminada() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.plan_es_miembro_proyecto(uuid) to authenticated;
grant execute on function public.plan_puede_editar_proyecto(uuid) to authenticated;
grant execute on function public.plan_es_supervisor_proyecto(uuid) to authenticated;
grant execute on function public.plan_puede_crear_proyecto(uuid) to authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_supervisor(uuid) to authenticated;

drop trigger plan_proteger_tenant_miembro on public.proyecto_miembros;
drop trigger plan_proteger_tenant_proyecto on public.proyectos;
drop function public.plan_proteger_tenant_transicion();

create function public.plan_normalizar_tenant_proyecto()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp as $$
begin
  if current_user not in ('postgres','service_role') then
    if tg_op = 'INSERT' then
      new.created_by := coalesce(new.created_by, auth.uid());
      new.tenant_id := coalesce(new.tenant_id, public.plan_tenant_id());
      if new.created_by is distinct from auth.uid()
         or new.tenant_id is null
         or not public.plan_puede_crear_proyecto(new.tenant_id) then
        raise exception 'Empresa o creador no autorizado' using errcode='42501';
      end if;
    elsif new.tenant_id is distinct from old.tenant_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Empresa y creador son inmutables' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

create function public.plan_normalizar_tenant_miembro()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp as $$
declare
  v_tenant_id uuid;
  v_rol_tenant text;
begin
  if tg_op='UPDATE' and (new.proyecto_id is distinct from old.proyecto_id or new.user_id is distinct from old.user_id) then
    raise exception 'Proyecto y usuario de la membresía son inmutables' using errcode='42501';
  end if;
  select p.tenant_id into v_tenant_id from public.proyectos p where p.id=new.proyecto_id;
  if not found then raise exception 'Proyecto inexistente' using errcode='23503'; end if;
  new.tenant_id := v_tenant_id;
  if v_tenant_id is not null then
    select tm.rol into v_rol_tenant from public.tenant_miembros tm
    join public.tenants t on t.id=tm.tenant_id and t.activo
    where tm.tenant_id=v_tenant_id and tm.user_id=new.user_id and tm.activo;
    if v_rol_tenant is null then
      raise exception 'El usuario no pertenece a la empresa activa' using errcode='42501';
    end if;
    if (v_rol_tenant='viewer' and new.rol<>'viewer')
      or (v_rol_tenant='tecnico' and new.rol='supervisor') then
      raise exception 'El rol de obra supera al rol de empresa' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.plan_normalizar_tenant_proyecto() from public, anon, authenticated;
revoke all on function public.plan_normalizar_tenant_miembro() from public, anon, authenticated;
create trigger plan_normalizar_tenant_proyecto before insert or update on public.proyectos
for each row execute function public.plan_normalizar_tenant_proyecto();
create trigger plan_normalizar_tenant_miembro before insert or update on public.proyecto_miembros
for each row execute function public.plan_normalizar_tenant_miembro();

-- Se retiran todas las políticas históricas de las tablas de dominio.
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in (
      'proyectos','proyecto_miembros','ordenes','fotos','campos_definicion',
      'comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso',
      'ordenes_eliminadas','dashboard_configs')
  loop execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;

create policy proyectos_select on public.proyectos for select to authenticated
using (public.plan_es_miembro_proyecto(id));
create policy proyectos_insert on public.proyectos for insert to authenticated
with check (created_by=auth.uid() and tenant_id is not null and public.plan_puede_crear_proyecto(tenant_id));
create policy proyectos_update on public.proyectos for update to authenticated
using (public.plan_es_supervisor_proyecto(id)) with check (public.plan_es_supervisor_proyecto(id));
create policy proyectos_delete on public.proyectos for delete to authenticated
using (public.plan_es_supervisor_proyecto(id));

create policy proyecto_miembros_select on public.proyecto_miembros for select to authenticated
using (public.plan_es_miembro_proyecto(proyecto_id));
create policy proyecto_miembros_insert on public.proyecto_miembros for insert to authenticated
with check (public.plan_es_supervisor_proyecto(proyecto_id));
create policy proyecto_miembros_update on public.proyecto_miembros for update to authenticated
using (public.plan_es_supervisor_proyecto(proyecto_id)) with check (public.plan_es_supervisor_proyecto(proyecto_id));
create policy proyecto_miembros_delete on public.proyecto_miembros for delete to authenticated
using (public.plan_es_supervisor_proyecto(proyecto_id));

create policy ordenes_select on public.ordenes for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy ordenes_insert on public.ordenes for insert to authenticated with check (public.plan_puede_editar_proyecto(proyecto_id) and (created_by is null or created_by=auth.uid()));
create policy ordenes_update on public.ordenes for update to authenticated using (public.plan_puede_editar_proyecto(proyecto_id)) with check (public.plan_puede_editar_proyecto(proyecto_id));
create policy ordenes_delete on public.ordenes for delete to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id));

create policy fotos_select on public.fotos for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy fotos_insert on public.fotos for insert to authenticated with check (public.plan_puede_editar_proyecto(proyecto_id) and (uploaded_by is null or uploaded_by=auth.uid()));
create policy fotos_update on public.fotos for update to authenticated using (public.plan_puede_editar_proyecto(proyecto_id)) with check (public.plan_puede_editar_proyecto(proyecto_id));
create policy fotos_delete on public.fotos for delete to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id) or (uploaded_by=auth.uid() and public.plan_es_miembro_proyecto(proyecto_id)));

create policy campos_select on public.campos_definicion for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy campos_write on public.campos_definicion for all to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id)) with check (public.plan_es_supervisor_proyecto(proyecto_id));

create policy comentarios_select on public.comentarios_ot for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy comentarios_insert on public.comentarios_ot for insert to authenticated with check (user_id=auth.uid() and public.plan_puede_editar_proyecto(proyecto_id));
create policy comentarios_delete on public.comentarios_ot for delete to authenticated using ((user_id=auth.uid() and public.plan_es_miembro_proyecto(proyecto_id)) or public.plan_es_supervisor_proyecto(proyecto_id));
create policy ot_comentarios_select on public.ot_comentarios for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy ot_comentarios_insert on public.ot_comentarios for insert to authenticated with check ((user_id is null or user_id=auth.uid()) and public.plan_puede_editar_proyecto(proyecto_id));

create policy versiones_select on public.versiones for select to authenticated using (public.plan_es_miembro_proyecto(proyecto_id));
create policy versiones_insert on public.versiones for insert to authenticated with check (public.plan_puede_editar_proyecto(proyecto_id) and (created_by is null or created_by=auth.uid()));
create policy versiones_update on public.versiones for update to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id)) with check (public.plan_es_supervisor_proyecto(proyecto_id));
create policy versiones_delete on public.versiones for delete to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id));
create policy eliminadas_select on public.ordenes_eliminadas for select to authenticated using (public.plan_es_supervisor_proyecto(proyecto_id));
create policy sync_log_select on public.sync_log for select to authenticated using (proyecto_id is null and user_id=auth.uid() or public.plan_es_miembro_proyecto(proyecto_id));
create policy sync_log_insert on public.sync_log for insert to authenticated with check (user_id=auth.uid() and (proyecto_id is null or public.plan_puede_editar_proyecto(proyecto_id)));
create policy eventos_select on public.eventos_uso for select to authenticated using (user_id=auth.uid());
create policy eventos_insert on public.eventos_uso for insert to authenticated with check (user_id=auth.uid() and (proyecto_id is null or public.plan_es_miembro_proyecto(proyecto_id)));
create policy dashboard_own on public.dashboard_configs for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Privilegios mínimos. RLS decide las filas; anon no recibe acceso al dominio.
revoke all on table public.proyectos, public.proyecto_miembros, public.ordenes, public.fotos,
  public.campos_definicion, public.comentarios_ot, public.ot_comentarios, public.versiones,
  public.sync_log, public.eventos_uso, public.ordenes_eliminadas, public.dashboard_configs
  from public, anon, authenticated;
grant select,insert,update,delete on table public.proyectos, public.proyecto_miembros,
  public.ordenes, public.fotos, public.campos_definicion, public.comentarios_ot,
  public.ot_comentarios, public.versiones, public.sync_log, public.eventos_uso,
  public.dashboard_configs to authenticated;
grant select on table public.ordenes_eliminadas to authenticated;
revoke all on table public.vista_proyectos_resumen, public.vista_ordenes_fotos from public, anon, authenticated;
grant select on table public.vista_proyectos_resumen, public.vista_ordenes_fotos to authenticated;

drop policy plataforma_administradores_ver_propio on public.plataforma_administradores;
create policy plataforma_administradores_ver on public.plataforma_administradores for select to authenticated
using (public.plan_es_creador() or (user_id=auth.uid() and activo));

comment on function public.plan_es_miembro_proyecto(uuid) is 'Acceso efectivo a obra: membresía de obra + empresa activa, con compatibilidad temporal para obras legadas.';
comment on function public.plan_puede_editar_proyecto(uuid) is 'Edición de contenido limitada a supervisor/técnico de una obra accesible.';

commit;
