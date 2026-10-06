begin;

-- Las carpetas ordenan planos; no conceden acceso a una obra.
create table public.plan_carpetas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  padre_id uuid references public.plan_carpetas(id),
  nombre text not null check (length(btrim(nombre)) between 1 and 180),
  profundidad smallint not null check (profundidad between 1 and 5),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create index plan_carpetas_padre on public.plan_carpetas(tenant_id,padre_id);
alter table public.plan_carpetas add constraint plan_carpetas_padre_empresa
  foreign key(tenant_id,padre_id) references public.plan_carpetas(tenant_id,id);
alter table public.proyectos add column carpeta_id uuid;
alter table public.proyectos add constraint proyectos_carpeta_empresa
  foreign key(tenant_id,carpeta_id) references public.plan_carpetas(tenant_id,id);
create index proyectos_carpeta_activos on public.proyectos(carpeta_id) where deleted_at is null;

create function public.plan_carpeta_visible(p_carpeta uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  with recursive rama as (
    select id from public.plan_carpetas where id=p_carpeta
    union all
    select c.id from public.plan_carpetas c join rama r on c.padre_id=r.id
  )
  select auth.uid() is not null and (
    public.plan_es_creador()
    or exists(select 1 from public.plan_carpetas c join public.tenant_miembros tm
      on tm.tenant_id=c.tenant_id and tm.user_id=auth.uid() and tm.activo
      where c.id=p_carpeta and c.created_by=auth.uid())
    or exists(select 1 from public.proyectos p join rama r on r.id=p.carpeta_id
      where p.deleted_at is null and public.plan_es_miembro_proyecto(p.id))
  );
$$;
revoke all on function public.plan_carpeta_visible(uuid) from public,anon,authenticated;
grant execute on function public.plan_carpeta_visible(uuid) to authenticated;

create function public.plan_crear_carpeta(p_tenant uuid,p_padre uuid,p_nombre text)
returns public.plan_carpetas language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_padre public.plan_carpetas%rowtype; v_result public.plan_carpetas; v_depth smallint:=1;
begin
  if auth.uid() is null or not exists(select 1 from public.tenants where id=p_tenant and activo)
    or not (public.plan_es_creador() or exists(select 1 from public.tenant_miembros
      where tenant_id=p_tenant and user_id=auth.uid() and activo and rol in ('administrador','supervisor','tecnico'))) then
    raise exception 'No tiene acceso a esta empresa' using errcode='42501';
  end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre))>180 then
    raise exception 'Ingrese un nombre de hasta 180 caracteres' using errcode='22023';
  end if;
  if p_padre is not null then
    select * into v_padre from public.plan_carpetas where id=p_padre and tenant_id=p_tenant;
    if not found or not public.plan_carpeta_visible(p_padre) then
      raise exception 'No tiene acceso a la carpeta superior' using errcode='42501';
    end if;
    v_depth:=v_padre.profundidad+1;
  end if;
  if v_depth>5 then raise exception 'Se permiten hasta cinco niveles de carpetas' using errcode='22023'; end if;
  insert into public.plan_carpetas(tenant_id,padre_id,nombre,profundidad,created_by)
    values(p_tenant,p_padre,btrim(p_nombre),v_depth,auth.uid()) returning * into v_result;
  return v_result;
