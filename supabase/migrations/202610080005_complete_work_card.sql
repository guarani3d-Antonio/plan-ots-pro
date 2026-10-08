begin;
set local lock_timeout='10s';
set local statement_timeout='90s';
-- One transaction saves the work card and the selected contact. Photos keep their
-- existing private-storage workflow and can be retried without duplicating a work.
create function public.plan_guardar_obra_completa(p_tenant uuid,p_obra uuid,p_nombre text,p_direccion text,p_color text,p_contacto jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare obra uuid; contacto uuid;
begin
  if auth.uid() is null or not public.plan_es_creador() then
    raise exception 'Sin permiso para administrar obras' using errcode='42501'; end if;
  if p_contacto is not null and jsonb_typeof(p_contacto)<>'object' then
    raise exception 'Contacto inválido' using errcode='22023'; end if;
  obra:=public.plan_guardar_ficha_obra(p_tenant,p_obra,p_nombre,p_direccion,p_color);
  if p_contacto is not null then
    contacto:=public.plan_guardar_contacto_obra(obra,nullif(p_contacto->>'id','')::uuid,
      p_contacto->>'nombre',p_contacto->>'cargo',p_contacto->>'telefono',p_contacto->>'correo');
  end if;
  return jsonb_build_object('obra_id',obra,'contacto_id',contacto);
end $$;
revoke all on function public.plan_guardar_obra_completa(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plan_guardar_obra_completa(uuid,uuid,text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
