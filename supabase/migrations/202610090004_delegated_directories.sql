begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Exact, enumerated entry points retain their existing validation and audit.
-- No global replacement of creator authority: only these directory operations
-- may be delegated, scoped to the tenant inferred from their own arguments.
do $$ declare r record;f record;source text;guard text;begin
 for r in select * from (values
 ('plan_directorio_listar','public.plan_tiene_permiso(p_tipo||''.ver'',p_tenant)'),
 ('plan_directorio_guardar','public.plan_tiene_permiso(p_tipo||case when p_id is null then ''.crear'' else ''.editar'' end,p_tenant)'),
 ('plan_guardar_cliente','public.plan_tiene_permiso(''cliente''||case when p_id is null then ''.crear'' else ''.editar'' end,p_tenant)'),
 ('plan_guardar_contratista_ficha','public.plan_tiene_permiso(''contratista''||case when p_id is null then ''.crear'' else ''.editar'' end,p_tenant)'),
 ('plan_guardar_ficha_obra','public.plan_tiene_permiso(''obra''||case when p_obra is null then ''.crear'' else ''.editar'' end,p_tenant)'),
 ('plan_directorio_obras','public.plan_tiene_permiso(''obra.ver'',p_tenant)'),
 ('plan_guardar_cliente_ubicacion','public.plan_tiene_permiso(''cliente.ubicaciones'',p_tenant)'),
 ('plan_directorio_ubicacion_guardar','public.plan_tiene_permiso(''cliente.ubicaciones'',p_tenant)'),
 ('plan_directorio_bloqueo','public.plan_tiene_permiso(p_tipo||''.ver'',public.plan_directorio_entidad_tenant(p_tipo,p_id))'),
 ('plan_eliminar_directorio','public.plan_tiene_permiso(p_tipo||''.eliminar'',public.plan_directorio_entidad_tenant(p_tipo,p_id))'),
 ('plan_guardar_foto_directorio','public.plan_tiene_permiso(p_tipo||''.editar'',public.plan_directorio_entidad_tenant(p_tipo,p_id))'),
 ('plan_vincular_contacto','public.plan_tiene_permiso(''contacto.editar'',p_tenant)')
 ) x(nombre,expr) loop
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname=r.nombre loop
   source:=pg_get_functiondef(f.oid);guard:='(public.plan_es_creador() or '||r.expr||')';
   if position('not public.plan_es_creador()' in source)=0 then raise exception 'Guardia inesperada: %',r.nombre;end if;
   source:=replace(source,'not public.plan_es_creador()','not '||guard);
   if r.nombre='plan_directorio_obras' then
    source:=replace(source,'p.proyecto_padre_id is null and p.deleted_at is null','p.proyecto_padre_id is null and p.deleted_at is null and (public.plan_es_creador() or public.plan_equipo_obra_usuario(p_tenant,auth.uid(),p.id))');
   end if;
   if r.nombre='plan_directorio_listar' then
    source:=replace(source,'where p_tipo=''empresa''','where p_tipo=''empresa'' and (public.plan_es_creador() or t.id=p_tenant)');
    source:=replace(source,'p.proyecto_padre_id is null and p.deleted_at is null','p.proyecto_padre_id is null and p.deleted_at is null and (public.plan_es_creador() or public.plan_equipo_obra_usuario(p_tenant,auth.uid(),p.id))');
   end if;
   execute source;
  end loop;
 end loop;
end $$;
-- A company administrator edits only his existing company, never creates one.
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_admin_empresa(text,uuid,boolean)'::regprocedure);
 src:=replace(src,'not public.plan_es_creador()','not (public.plan_es_creador() or (p_id is not null and public.plan_tiene_permiso(''empresa.editar'',p_id)))');
 execute src;
end $$;

create function public.plan_directorio_estado_permiso() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a jsonb:=to_jsonb(new);b jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;kind text;tid uuid;
begin
 if auth.uid() is null or public.plan_es_creador() then return new;end if;
 if tg_op='UPDATE' and a->'activo' is distinct from b->'activo' then
  kind:=case tg_table_name when 'tenants' then 'empresa' when 'plan_clientes' then 'cliente' when 'plan_contactos' then 'contacto' when 'plan_contratista_fichas' then 'contratista' else a->>'tipo' end;
  tid:=case when tg_table_name='tenants' then (a->>'id')::uuid else (a->>'tenant_id')::uuid end;
  perform public.plan_exigir_accion(kind||'.estado',null,tid);
 end if;
 return new;
end $$;
do $$ declare tabla text;begin
 foreach tabla in array array['tenants','plan_clientes','plan_contactos','plan_contratista_fichas','plan_directorio_perfiles'] loop
 execute format('create trigger aa_plan_estado_permiso before update on public.%I for each row execute function public.plan_directorio_estado_permiso()',tabla);
 end loop;
end $$;
revoke all on function public.plan_directorio_estado_permiso() from public,anon,authenticated;

-- Photo read access follows the same scoped directory grant. Profiles remain
-- private; only people present in the authorized branch can read each other.
create or replace function public.plan_directorio_acceso(p_tipo text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare tid uuid:=public.plan_directorio_entidad_tenant(p_tipo,p_id);
begin
 if auth.uid() is null or tid is null then return false;end if;
 if public.plan_es_creador() then return true;end if;
 if public.plan_tiene_permiso(p_tipo||'.ver',tid) and (p_tipo<>'obra' or public.plan_equipo_obra_usuario(tid,auth.uid(),p_id)) then return true;end if;
 if p_tipo in ('empresa','contacto') then return false;end if;
 return public.plan_directorio_acceso_base(p_tipo,p_id);
end $$;
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_directorio_archivo_permitido(text,boolean)'::regprocedure);
 src:=replace(src,'return public.plan_es_creador() or','return public.plan_es_creador() or public.plan_tiene_permiso(kind||''.editar'',public.plan_directorio_entidad_tenant(kind,fid)) or');execute src;
end $$;

create function public.plan_equipo_foto_permitida(p_name text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare u uuid;tid uuid;
begin
 if split_part(p_name,'/',1) !~ '^[0-9a-f-]{36}$' then return false;end if;
 u:=split_part(p_name,'/',1)::uuid;
 if u=auth.uid() then return true;end if;
 if public.plan_es_creador() then return true;end if;
 select tenant_id into tid from public.tenant_miembros where user_id=u and activo;
 if tid is null or not public.plan_tiene_permiso('equipo.ver',tid) or exists(select 1 from public.plataforma_administradores where user_id=u) then return false;end if;
 return public.plan_equipo_descendiente(tid,u,auth.uid()) or public.plan_equipo_descendiente(tid,auth.uid(),u);
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.plan_equipo_foto_permitida(text) from public,anon,authenticated;
grant execute on function public.plan_equipo_foto_permitida(text) to authenticated;
create policy plan_equipo_fotos_ver on storage.objects for select to authenticated using(bucket_id='profile-photos' and public.plan_equipo_foto_permitida(name));
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_equipo_listar(uuid)'::regprocedure);
 src:=replace(src,'''email'',u.email,','''email'',u.email,''avatar_path'',case when starts_with(u.raw_user_meta_data->>''avatar_path'',u.id::text||''/'') then u.raw_user_meta_data->>''avatar_path'' end,');execute src;
end $$;
notify pgrst,'reload schema';
commit;