end $$;
revoke all on function public.plan_crear_carpeta(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.plan_crear_carpeta(uuid,uuid,text) to authenticated;

create function public.plan_mover_carpeta(p_carpeta uuid,p_padre uuid)
returns public.plan_carpetas language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_carpeta public.plan_carpetas%rowtype; v_padre public.plan_carpetas%rowtype;
  v_depth smallint:=1; v_max smallint; v_result public.plan_carpetas;
begin
  select * into v_carpeta from public.plan_carpetas where id=p_carpeta for update;
  if auth.uid() is null or not found or not (public.plan_es_creador() or
    (v_carpeta.created_by=auth.uid() and exists(select 1 from public.tenant_miembros tm
      where tm.tenant_id=v_carpeta.tenant_id and tm.user_id=auth.uid() and tm.activo))) then
    raise exception 'No puede mover esta carpeta' using errcode='42501';
  end if;
  if p_padre is not null then
    select * into v_padre from public.plan_carpetas where id=p_padre and tenant_id=v_carpeta.tenant_id;
    if not found or not public.plan_carpeta_visible(p_padre) then
      raise exception 'Destino no disponible' using errcode='42501';
    end if;
    v_depth:=v_padre.profundidad+1;
  end if;
  with recursive rama as (
    select id,profundidad from public.plan_carpetas where id=p_carpeta
    union all select c.id,c.profundidad from public.plan_carpetas c join rama r on c.padre_id=r.id
  ) select max(profundidad) into v_max from rama;
  if p_padre=p_carpeta or exists (
    with recursive rama as (
      select id from public.plan_carpetas where id=p_carpeta
      union all select c.id from public.plan_carpetas c join rama r on c.padre_id=r.id
    ) select 1 from rama where id=p_padre
  ) then raise exception 'No puede mover una carpeta dentro de sí misma' using errcode='22023'; end if;
  if v_depth + v_max - v_carpeta.profundidad>5 then
    raise exception 'El movimiento superaría los cinco niveles' using errcode='22023';
  end if;
  update public.plan_carpetas set padre_id=p_padre where id=p_carpeta;
  with recursive rama as (
    select id,0 as distancia from public.plan_carpetas where id=p_carpeta
    union all select c.id,r.distancia+1 from public.plan_carpetas c join rama r on c.padre_id=r.id
  ) update public.plan_carpetas c set profundidad=v_depth+r.distancia from rama r where c.id=r.id;
  select * into v_result from public.plan_carpetas where id=p_carpeta;
  return v_result;
end $$;
revoke all on function public.plan_mover_carpeta(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_mover_carpeta(uuid,uuid) to authenticated;

create function public.plan_ubicar_proyecto(p_proyecto uuid,p_carpeta uuid)
returns public.proyectos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto public.proyectos%rowtype; v_result public.proyectos;
begin
  select * into v_proyecto from public.proyectos where id=p_proyecto and deleted_at is null for update;
  if auth.uid() is null or not found or
    not (case when v_proyecto.proyecto_padre_id is null
      then public.plan_es_supervisor_proyecto(p_proyecto)
      else public.plan_puede_editar_proyecto(p_proyecto) end) then
    raise exception 'No puede mover este proyecto' using errcode='42501';
  end if;
  if p_carpeta is not null and not exists(select 1 from public.plan_carpetas c
    where c.id=p_carpeta and c.tenant_id=v_proyecto.tenant_id
      and public.plan_carpeta_visible(c.id)) then
    raise exception 'La carpeta no pertenece a esta empresa o no es accesible' using errcode='42501';
  end if;
  update public.proyectos set carpeta_id=p_carpeta where id=p_proyecto returning * into v_result;
  return v_result;
end $$;
revoke all on function public.plan_ubicar_proyecto(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_ubicar_proyecto(uuid,uuid) to authenticated;

create function public.plan_crear_plano_en_carpeta(p_torre uuid,p_nombre text,p_carpeta uuid)
returns public.proyectos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_torre public.proyectos%rowtype; v_nuevo public.proyectos;
begin
  select * into v_torre from public.proyectos where id=p_torre and deleted_at is null
    and proyecto_padre_id is null;
  if auth.uid() is null or not found or not public.plan_puede_editar_proyecto(p_torre)
    or not exists(select 1 from public.tenants where id=v_torre.tenant_id and activo) then
    raise exception 'No puede crear planos en esta obra' using errcode='42501';
  end if;
  if nullif(btrim(p_nombre),'') is null or length(btrim(p_nombre))>180 then
    raise exception 'Ingrese un nombre de plano de hasta 180 caracteres' using errcode='22023';
  end if;
  if p_carpeta is not null and not exists(select 1 from public.plan_carpetas c
    where c.id=p_carpeta and c.tenant_id=v_torre.tenant_id
      and public.plan_carpeta_visible(c.id)) then
    raise exception 'No tiene acceso a la carpeta de destino' using errcode='42501';
  end if;
  insert into public.proyectos(nombre,plano_url,cliente,descripcion,rubros,tecnicos,
    tenant_id,created_by,proyecto_padre_id,carpeta_id)
  values(btrim(p_nombre),'pending://plan-upload-required',v_torre.cliente,null,'{}','{}',
    v_torre.tenant_id,auth.uid(),p_torre,p_carpeta) returning * into v_nuevo;
  -- El trigger del creador no debe ascender a supervisor al tecnico.
  insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  select v_nuevo.id,pm.user_id,pm.rol,auth.uid() from public.proyecto_miembros pm
  where pm.proyecto_id=p_torre and exists (
    select 1 from public.tenant_miembros tm where tm.tenant_id=v_torre.tenant_id
      and tm.user_id=pm.user_id and tm.activo
    union all
    select 1 from public.plataforma_administradores pa where pa.user_id=pm.user_id and pa.activo
  ) on conflict(proyecto_id,user_id) do update set rol=excluded.rol;
  return v_nuevo;
end $$;
revoke all on function public.plan_crear_plano_en_carpeta(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.plan_crear_plano_en_carpeta(uuid,text,uuid) to authenticated;

-- Solo vincula un archivo inicial propio ya presente en Storage.
create function public.plan_vincular_plano_inicial(p_proyecto uuid,p_url text)
returns public.proyectos language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto public.proyectos%rowtype; v_path text; v_result public.proyectos;
begin
  select * into v_proyecto from public.proyectos where id=p_proyecto and deleted_at is null for update;
  if auth.uid() is null or not found or v_proyecto.plano_url<>'pending://plan-upload-required'
    or not public.plan_puede_editar_proyecto(p_proyecto) then
    raise exception 'No puede cargar el plano inicial' using errcode='42501';
  end if;
  v_path:=public.plan_storage_path(p_url,'planos');
  if v_path is null or not public.plan_archivo_de_proyecto('planos',v_path,p_proyecto)
    or not exists(select 1 from storage.objects o where o.bucket_id='planos' and o.name=v_path
      and o.owner_id=auth.uid()::text) then
    raise exception 'El archivo no pertenece a este proyecto' using errcode='42501';
  end if;
  update public.proyectos set plano_url=p_url where id=p_proyecto returning * into v_result;
  return v_result;
end $$;
revoke all on function public.plan_vincular_plano_inicial(uuid,text) from public,anon,authenticated;
grant execute on function public.plan_vincular_plano_inicial(uuid,text) to authenticated;

-- El tecnico puede subir planos a proyectos hijos que puede editar;
-- exportaciones y borrados siguen reservados al supervisor.
create or replace function public.plan_storage_permitido(p_bucket text,p_name text,p_action text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare v_proyecto uuid;
begin
  if auth.uid() is null or p_action not in ('read','write','delete') then return false;end if;
  v_proyecto:=public.plan_storage_proyecto(p_bucket,p_name);
  if v_proyecto is not null then
    if p_bucket='exports' or p_action='delete' then
      return public.plan_es_supervisor_proyecto(v_proyecto);
    elsif p_bucket='planos' and p_action='write' then
      return public.plan_es_supervisor_proyecto(v_proyecto) or (
        exists(select 1 from public.proyectos where id=v_proyecto and proyecto_padre_id is not null)
        and public.plan_puede_editar_proyecto(v_proyecto));
    elsif p_action='write' then return public.plan_puede_editar_proyecto(v_proyecto);
    else return public.plan_es_miembro_proyecto(v_proyecto);end if;
  end if;
  if p_action<>'read' then return false;end if;
  return exists(select 1 from public.plan_archivos_legados a join public.proyectos p on p.id=a.proyecto_id
    where a.bucket_id=p_bucket and a.object_name=p_name and p.deleted_at is null and
    case when p_bucket='exports' then public.plan_es_supervisor_proyecto(p.id) else public.plan_es_miembro_proyecto(p.id) end);
end $$;
revoke all on function public.plan_storage_permitido(text,text,text) from public,anon,authenticated;
grant execute on function public.plan_storage_permitido(text,text,text) to authenticated;

alter table public.plan_carpetas enable row level security;
create policy plan_carpetas_select on public.plan_carpetas for select to authenticated
  using(public.plan_carpeta_visible(id));
revoke all on public.plan_carpetas from public,anon,authenticated;
grant select on public.plan_carpetas to authenticated;
notify pgrst,'reload schema';
commit;
