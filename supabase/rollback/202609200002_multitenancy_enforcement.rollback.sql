-- Rollback de fase 2 a fase 1. Solo válido antes del aprovisionamiento.
-- Restaura políticas/grants legados deliberadamente para recuperar compatibilidad.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
lock table public.proyectos,public.proyecto_miembros,public.tenants,public.tenant_miembros,public.plataforma_administradores in access exclusive mode;
do $$ begin
  if exists(select 1 from public.tenants) or exists(select 1 from public.tenant_miembros)
    or exists(select 1 from public.plataforma_administradores)
    or exists(select 1 from public.proyectos where tenant_id is not null)
    or exists(select 1 from public.proyecto_miembros where tenant_id is not null) then
    raise exception 'Rollback fase 2 detenido: existen asignaciones multitenant';
  end if;
end $$;

do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs')
  loop execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;
drop policy plataforma_administradores_ver on public.plataforma_administradores;
create policy plataforma_administradores_ver_propio on public.plataforma_administradores for select to authenticated using(user_id=auth.uid() and activo);

drop trigger plan_normalizar_tenant_miembro on public.proyecto_miembros;
drop trigger plan_normalizar_tenant_proyecto on public.proyectos;
drop function public.plan_normalizar_tenant_miembro();
drop function public.plan_normalizar_tenant_proyecto();

create function public.plan_proteger_tenant_transicion()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if current_user not in ('postgres','service_role') then
    if tg_op='INSERT' and new.tenant_id is not null then raise exception 'Asignación de empresa reservada al aprovisionamiento' using errcode='42501'; end if;
    if tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id then raise exception 'No se permite cambiar la empresa del registro' using errcode='42501'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.plan_proteger_tenant_transicion() from public,anon,authenticated;
create trigger plan_proteger_tenant_proyecto before insert or update on public.proyectos for each row execute function public.plan_proteger_tenant_transicion();
create trigger plan_proteger_tenant_miembro before insert or update on public.proyecto_miembros for each row execute function public.plan_proteger_tenant_transicion();

create or replace function public.es_miembro(p_proyecto_id uuid) returns boolean language sql security definer as $$
  select exists(select 1 from proyecto_miembros where proyecto_id=p_proyecto_id and user_id=auth.uid());
$$;
create or replace function public.es_supervisor(p_proyecto_id uuid) returns boolean language sql security definer as $$
  select exists(select 1 from proyecto_miembros where proyecto_id=p_proyecto_id and user_id=auth.uid() and rol='supervisor');
$$;
create or replace function public.agregar_creador_como_supervisor() returns trigger language plpgsql security definer as $$
begin insert into proyecto_miembros(proyecto_id,user_id,rol,invitado_por) values(new.id,new.created_by,'supervisor',new.created_by); return new; end; $$;
create or replace function public.fn_audit_orden_eliminada() returns trigger language plpgsql security definer as $$
begin insert into ordenes_eliminadas(orden_id,proyecto_id,ot,ubicacion,rubro,estado,responsable,prioridad,pos_x,pos_y,datos_completos,eliminado_por)
values(old.id,old.proyecto_id,old.ot,old.ubicacion,old.rubro,old.estado,old.responsable,old.prioridad,old.pos_x,old.pos_y,row_to_json(old)::jsonb,auth.uid()); return old; end; $$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
grant execute on function public.es_miembro(uuid),public.es_supervisor(uuid) to public,anon,authenticated;
grant execute on function public.agregar_creador_como_supervisor(),public.fn_audit_orden_eliminada(),public.set_updated_at() to public,anon,authenticated;
drop function public.plan_puede_crear_proyecto(uuid);
drop function public.plan_es_supervisor_proyecto(uuid);
drop function public.plan_puede_editar_proyecto(uuid);
drop function public.plan_es_miembro_proyecto(uuid);

alter table public.ot_comentarios drop constraint ot_comentarios_proyecto_orden_fkey;
alter table public.comentarios_ot drop constraint comentarios_ot_proyecto_orden_fkey;
alter table public.fotos drop constraint fotos_proyecto_campo_fkey;
alter table public.fotos drop constraint fotos_proyecto_orden_fkey;
alter table public.proyecto_miembros drop constraint proyecto_miembros_tenant_proyecto_fkey;
alter table public.campos_definicion drop constraint campos_definicion_proyecto_id_id_key;
alter table public.ordenes drop constraint ordenes_proyecto_id_id_key;
alter table public.proyectos drop constraint proyectos_tenant_id_id_key;

