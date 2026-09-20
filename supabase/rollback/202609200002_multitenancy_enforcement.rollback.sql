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
drop function public.plan_crear_proyecto(text,text,text,text,text[],text[],uuid);
do $$ declare t text; begin
  foreach t in array array['ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','dashboard_configs'] loop
    execute format('drop trigger plan_validar_autoria on public.%I',t);
  end loop;
end $$;
drop function public.plan_validar_autoria();

create function public.plan_proteger_tenant_transicion()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp as $$
begin
  if current_user not in ('postgres','service_role') then
    if tg_op = 'INSERT' then
      if new.tenant_id is not null then
        raise exception 'Asignación de empresa reservada al aprovisionamiento' using errcode = '42501';
      end if;
    elsif new.tenant_id is distinct from old.tenant_id then
      raise exception 'No se permite cambiar la empresa del registro' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.plan_proteger_tenant_transicion() from public,anon,authenticated;
create trigger plan_proteger_tenant_proyecto before insert or update on public.proyectos for each row execute function public.plan_proteger_tenant_transicion();
create trigger plan_proteger_tenant_miembro before insert or update on public.proyecto_miembros for each row execute function public.plan_proteger_tenant_transicion();

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 NEW.updated_at = now();
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.es_miembro(p_proyecto_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
 SELECT EXISTS (
 SELECT 1 FROM proyecto_miembros
 WHERE proyecto_id = p_proyecto_id
 AND user_id = auth.uid()
 );
$function$
;
CREATE OR REPLACE FUNCTION public.es_supervisor(p_proyecto_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
 SELECT EXISTS (
 SELECT 1 FROM proyecto_miembros
 WHERE proyecto_id = p_proyecto_id
 AND user_id = auth.uid()
 AND rol = 'supervisor'
 );
$function$
;
CREATE OR REPLACE FUNCTION public.agregar_creador_como_supervisor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
 INSERT INTO proyecto_miembros (proyecto_id, user_id, rol, invitado_por)
 VALUES (NEW.id, NEW.created_by, 'supervisor', NEW.created_by);
 RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_audit_orden_eliminada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
 INSERT INTO ordenes_eliminadas (
 orden_id,
 proyecto_id,
 ot,
 ubicacion,
 rubro,
 estado,
 responsable,
 prioridad,
 pos_x,
 pos_y,
 datos_completos,
 eliminado_por
 ) VALUES (
 OLD.id,
 OLD.proyecto_id,
 OLD.ot,
 OLD.ubicacion,
 OLD.rubro,
 OLD.estado,
 OLD.responsable,
 OLD.prioridad,
 OLD.pos_x,
 OLD.pos_y,
 row_to_json(OLD)::jsonb,
 auth.uid()
 );
 RETURN OLD;
END;
$function$
;
grant execute on function public.es_miembro(uuid),public.es_supervisor(uuid),public.agregar_creador_como_supervisor(),public.fn_audit_orden_eliminada(),public.set_updated_at() to public,anon,authenticated;
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

create policy "Ver proyectos propios" on public."proyectos" as PERMISSIVE for SELECT to "public" using ((es_miembro(id) OR (created_by = auth.uid())));
create policy "Crear proyectos" on public."proyectos" as PERMISSIVE for INSERT to "public" with check ((created_by = auth.uid()));
create policy "Editar proyectos (solo supervisor)" on public."proyectos" as PERMISSIVE for UPDATE to "public" using (es_supervisor(id));
create policy "Eliminar proyectos (solo supervisor)" on public."proyectos" as PERMISSIVE for DELETE to "public" using (es_supervisor(id));
create policy "Ver miembros del proyecto" on public."proyecto_miembros" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Gestionar miembros (solo supervisor)" on public."proyecto_miembros" as PERMISSIVE for ALL to "public" using (es_supervisor(proyecto_id));
create policy "Ver campos del proyecto" on public."campos_definicion" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Ver órdenes del proyecto" on public."ordenes" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Crear órdenes (supervisor y técnico)" on public."ordenes" as PERMISSIVE for INSERT to "public" with check ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ordenes.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text]))))));
create policy "Editar órdenes (supervisor y técnico)" on public."ordenes" as PERMISSIVE for UPDATE to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ordenes.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text]))))));
create policy "Eliminar órdenes (solo supervisor)" on public."ordenes" as PERMISSIVE for DELETE to "public" using (es_supervisor(proyecto_id));
create policy "Ver fotos del proyecto" on public."fotos" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Subir fotos (supervisor y técnico)" on public."fotos" as PERMISSIVE for INSERT to "public" with check ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = fotos.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text]))))));
create policy "Eliminar fotos (supervisor y técnico propietario)" on public."fotos" as PERMISSIVE for DELETE to "public" using ((es_supervisor(proyecto_id) OR (uploaded_by = auth.uid())));
create policy "Ver versiones del proyecto" on public."versiones" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Crear versiones (supervisor y técnico)" on public."versiones" as PERMISSIVE for INSERT to "public" with check ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = versiones.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text]))))));
create policy "Restaurar versión (solo supervisor)" on public."versiones" as PERMISSIVE for UPDATE to "public" using (es_supervisor(proyecto_id));
create policy "Ver sync_log del proyecto" on public."sync_log" as PERMISSIVE for SELECT to "public" using (es_miembro(proyecto_id));
create policy "Insertar en sync_log" on public."sync_log" as PERMISSIVE for INSERT to "public" with check ((user_id = auth.uid()));
create policy "versiones_delete" on public."versiones" as PERMISSIVE for DELETE to "public" using ((created_by = auth.uid()));
create policy "Gestionar campos (solo supervisor)" on public."campos_definicion" as PERMISSIVE for ALL to "public" using (es_supervisor(proyecto_id)) with check (es_supervisor(proyecto_id));
create policy "Miembros leen comentarios de su proyecto" on public."ot_comentarios" as PERMISSIVE for SELECT to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ot_comentarios.proyecto_id) AND (proyecto_miembros.user_id = auth.uid())))));
create policy "Miembros no-viewer crean comentarios" on public."ot_comentarios" as PERMISSIVE for INSERT to "public" with check ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ot_comentarios.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text, 'creador'::text, 'editor'::text]))))));
create policy "fotos_update_miembros" on public."fotos" as PERMISSIVE for UPDATE to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros pm
 WHERE ((pm.proyecto_id = fotos.proyecto_id) AND (pm.user_id = auth.uid()) AND (pm.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text])))))) with check ((EXISTS ( SELECT 1
 FROM proyecto_miembros pm
 WHERE ((pm.proyecto_id = fotos.proyecto_id) AND (pm.user_id = auth.uid()) AND (pm.rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text]))))));
