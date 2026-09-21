-- Restaurar políticas/funciones de fase 2. No publica buckets ni elimina objetos.
begin;
set local lock_timeout='5s';
drop policy plan_objects_read on storage.objects;
drop policy plan_objects_insert on storage.objects;
drop policy plan_objects_delete on storage.objects;
drop trigger plan_validar_archivos on public.fotos;
drop trigger plan_validar_archivos on public.proyectos;
drop function public.plan_validar_archivos();
drop function public.plan_storage_permitido(text,text,text);
drop function public.plan_archivo_de_proyecto(text,text,uuid);
drop function public.plan_storage_proyecto(text,text);
drop function public.plan_storage_path(text,text);
drop table public.plan_archivos_legados;
create or replace function public.plan_crear_proyecto(
  p_nombre text, p_plano_url text, p_cliente text default null,
  p_descripcion text default null, p_rubros text[] default '{}',
  p_tecnicos text[] default '{}', p_tenant_id uuid default null
) returns public.proyectos language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_tenant uuid; v_result public.proyectos;
begin
  v_tenant := coalesce(p_tenant_id, public.plan_tenant_id());
  if auth.uid() is null or v_tenant is null
    or not public.plan_puede_crear_proyecto(v_tenant)
    or not exists(select 1 from public.tenants where id=v_tenant and activo) then
    raise exception 'No tiene permiso para crear obras en esta empresa' using errcode='42501';
  end if;
  if nullif(btrim(p_nombre),'') is null or nullif(btrim(p_plano_url),'') is null then
    raise exception 'Nombre y plano son obligatorios' using errcode='22023';
  end if;
  insert into public.proyectos(nombre,plano_url,cliente,descripcion,rubros,tecnicos,tenant_id,created_by)
  values(btrim(p_nombre),p_plano_url,p_cliente,p_descripcion,coalesce(p_rubros,'{}'),coalesce(p_tecnicos,'{}'),v_tenant,auth.uid())
  returning * into v_result;
  return v_result;
end $$;
create policy "Miembros pueden ver planos" on storage.objects for SELECT to "public" using (((bucket_id = 'planos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Supervisores pueden subir planos" on storage.objects for INSERT to "public" with check (((bucket_id = 'planos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Supervisores pueden eliminar planos" on storage.objects for DELETE to "public" using (((bucket_id = 'planos'::text) AND (auth.uid() = owner)));
create policy "Miembros pueden ver fotos" on storage.objects for SELECT to "public" using (((bucket_id = 'fotos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Técnicos pueden subir fotos" on storage.objects for INSERT to "public" with check (((bucket_id = 'fotos'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Propietario puede eliminar fotos" on storage.objects for DELETE to "public" using (((bucket_id = 'fotos'::text) AND (auth.uid() = owner)));
create policy "Miembros pueden ver exports" on storage.objects for SELECT to "public" using (((bucket_id = 'exports'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Miembros pueden subir exports" on storage.objects for INSERT to "public" with check (((bucket_id = 'exports'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Propietario puede eliminar exports" on storage.objects for DELETE to "public" using (((bucket_id = 'exports'::text) AND (auth.uid() = owner)));
commit;
