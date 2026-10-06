begin;

-- Las acciones de carpeta usan el mismo propietario/creador autorizado que mover.
create or replace function public.plan_renombrar_carpeta(p_carpeta uuid, p_nombre text)
returns public.plan_carpetas language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_carpeta public.plan_carpetas%rowtype;
begin
  select * into v_carpeta from public.plan_carpetas where id=p_carpeta for update;
  if auth.uid() is null or not found or not (public.plan_es_creador() or
    (v_carpeta.created_by=auth.uid() and exists(select 1 from public.tenant_miembros tm
      where tm.tenant_id=v_carpeta.tenant_id and tm.user_id=auth.uid() and tm.activo))) then
    raise exception 'No puede renombrar esta carpeta' using errcode='42501';
  end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre))>180 then
    raise exception 'Ingrese un nombre de hasta 180 caracteres' using errcode='22023';
  end if;
  update public.plan_carpetas set nombre=btrim(p_nombre) where id=p_carpeta returning * into v_carpeta;
  return v_carpeta;
end $$;
revoke all on function public.plan_renombrar_carpeta(uuid,text) from public,anon,authenticated;
grant execute on function public.plan_renombrar_carpeta(uuid,text) to authenticated;

-- Se usa para mostrar Eliminar deshabilitado antes de abrir la confirmación.
-- La operación de borrado vuelve a comprobarlo bajo bloqueo de fila.
create or replace function public.plan_puede_eliminar_carpeta(p_carpeta uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select auth.uid() is not null and exists(
    select 1 from public.plan_carpetas c where c.id=p_carpeta
      and (public.plan_es_creador() or
        (c.created_by=auth.uid() and exists(select 1 from public.tenant_miembros tm
          where tm.tenant_id=c.tenant_id and tm.user_id=auth.uid() and tm.activo)))
      and not exists(select 1 from public.plan_carpetas child where child.padre_id=c.id)
      and not exists(select 1 from public.proyectos p where p.carpeta_id=c.id)
  );
$$;
revoke all on function public.plan_puede_eliminar_carpeta(uuid) from public,anon,authenticated;
grant execute on function public.plan_puede_eliminar_carpeta(uuid) to authenticated;

create or replace function public.plan_eliminar_carpeta(p_carpeta uuid)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_carpeta public.plan_carpetas%rowtype;
begin
  select * into v_carpeta from public.plan_carpetas where id=p_carpeta for update;
  if auth.uid() is null or not found or not (public.plan_es_creador() or
    (v_carpeta.created_by=auth.uid() and exists(select 1 from public.tenant_miembros tm
      where tm.tenant_id=v_carpeta.tenant_id and tm.user_id=auth.uid() and tm.activo))) then
    raise exception 'No puede eliminar esta carpeta' using errcode='42501';
  end if;
  if exists(select 1 from public.plan_carpetas child where child.padre_id=p_carpeta)
    or exists(select 1 from public.proyectos p where p.carpeta_id=p_carpeta) then
    raise exception 'La carpeta contiene subcarpetas o proyectos' using errcode='23503';
  end if;
  delete from public.plan_carpetas where id=p_carpeta;
end $$;
revoke all on function public.plan_eliminar_carpeta(uuid) from public,anon,authenticated;
grant execute on function public.plan_eliminar_carpeta(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