create policy "users_own_config" on public."dashboard_configs" as PERMISSIVE for ALL to "public" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "comentarios_read" on public."comentarios_ot" as PERMISSIVE for SELECT to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = comentarios_ot.proyecto_id) AND (proyecto_miembros.user_id = auth.uid())))));
create policy "comentarios_insert" on public."comentarios_ot" as PERMISSIVE for INSERT to "public" with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = comentarios_ot.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol <> 'lector'::text))))));
create policy "comentarios_delete" on public."comentarios_ot" as PERMISSIVE for DELETE to "public" using ((auth.uid() = user_id));
create policy "supervisores_ven_eliminadas" on public."ordenes_eliminadas" as PERMISSIVE for SELECT to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ordenes_eliminadas.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = 'supervisor'::text)))));
create policy "supervisores_pueden_eliminar_ordenes" on public."ordenes" as PERMISSIVE for DELETE to "public" using ((EXISTS ( SELECT 1
 FROM proyecto_miembros
 WHERE ((proyecto_miembros.proyecto_id = ordenes.proyecto_id) AND (proyecto_miembros.user_id = auth.uid()) AND (proyecto_miembros.rol = 'supervisor'::text)))));
create policy "eventos_uso_insert_propio" on public."eventos_uso" as PERMISSIVE for INSERT to "authenticated" with check ((auth.uid() = user_id));
create policy "eventos_uso_select_propio" on public."eventos_uso" as PERMISSIVE for SELECT to "authenticated" using ((auth.uid() = user_id));
grant all privileges on table public.proyectos,public.proyecto_miembros,public.ordenes,public.fotos,public.campos_definicion,public.comentarios_ot,public.ot_comentarios,public.versiones,public.sync_log,public.eventos_uso,public.ordenes_eliminadas,public.dashboard_configs,public.vista_proyectos_resumen,public.vista_ordenes_fotos to anon,authenticated;
commit;
