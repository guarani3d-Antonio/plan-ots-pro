begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

alter table public.plan_obra_fichas add column color text
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- Existing four-argument callers keep the previously selected color.
create function public.plan_guardar_ficha_obra(p_tenant uuid,p_obra uuid,p_nombre text,p_direccion text,p_color text)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result uuid;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para administrar obras' using errcode='42501'; end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Seleccione un color válido' using errcode='22023'; end if;
  result:=public.plan_guardar_ficha_obra(p_tenant,p_obra,p_nombre,p_direccion);
  update public.plan_obra_fichas set color=upper(p_color),actualizado_en=now() where obra_id=result;
  return result;
end $$;

create or replace function public.plan_ficha_obra(p_proyecto uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare p public.proyectos; w public.proyectos;
begin
  select * into p from public.proyectos where id=p_proyecto and deleted_at is null;
  if auth.uid() is null or p.id is null or not public.plan_es_miembro_proyecto(p_proyecto) then
    raise exception 'No tiene acceso a esta obra' using errcode='42501'; end if;
  select * into w from public.proyectos where id=coalesce(p.proyecto_padre_id,p.id) and deleted_at is null;
  if w.id is null then raise exception 'Obra no disponible' using errcode='23503'; end if;
  return jsonb_build_object('id',w.id,'nombre',w.nombre,'proyecto_nombre',p.nombre,
    'direccion',(select direccion from public.plan_obra_fichas where obra_id=w.id),
    'color',(select color from public.plan_obra_fichas where obra_id=w.id),
    'contactos',coalesce((select jsonb_agg(to_jsonb(c) order by c.nombre) from public.plan_obra_contactos c
      where c.obra_id=w.id and c.activo),'[]'::jsonb));
end $$;

-- Each authorized plan inherits its root work color; no directory write access is granted.
create function public.plan_colores_obras(p_proyectos uuid[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('proyecto_id',p.id,'obra_id',w.id,'nombre',w.nombre,'color',f.color))
    from public.proyectos p join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id)
    left join public.plan_obra_fichas f on f.obra_id=w.id
    where p.id=any(p_proyectos) and p.deleted_at is null and w.deleted_at is null
      and public.plan_es_miembro_proyecto(p.id)),'[]'::jsonb);
end $$;

create function public.plan_politica_historial(p_tenant uuid,p_modulo text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para consultar la configuración' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from
    (select d.*,row_number() over(order by d.id) as version from public.plan_politica_decisiones d
      where d.tenant_id=p_tenant and d.modulo=p_modulo) v),'[]'::jsonb);
end $$;

create function public.plan_directorio_obras(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para administrar obras' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'proyecto_nombre',p.nombre,
    'direccion',f.direccion,'color',f.color,'contactos',coalesce((select jsonb_agg(to_jsonb(c) order by c.nombre)
      from public.plan_obra_contactos c where c.obra_id=p.id and c.activo),'[]'::jsonb)) order by p.nombre)
    from public.proyectos p left join public.plan_obra_fichas f on f.obra_id=p.id
    where p.tenant_id=p_tenant and p.proyecto_padre_id is null and p.deleted_at is null),'[]'::jsonb);
end $$;

-- Referenced records cannot be deleted, including inactive or historical relationships.
-- Catalog inspection covers foreign keys introduced by future modules as well.
create function public.plan_directorio_bloqueo(p_tipo text,p_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare target regclass; c record; cantidad bigint; nombre text; es_ficha boolean;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para administrar directorios' using errcode='42501'; end if;
  target:=case p_tipo when 'empresa' then 'public.tenants'::regclass when 'obra' then 'public.proyectos'::regclass
    when 'cliente' then 'public.plan_clientes'::regclass when 'contratista' then 'public.plan_contratistas'::regclass else null end;
  if target is null then raise exception 'Tipo de ficha inválido' using errcode='22023'; end if;
  execute format('select count(*) from %s where id=$1',target) into cantidad using p_id;
  if cantidad=0 then return 'Registro no disponible'; end if;
  if p_tipo='obra' then
    select es_ficha_obra and proyecto_padre_id is null and deleted_at is null into es_ficha from public.proyectos where id=p_id;
    if not coalesce(es_ficha,false) then return 'Esta obra contiene un plano. Administrá el proyecto desde Proyectos.'; end if;
  end if;
  for c in
    select con.conrelid::regclass as tabla,a.attname as columna
    from pg_constraint con cross join lateral unnest(con.conkey,con.confkey) as k(local_col,foreign_col)
    join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.local_col
    join pg_attribute b on b.attrelid=con.confrelid and b.attnum=k.foreign_col
    where con.contype='f' and con.confrelid=target and b.attname='id'
      and con.conrelid not in ('public.plan_obra_fichas'::regclass,'public.plan_contratista_fichas'::regclass)
  loop
    execute format('select count(*) from %s where %I=$1',c.tabla,c.columna) into cantidad using p_id;
    if cantidad>0 then return 'Tiene registros asociados. Conservá la ficha y su historial.'; end if;
  end loop;
  if p_tipo='contratista' then
    select c.nombre into nombre from public.plan_contratistas c where c.id=p_id;
    select count(*) into cantidad from public.ordenes o join public.proyectos p on p.id=o.proyecto_id
      join public.plan_contratistas c on c.tenant_id=p.tenant_id and c.id=p_id
      where nombre=any(coalesce(o.contratistas,'{}'));
    if cantidad>0 then return 'El contratista está registrado en órdenes de trabajo.'; end if;
  end if;
  return null;
end $$;

create function public.plan_eliminar_directorio(p_tipo text,p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target regclass; bloqueo text;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para eliminar registros' using errcode='42501'; end if;
  target:=case p_tipo when 'empresa' then 'public.tenants'::regclass when 'obra' then 'public.proyectos'::regclass
    when 'cliente' then 'public.plan_clientes'::regclass when 'contratista' then 'public.plan_contratistas'::regclass else null end;
  if target is null then raise exception 'Tipo de ficha inválido' using errcode='22023'; end if;
  execute format('select id from %s where id=$1 for update',target) using p_id;
  bloqueo:=public.plan_directorio_bloqueo(p_tipo,p_id);
  if bloqueo is not null then raise exception '%',bloqueo using errcode='23503'; end if;
  if p_tipo='contratista' then delete from public.plan_contratista_fichas where contratista_id=p_id; end if;
  delete from public.plan_directorio_fotos where tipo=p_tipo and ficha_id=p_id;
  if p_tipo='obra' then
    update public.proyectos set deleted_at=now(),updated_at=now() where id=p_id;
  else execute format('delete from %s where id=$1',target) using p_id; end if;
end $$;

revoke all on function public.plan_guardar_ficha_obra(uuid,uuid,text,text,text),public.plan_colores_obras(uuid[]),
 public.plan_politica_historial(uuid,text),public.plan_directorio_obras(uuid),public.plan_directorio_bloqueo(text,uuid),public.plan_eliminar_directorio(text,uuid) from public,anon,authenticated;
grant execute on function public.plan_guardar_ficha_obra(uuid,uuid,text,text,text),public.plan_colores_obras(uuid[]),
 public.plan_politica_historial(uuid,text),public.plan_directorio_obras(uuid),public.plan_directorio_bloqueo(text,uuid),public.plan_eliminar_directorio(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
