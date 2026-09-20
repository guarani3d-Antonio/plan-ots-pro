-- Fixture de laboratorio derivado del catálogo de Plan-ots-2 leído el
-- 20/09/2026 22:33:32 UTC (PostgreSQL 17.6). NO ejecutar en Supabase.
-- Conserva definiciones de las dos tablas afectadas y sus permisos/triggers.
-- auth.users y auth.uid son sustitutos locales; no prueba JWT ni servicios HTTP.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- ACL por defecto efectivamente observadas: revocar PUBLIC no revoca anon.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Catálogo completo de dominio; tipos sin typmod. Auth sigue simulado.
create table public."eventos_uso" ("id" uuid default gen_random_uuid() not null,
"user_id" uuid not null,
"proyecto_id" uuid,
"tipo" text default 'heartbeat'::text not null,
"created_at" timestamptz default now() not null);
create table public."proyectos" ("id" uuid default gen_random_uuid() not null,
"nombre" text not null,
"cliente" text,
"descripcion" text,
"metadatos" jsonb default '{}'::jsonb not null,
"plano_url" text not null,
"plano_thumb_url" text,
"plano_width_px" int4,
"plano_height_px" int4,
"transform_matrices" jsonb default '{}'::jsonb not null,
"rubros" text[] default '{}'::text[] not null,
"tecnicos" text[] default '{}'::text[] not null,
"created_by" uuid,
"created_at" timestamptz default now() not null,
"updated_at" timestamptz default now() not null,
"deleted_at" timestamptz);
create table public."proyecto_miembros" ("proyecto_id" uuid not null,
"user_id" uuid not null,
"rol" text not null,
"invitado_por" uuid,
"joined_at" timestamptz default now() not null);
create table public."campos_definicion" ("id" uuid default gen_random_uuid() not null,
"proyecto_id" uuid not null,
"nombre" text not null,
"tipo" text not null,
"obligatorio" bool default false not null,
"opciones" text[] default '{}'::text[],
"formula" text,
"orden" int4 default 0 not null,
"created_at" timestamptz default now() not null);
create table public."sync_log" ("id" uuid default gen_random_uuid() not null,
"proyecto_id" uuid,
"user_id" uuid,
"device_id" text,
"accion" text not null,
"entidad_id" uuid,
"payload" jsonb,
"conflicto" bool default false not null,
"resolucion" text,
"synced_at" timestamptz default now() not null);
create table public."versiones" ("id" uuid default gen_random_uuid() not null,
"proyecto_id" uuid not null,
"nombre" text not null,
"automatica" bool default false not null,
"snapshot" jsonb not null,
"total_ordenes" int4 default 0 not null,
"ordenes_completadas" int4 default 0 not null,
"ordenes_en_progreso" int4 default 0 not null,
"ordenes_pendientes" int4 default 0 not null,
"ordenes_bloqueadas" int4 default 0 not null,
"created_by" uuid,
"created_at" timestamptz default now() not null,
"descripcion" text);
create table public."fotos" ("id" uuid default gen_random_uuid() not null,
"orden_id" uuid not null,
"proyecto_id" uuid not null,
"categoria" text not null,
"campo_id" uuid,
"file_path" text not null,
"file_url" text not null,
"file_type" text not null,
"file_size_kb" int4,
"mime_type" text,
"duracion_seg" int4,
"label" text,
"url_expires_at" timestamptz,
"uploaded_by" uuid,
"uploaded_at" timestamptz default now() not null,
"descripcion" text,
"anotaciones" jsonb default '[]'::jsonb,
"descripcion_observacion" text);
create table public."ordenes" ("id" uuid default gen_random_uuid() not null,
"proyecto_id" uuid not null,
"ot" text not null,
"ubicacion" text not null,
"rubro" text not null,
"estado" text default 'Pendiente'::text not null,
"responsable" text not null,
"prioridad" text not null,
"comentarios" text,
"fecha_limite" date,
"plano_ref_url" text not null,
"pos_x" float8,
"pos_y" float8,
"ubicada_en_plano" bool default false not null,
"campos" jsonb default '{}'::jsonb not null,
"conflict_flag" bool default false not null,
"conflict_data" jsonb,
"created_by" uuid,
"updated_by" uuid,
"created_at" timestamptz default now() not null,
"updated_at" timestamptz default now() not null,
"deleted_at" timestamptz,
"fecha_ingreso" date default CURRENT_DATE,
"obra" text,
"unidad_amenities" text,
"descripcion" text,
"en_garantia" bool default false,
"asiste_facility" bool default false,
"costo" numeric,
"nivel_riesgo" text,
"rubro_secundario" text[] default '{}'::text[],
"contratistas" text[] default '{}'::text[],
"fecha_inicio_trabajos" date,
"porcentaje_avance" int4 default 0,
"fecha_fin_trabajos" date,
"reincidencia" bool default false,
"potencialmente_conflictivo" bool default false,
"acta_conformidad" text default 'Pendiente'::text,
"informe_relevamiento" text default 'Pendiente'::text,
"informe_avance" text default 'Pendiente'::text,
"informe_cierre" text default 'Pendiente'::text,
"acta_conformidad_url" text,
"informe_relevamiento_url" text,
"informe_avance_url" text,
"informe_cierre_url" text);
create table public."ot_comentarios" ("id" uuid default gen_random_uuid() not null,
"orden_id" uuid not null,
"proyecto_id" uuid not null,
"user_id" uuid,
"user_email" text,
"estado_anterior" text,
"estado_nuevo" text,
"comentario" text not null,
"created_at" timestamptz default now());
create table public."dashboard_configs" ("id" uuid default gen_random_uuid() not null,
"user_id" uuid not null,
"widgets" jsonb default '[]'::jsonb not null,
"updated_at" timestamptz default now() not null);
create table public."comentarios_ot" ("id" uuid default gen_random_uuid() not null,
"orden_id" uuid not null,
"proyecto_id" uuid not null,
"user_id" uuid not null,
"user_name" text not null,
"texto" text not null,
"created_at" timestamptz default now() not null);
create table public."ordenes_eliminadas" ("id" uuid default gen_random_uuid() not null,
"orden_id" uuid not null,
"proyecto_id" uuid,
"ot" text,
"ubicacion" text,
"rubro" text,
"estado" text,
"responsable" text,
"prioridad" text,
"pos_x" float8,
"pos_y" float8,
"datos_completos" jsonb,
"eliminado_por" uuid,
"eliminado_at" timestamptz default now());
alter table public."eventos_uso" add constraint "eventos_uso_pkey" PRIMARY KEY (id);
alter table public."proyectos" add constraint "proyectos_pkey" PRIMARY KEY (id);
alter table public."proyecto_miembros" add constraint "proyecto_miembros_pkey" PRIMARY KEY (proyecto_id, user_id);
alter table public."proyecto_miembros" add constraint "proyecto_miembros_rol_check" CHECK ((rol = ANY (ARRAY['supervisor'::text, 'tecnico'::text, 'viewer'::text])));
alter table public."campos_definicion" add constraint "campos_definicion_pkey" PRIMARY KEY (id);
alter table public."campos_definicion" add constraint "campos_definicion_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'numero'::text, 'decimal'::text, 'fecha'::text, 'fechahora'::text, 'hora'::text, 'booleano'::text, 'seleccion_unica'::text, 'seleccion_multiple'::text, 'calculo'::text, 'archivo'::text, 'video'::text, 'audio'::text, 'firma'::text, 'url'::text, 'gps'::text])));
alter table public."sync_log" add constraint "sync_log_accion_check" CHECK ((accion = ANY (ARRAY['CREATE_OT'::text, 'UPDATE_OT'::text, 'DELETE_OT'::text, 'UPLOAD_FOTO'::text, 'DELETE_FOTO'::text, 'SAVE_VERSION'::text, 'RESTORE_VERSION'::text, 'REPLACE_PLANO'::text])));
alter table public."sync_log" add constraint "sync_log_pkey" PRIMARY KEY (id);
alter table public."versiones" add constraint "versiones_pkey" PRIMARY KEY (id);
alter table public."fotos" add constraint "fotos_categoria_check" CHECK ((categoria = ANY (ARRAY['ANTES'::text, 'DURANTE'::text, 'DESPUES'::text, 'ADJUNTO'::text])));
alter table public."fotos" add constraint "fotos_file_type_check" CHECK ((file_type = ANY (ARRAY['imagen'::text, 'video'::text, 'audio'::text, 'pdf'::text, 'firma'::text])));
alter table public."fotos" add constraint "fotos_pkey" PRIMARY KEY (id);
alter table public."ordenes" add constraint "chk_acta_conformidad" CHECK ((acta_conformidad = ANY (ARRAY['Pendiente'::text, 'enviada'::text, 'firmada'::text, 'no aplica'::text])));
alter table public."ordenes" add constraint "chk_informe_avance" CHECK ((informe_avance = ANY (ARRAY['Pendiente'::text, 'enviada'::text, 'no aplica'::text])));
alter table public."ordenes" add constraint "chk_informe_cierre" CHECK ((informe_cierre = ANY (ARRAY['Pendiente'::text, 'enviada'::text, 'no aplica'::text])));
alter table public."ordenes" add constraint "chk_informe_relevamiento" CHECK ((informe_relevamiento = ANY (ARRAY['Pendiente'::text, 'enviada'::text, 'no aplica'::text])));
alter table public."ordenes" add constraint "chk_nivel_riesgo" CHECK (((nivel_riesgo IS NULL) OR (nivel_riesgo = ANY (ARRAY['Bajo'::text, 'Medio'::text, 'Alto'::text, 'Extremo'::text]))));
alter table public."ordenes" add constraint "chk_porcentaje_avance" CHECK (((porcentaje_avance >= 0) AND (porcentaje_avance <= 100)));
alter table public."ordenes" add constraint "ordenes_estado_check" CHECK ((estado = ANY (ARRAY['Pendiente'::text, 'En proceso'::text, 'Cerrada'::text, 'No aplica'::text])));
alter table public."ordenes" add constraint "ordenes_pkey" PRIMARY KEY (id);
alter table public."ordenes" add constraint "ordenes_prioridad_check" CHECK ((prioridad = ANY (ARRAY['Alta'::text, 'Media'::text, 'Baja'::text])));
alter table public."ot_comentarios" add constraint "ot_comentarios_comentario_check" CHECK ((char_length(TRIM(BOTH FROM comentario)) >= 3));
alter table public."ot_comentarios" add constraint "ot_comentarios_pkey" PRIMARY KEY (id);
alter table public."dashboard_configs" add constraint "dashboard_configs_pkey" PRIMARY KEY (id);
alter table public."dashboard_configs" add constraint "dashboard_configs_user_id_key" UNIQUE (user_id);
alter table public."comentarios_ot" add constraint "comentarios_ot_pkey" PRIMARY KEY (id);
alter table public."comentarios_ot" add constraint "comentarios_ot_texto_check" CHECK ((char_length(texto) > 0));
alter table public."ordenes_eliminadas" add constraint "ordenes_eliminadas_pkey" PRIMARY KEY (id);
alter table public."eventos_uso" add constraint "eventos_uso_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE SET NULL;
alter table public."eventos_uso" add constraint "eventos_uso_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."proyectos" add constraint "proyectos_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."proyecto_miembros" add constraint "proyecto_miembros_invitado_por_fkey" FOREIGN KEY (invitado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."proyecto_miembros" add constraint "proyecto_miembros_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."proyecto_miembros" add constraint "proyecto_miembros_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."campos_definicion" add constraint "campos_definicion_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."sync_log" add constraint "sync_log_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."sync_log" add constraint "sync_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."versiones" add constraint "versiones_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."versiones" add constraint "versiones_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."fotos" add constraint "fotos_campo_id_fkey" FOREIGN KEY (campo_id) REFERENCES campos_definicion(id) ON DELETE SET NULL;
alter table public."fotos" add constraint "fotos_orden_id_fkey" FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;
alter table public."fotos" add constraint "fotos_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."fotos" add constraint "fotos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."ordenes" add constraint "ordenes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."ordenes" add constraint "ordenes_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."ordenes" add constraint "ordenes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."ot_comentarios" add constraint "ot_comentarios_orden_id_fkey" FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;
alter table public."ot_comentarios" add constraint "ot_comentarios_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id);
alter table public."ot_comentarios" add constraint "ot_comentarios_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."dashboard_configs" add constraint "dashboard_configs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."comentarios_ot" add constraint "comentarios_ot_orden_id_fkey" FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE;
alter table public."comentarios_ot" add constraint "comentarios_ot_proyecto_id_fkey" FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;
alter table public."comentarios_ot" add constraint "comentarios_ot_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
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
CREATE TRIGGER trg_proyectos_updated_at BEFORE UPDATE ON public.proyectos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ordenes_updated_at BEFORE UPDATE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_proyecto_creado AFTER INSERT ON public.proyectos FOR EACH ROW WHEN ((new.created_by IS NOT NULL)) EXECUTE FUNCTION agregar_creador_como_supervisor();
CREATE TRIGGER trigger_audit_orden_eliminada BEFORE DELETE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION fn_audit_orden_eliminada();
alter table public."eventos_uso" enable row level security;
alter table public."proyectos" enable row level security;
alter table public."proyecto_miembros" enable row level security;
alter table public."campos_definicion" enable row level security;
alter table public."sync_log" enable row level security;
alter table public."versiones" enable row level security;
alter table public."fotos" enable row level security;
alter table public."ordenes" enable row level security;
alter table public."ot_comentarios" enable row level security;
alter table public."dashboard_configs" enable row level security;
alter table public."comentarios_ot" enable row level security;
alter table public."ordenes_eliminadas" enable row level security;
create view public."vista_proyectos_resumen" with (security_invoker=true) as  SELECT p.id,
 p.nombre,
 p.cliente,
 p.created_by,
 p.updated_at,
 count(o.id) AS total_ordenes,
 count(o.id) FILTER (WHERE o.estado = 'Pendiente'::text AND o.deleted_at IS NULL) AS pendientes,
 count(o.id) FILTER (WHERE o.estado = 'En progreso'::text AND o.deleted_at IS NULL) AS en_progreso,
 count(o.id) FILTER (WHERE o.estado = 'Completada'::text AND o.deleted_at IS NULL) AS completadas,
 count(o.id) FILTER (WHERE o.estado = 'Bloqueada'::text AND o.deleted_at IS NULL) AS bloqueadas,
 CASE
 WHEN count(o.id) FILTER (WHERE o.deleted_at IS NULL) = 0 THEN 0::numeric
 ELSE round(100.0 * count(o.id) FILTER (WHERE o.estado = 'Completada'::text AND o.deleted_at IS NULL)::numeric / count(o.id) FILTER (WHERE o.deleted_at IS NULL)::numeric)
 END AS porcentaje_avance
 FROM proyectos p
 LEFT JOIN ordenes o ON o.proyecto_id = p.id AND o.deleted_at IS NULL
 WHERE p.deleted_at IS NULL
 GROUP BY p.id;
create view public."vista_ordenes_fotos" with (security_invoker=true) as  SELECT o.id,
 o.proyecto_id,
 o.ot,
 o.estado,
 o.prioridad,
 o.responsable,
 o.ubicacion,
 count(f.id) FILTER (WHERE f.categoria = 'ANTES'::text) AS fotos_antes_count,
 count(f.id) FILTER (WHERE f.categoria = 'DURANTE'::text) AS fotos_durante_count,
 count(f.id) FILTER (WHERE f.categoria = 'DESPUES'::text) AS fotos_despues_count,
 CASE o.estado
 WHEN 'Pendiente'::text THEN count(f.id) FILTER (WHERE f.categoria = 'ANTES'::text) >= 1
 WHEN 'En progreso'::text THEN count(f.id) FILTER (WHERE f.categoria = 'ANTES'::text) >= 1 AND count(f.id) FILTER (WHERE f.categoria = 'DURANTE'::text) >= 1
 WHEN 'Completada'::text THEN count(f.id) FILTER (WHERE f.categoria = 'ANTES'::text) >= 1 AND count(f.id) FILTER (WHERE f.categoria = 'DURANTE'::text) >= 1 AND count(f.id) FILTER (WHERE f.categoria = 'DESPUES'::text) >= 1
 WHEN 'Bloqueada'::text THEN true
 ELSE false
 END AS fotos_completas
 FROM ordenes o
 LEFT JOIN fotos f ON f.orden_id = o.id
 WHERE o.deleted_at IS NULL
 GROUP BY o.id;
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
