-- Verificación posterior a fase 2. Solo lectura; termina con excepción ante desvíos.
begin read only;
set local statement_timeout='30s';

do $$
declare n text;
begin
  foreach n in array array[
    'proyectos_tenant_id_id_key','ordenes_proyecto_id_id_key','campos_definicion_proyecto_id_id_key',
    'proyecto_miembros_tenant_proyecto_fkey','fotos_proyecto_orden_fkey','fotos_proyecto_campo_fkey',
    'comentarios_ot_proyecto_orden_fkey','ot_comentarios_proyecto_orden_fkey'
  ] loop
    if not exists(select 1 from pg_constraint where conname=n and convalidated) then
      raise exception 'Restricción ausente/no validada: %',n;
    end if;
  end loop;
  foreach n in array array['agregar_creador_como_supervisor()','fn_audit_orden_eliminada()'] loop
    if has_function_privilege('anon','public.'||n,'EXECUTE')
      or has_function_privilege('authenticated','public.'||n,'EXECUTE')
      or not exists(select 1 from pg_proc where oid=('public.'||n)::regprocedure and prosecdef
        and pg_get_userbyid(proowner)='postgres' and proconfig @> array['search_path=pg_catalog, pg_temp']) then
      raise exception 'Trigger function inseguro: %',n;
    end if;
  end loop;
  foreach n in array array[
    'plan_es_miembro_proyecto(uuid)','plan_puede_editar_proyecto(uuid)',
    'plan_es_supervisor_proyecto(uuid)','plan_puede_crear_proyecto(uuid)',
    'plan_crear_proyecto(text,text,text,text,text[],text[],uuid)'
  ] loop
    if has_function_privilege('anon','public.'||n,'EXECUTE')
      or not has_function_privilege('authenticated','public.'||n,'EXECUTE')
      or not exists(select 1 from pg_proc where oid=('public.'||n)::regprocedure and prosecdef
        and pg_get_userbyid(proowner)='postgres' and proconfig @> array['search_path=pg_catalog, pg_temp']) then
      raise exception 'Helper inseguro: %',n;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.proyectos','INSERT') then
    raise exception 'Creación directa de proyecto permanece habilitada';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and tgname='plan_validar_autoria')<>9 then
    raise exception 'Faltan controles de autoría';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('vista_proyectos_resumen','vista_ordenes_fotos') and not coalesce(c.reloptions && array['security_invoker=on','security_invoker=true'],false)) then
    raise exception 'Vista sin security_invoker';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O'
      and tgname in ('plan_normalizar_tenant_proyecto','plan_normalizar_tenant_miembro'))<>2 then
    raise exception 'Faltan triggers normalizadores';
  end if;
  if exists(select 1 from pg_policies where schemaname='public'
    and tablename in ('proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs')
    and roles<>array['authenticated']::name[]) then
    raise exception 'Existe política de dominio fuera del rol authenticated';
  end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public'
    and table_name in ('proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs','vista_proyectos_resumen','vista_ordenes_fotos')
    and grantee='anon') then
    raise exception 'Anon conserva grants del dominio';
  end if;
  if exists(select 1 from public.fotos f join public.ordenes o on o.id=f.orden_id where f.proyecto_id<>o.proyecto_id)
    or exists(select 1 from public.fotos f join public.campos_definicion c on c.id=f.campo_id where f.proyecto_id<>c.proyecto_id)
    or exists(select 1 from public.comentarios_ot c join public.ordenes o on o.id=c.orden_id where c.proyecto_id<>o.proyecto_id)
    or exists(select 1 from public.ot_comentarios c join public.ordenes o on o.id=c.orden_id where c.proyecto_id<>o.proyecto_id) then
    raise exception 'Existen referencias cruzadas entre obras';
  end if;
end $$;

select jsonb_build_object(
  'verified_at',now(),
  'tenants',(select count(*) from public.tenants),
  'tenant_members',(select count(*) from public.tenant_miembros),
  'tenant_projects',(select count(*) from public.proyectos where tenant_id is not null),
  'legacy_projects',(select count(*) from public.proyectos where tenant_id is null),
  'domain_policies',(select count(*) from pg_policies where schemaname='public' and tablename in ('proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs'))
) as phase2_verification;
rollback;
