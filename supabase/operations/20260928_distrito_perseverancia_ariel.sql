-- Ejecutar SOLO después de verificar la invitación enviada a Ariel en Auth.
-- Asigna rol Supervisor y exactamente las cuatro obras del Distrito.
begin;
do $$
declare
  v_creador uuid;
  v_empresa uuid;
  v_ariel uuid;
  v_obra record;
begin
  select u.id into v_creador
  from auth.users u join public.plataforma_administradores pa on pa.user_id=u.id and pa.activo
  where lower(u.email)='guarani3d@gmail.com';
  select id into v_ariel from auth.users where lower(email)='ajara@benitezbittar.com.py';
  select id into v_empresa from public.tenants where nombre='Benítez Bittar Constructora' and activo;
  if v_creador is null or v_ariel is null or v_empresa is null then
    raise exception 'Falta el Creador, la invitación de Ariel o la empresa';
  end if;
  if (select count(*) from public.proyectos where tenant_id=v_empresa and deleted_at is null
      and nombre in ('Torre Marfil — Distrito Perseverancia',
                     'Centro Comercial Distrito Perseverancia',
                     'Torre Güembé — Distrito Perseverancia',
                     'Torre Las Palmas — Distrito Perseverancia')) <> 4 then
    raise exception 'No están las cuatro obras esperadas';
  end if;
  perform set_config('request.jwt.claim.sub',v_creador::text,true);
  perform public.plan_admin_miembro(v_empresa,'ajara@benitezbittar.com.py','supervisor',true);
  for v_obra in select id from public.proyectos where tenant_id=v_empresa and deleted_at is null
      and nombre in ('Torre Marfil — Distrito Perseverancia',
                     'Centro Comercial Distrito Perseverancia',
                     'Torre Güembé — Distrito Perseverancia',
                     'Torre Las Palmas — Distrito Perseverancia')
  loop
    perform public.plan_admin_obra_miembro(v_obra.id,'ajara@benitezbittar.com.py','supervisor');
  end loop;
  perform public.plan_configurar_delegacion_invitacion(v_empresa,'ajara@benitezbittar.com.py',4,true);
end $$;
commit;

select t.nombre as empresa,u.email,tm.rol as rol_empresa,
  count(distinct pm.proyecto_id) as obras_asignadas,d.limite as invitaciones_de_prueba
from public.tenants t join public.tenant_miembros tm on tm.tenant_id=t.id
join auth.users u on u.id=tm.user_id
left join public.proyecto_miembros pm on pm.user_id=u.id
  and pm.proyecto_id in (select id from public.proyectos where tenant_id=t.id and proyecto_padre_id is null and deleted_at is null)
left join public.plan_delegaciones_invitacion d on d.tenant_id=t.id and d.supervisor_id=u.id
where t.nombre='Benítez Bittar Constructora' and lower(u.email)='ajara@benitezbittar.com.py'
group by t.nombre,u.email,tm.rol,d.limite;
