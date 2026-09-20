-- Respaldo de filas de dominio antes de fase 2. Resultado privado, fuera de Git.
-- No incluye contraseñas Auth ni contenido binario de Storage.
begin read only;
select jsonb_build_object('captured_at',now(),'project_ref','iqgbyqyoovzvhhdjawnt',
  'proyectos',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.proyectos t),
  'proyecto_miembros',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.proyecto_miembros t),
  'ordenes',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.ordenes t),
  'fotos',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.fotos t),
  'campos_definicion',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.campos_definicion t),
  'comentarios_ot',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.comentarios_ot t),
  'ot_comentarios',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.ot_comentarios t),
  'versiones',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.versiones t),
  'sync_log',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.sync_log t),
  'eventos_uso',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.eventos_uso t),
  'ordenes_eliminadas',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.ordenes_eliminadas t),
  'dashboard_configs',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.dashboard_configs t),
  'tenants',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.tenants t),
  'tenant_miembros',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.tenant_miembros t),
  'plataforma_administradores',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.plataforma_administradores t)
) as domain_backup;
rollback;
