begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

-- Editing a person's photo uses the existing team edit permission and hierarchy.
-- Authentication credentials, roles, membership and permission grants are untouched.
create function public.plan_equipo_foto_escribible(p_name text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare u uuid;
begin
 if auth.uid() is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then return false;end if;
 u:=split_part(p_name,'/',1)::uuid;
 return exists(select 1 from public.plan_equipo_nodos n where n.user_id=u
  and public.plan_equipo_puede_gestionar(n.tenant_id,u,'equipo.editar'));
exception when invalid_text_representation then return false;
end $$;

create function public.plan_equipo_foto_guardar(p_tenant uuid,p_usuario uuid,p_path text) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare previous text;
begin
 if not public.plan_equipo_puede_gestionar(p_tenant,p_usuario,'equipo.editar') then
  raise exception 'Sin permiso para editar la foto de esta persona' using errcode='42501';
 end if;
 if not public.plan_equipo_foto_escribible(p_path) or split_part(p_path,'/',1)<>p_usuario::text
  or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=p_path and owner_id=auth.uid()::text) then
  raise exception 'La imagen no pertenece a esta persona o no fue cargada por esta cuenta' using errcode='22023';
 end if;
 select raw_user_meta_data->>'avatar_path' into previous from auth.users where id=p_usuario for update;
 update auth.users set raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{avatar_path}',to_jsonb(p_path),true) where id=p_usuario;
 insert into public.plan_equipo_eventos(tenant_id,usuario_id,actor_id,accion,antes,despues)
 values(p_tenant,p_usuario,auth.uid(),'foto',jsonb_build_object('avatar_path',previous),jsonb_build_object('avatar_path',p_path));
end $$;

revoke all on function public.plan_equipo_foto_escribible(text),public.plan_equipo_foto_guardar(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.plan_equipo_foto_escribible(text),public.plan_equipo_foto_guardar(uuid,uuid,text) to authenticated;
create policy plan_equipo_fotos_cargar on storage.objects for insert to authenticated
 with check(bucket_id='profile-photos' and owner_id=auth.uid()::text and public.plan_equipo_foto_escribible(name));
notify pgrst,'reload schema';
commit;