create policy "Ver proyectos propios" on public.proyectos for select using(public.es_miembro(id) or created_by=auth.uid());
create policy "Crear proyectos" on public.proyectos for insert with check(created_by=auth.uid());
create policy "Editar proyectos (solo supervisor)" on public.proyectos for update using(public.es_supervisor(id));
create policy "Eliminar proyectos (solo supervisor)" on public.proyectos for delete using(public.es_supervisor(id));
create policy "Ver miembros del proyecto" on public.proyecto_miembros for select using(public.es_miembro(proyecto_id));
create policy "Gestionar miembros (solo supervisor)" on public.proyecto_miembros for all using(public.es_supervisor(proyecto_id));
create policy "Ver órdenes del proyecto" on public.ordenes for select using(public.es_miembro(proyecto_id));
create policy "Crear órdenes (supervisor y técnico)" on public.ordenes for insert with check(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ordenes.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico')));
create policy "Editar órdenes (supervisor y técnico)" on public.ordenes for update using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ordenes.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico')));
create policy "Eliminar órdenes (solo supervisor)" on public.ordenes for delete using(public.es_supervisor(proyecto_id));
create policy supervisores_pueden_eliminar_ordenes on public.ordenes for delete using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ordenes.proyecto_id and pm.user_id=auth.uid() and pm.rol='supervisor'));
create policy "Ver fotos del proyecto" on public.fotos for select using(public.es_miembro(proyecto_id));
create policy "Subir fotos (supervisor y técnico)" on public.fotos for insert with check(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=fotos.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico')));
create policy fotos_update_miembros on public.fotos for update using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=fotos.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico'))) with check(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=fotos.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico')));
create policy "Eliminar fotos (supervisor y técnico propietario)" on public.fotos for delete using(public.es_supervisor(proyecto_id) or uploaded_by=auth.uid());
create policy "Ver campos del proyecto" on public.campos_definicion for select using(public.es_miembro(proyecto_id));
create policy "Gestionar campos (solo supervisor)" on public.campos_definicion for all using(public.es_supervisor(proyecto_id)) with check(public.es_supervisor(proyecto_id));
create policy comentarios_read on public.comentarios_ot for select using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=comentarios_ot.proyecto_id and pm.user_id=auth.uid()));
create policy comentarios_insert on public.comentarios_ot for insert with check(auth.uid()=user_id and exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=comentarios_ot.proyecto_id and pm.user_id=auth.uid() and pm.rol<>'lector'));
create policy comentarios_delete on public.comentarios_ot for delete using(auth.uid()=user_id);
create policy "Miembros leen comentarios de su proyecto" on public.ot_comentarios for select using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ot_comentarios.proyecto_id and pm.user_id=auth.uid()));
create policy "Miembros no-viewer crean comentarios" on public.ot_comentarios for insert with check(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ot_comentarios.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico','creador','editor')));
create policy "Ver versiones del proyecto" on public.versiones for select using(public.es_miembro(proyecto_id));
create policy "Crear versiones (supervisor y técnico)" on public.versiones for insert with check(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=versiones.proyecto_id and pm.user_id=auth.uid() and pm.rol in('supervisor','tecnico')));
create policy "Restaurar versión (solo supervisor)" on public.versiones for update using(public.es_supervisor(proyecto_id));
create policy versiones_delete on public.versiones for delete using(created_by=auth.uid());
create policy "Ver sync_log del proyecto" on public.sync_log for select using(public.es_miembro(proyecto_id));
create policy "Insertar en sync_log" on public.sync_log for insert with check(user_id=auth.uid());
create policy eventos_uso_select_propio on public.eventos_uso for select to authenticated using(auth.uid()=user_id);
create policy eventos_uso_insert_propio on public.eventos_uso for insert to authenticated with check(auth.uid()=user_id);
create policy supervisores_ven_eliminadas on public.ordenes_eliminadas for select using(exists(select 1 from public.proyecto_miembros pm where pm.proyecto_id=ordenes_eliminadas.proyecto_id and pm.user_id=auth.uid() and pm.rol='supervisor'));
create policy users_own_config on public.dashboard_configs for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

grant all privileges on table public.proyectos,public.proyecto_miembros,public.ordenes,public.fotos,public.campos_definicion,public.comentarios_ot,public.ot_comentarios,public.versiones,public.sync_log,public.eventos_uso,public.ordenes_eliminadas,public.dashboard_configs,public.vista_proyectos_resumen,public.vista_ordenes_fotos to anon,authenticated;
commit;
