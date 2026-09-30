begin;

-- Los cuatro cupos delegados del piloto son cuentas de campo, no supervisores.
-- La reserva sigue exigiendo que quien invita supervise la torre elegida.
create or replace function public.plan_confirmar_invitacion_equipo(p_reserva uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v public.plan_invitaciones_equipo%rowtype;
begin
  select * into v from public.plan_invitaciones_equipo where id=p_reserva and estado='reservada' for update;
  if not found or not exists(select 1 from auth.users u where u.id=p_usuario and lower(u.email)=v.email) then
    raise exception 'Reserva o cuenta invitada invalida' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.plan_delegaciones_invitacion d
    join public.tenants t on t.id=d.tenant_id and t.activo
    join public.tenant_miembros tm on tm.tenant_id=d.tenant_id and tm.user_id=d.supervisor_id
    join public.proyectos p on p.id=v.proyecto_id and p.tenant_id=d.tenant_id and p.deleted_at is null
    join public.proyecto_miembros pm on pm.proyecto_id=p.id and pm.user_id=d.supervisor_id and pm.rol='supervisor'
    where d.tenant_id=v.tenant_id and d.supervisor_id=v.supervisor_id
      and d.activa and tm.activo and tm.rol='supervisor'
      and p.proyecto_padre_id is null
  ) then
    raise exception 'La delegacion ya no esta vigente' using errcode='42501';
  end if;
  insert into public.tenant_miembros(tenant_id,user_id,rol,activo,created_by)
  values(v.tenant_id,p_usuario,'tecnico',true,v.supervisor_id);
  insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
  values(v.proyecto_id,p_usuario,'tecnico',v.supervisor_id);
  update public.plan_invitaciones_equipo set estado='enviada',invitado_id=p_usuario,sent_at=now() where id=p_reserva;
end $$;

revoke all on function public.plan_confirmar_invitacion_equipo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.plan_confirmar_invitacion_equipo(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
