begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

create function public.plan_equipo_alta_membresia() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if exists(select 1 from public.plataforma_administradores where user_id=new.user_id) then return new;end if;
 insert into public.plan_equipo_nodos(tenant_id,user_id,perfil) values(new.tenant_id,new.user_id,case when new.rol in ('administrador','supervisor') then 'jefe' when new.rol='tecnico' then 'tecnico' else 'lector' end) on conflict do nothing;
 insert into public.plan_equipo_permisos(tenant_id,user_id,clave,permitido,delegable)
 select new.tenant_id,new.user_id,c.clave,new.rol=any(c.base_roles) and not c.solo_creador,false from public.plan_permiso_catalogo c on conflict do nothing;
 return new;
end $$;
create trigger plan_equipo_alta_membresia after insert on public.tenant_miembros for each row execute function public.plan_equipo_alta_membresia();
revoke all on function public.plan_equipo_alta_membresia() from public,anon,authenticated;

-- Bring forward invitations, including the seats already occupied by the pilot.
insert into public.plan_equipo_invitaciones(id,tenant_id,superior_id,email,perfil,obras,estado,usuario_id,creado_por,creado_en)
 select i.id,i.tenant_id,i.supervisor_id,i.email,'tecnico',array[i.proyecto_id],case when i.estado='enviada' then 'enviada' else 'reservada' end,i.invitado_id,i.supervisor_id,i.created_at
 from public.plan_invitaciones_equipo i join public.plan_equipo_nodos n on n.tenant_id=i.tenant_id and n.user_id=i.supervisor_id;
update public.plan_equipo_nodos n set superior_id=i.superior_id
from public.plan_equipo_invitaciones i where i.tenant_id=n.tenant_id and i.usuario_id=n.user_id and n.perfil='tecnico' and n.superior_id is null
 and not exists(select 1 from public.proyecto_miembros m join public.proyectos p on p.id=m.proyecto_id where m.user_id=n.user_id and p.tenant_id=n.tenant_id and p.proyecto_padre_id is null and not public.plan_equipo_obra_usuario(n.tenant_id,i.superior_id,p.id));

create function public.plan_equipo_reservar(p_tenant uuid,p_superior uuid,p_email text,p_perfil text,p_obras uuid[]) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v uuid;mail text:=lower(btrim(p_email));n public.plan_equipo_nodos;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text,721));
 if auth.uid() is null or (not public.plan_es_creador() and (not public.plan_tiene_permiso('equipo.invitar',p_tenant) or (p_superior<>auth.uid() and not public.plan_equipo_puede_gestionar(p_tenant,p_superior,'equipo.editar')))) then raise exception 'Sin permiso para invitar a esta rama' using errcode='42501';end if;
 select * into n from public.plan_equipo_nodos where tenant_id=p_tenant and user_id=p_superior;
 if not found or not public.plan_equipo_activo(p_tenant,p_superior) or p_perfil not in ('tecnico','ayudante','lector') or (n.perfil<>'jefe' and p_perfil<>'ayudante') then raise exception 'Superior o perfil no válido' using errcode='22023';end if;
 if not public.plan_equipo_permiso_usuario(p_tenant,p_superior,'equipo.invitar') and not public.plan_es_creador() then raise exception 'Superior sin delegación' using errcode='42501';end if;
 if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo inválido' using errcode='22023';end if;
 if cardinality(p_obras) is null or cardinality(p_obras)<1 or cardinality(p_obras)>1000 or exists(select 1 from unnest(p_obras) w where not exists(select 1 from public.proyectos p where p.id=w and p.tenant_id=p_tenant and p.proyecto_padre_id is null and public.plan_equipo_obra_usuario(p_tenant,p_superior,w) and (public.plan_es_creador() or public.plan_equipo_obra_usuario(p_tenant,auth.uid(),w)))) then raise exception 'Seleccioná obras autorizadas del superior' using errcode='42501';end if;
 if exists(select 1 from auth.users where lower(email)=mail) then raise exception 'La cuenta ya existe. Gestioná su membresía desde Usuarios.' using errcode='22023';end if;
 insert into public.plan_equipo_invitaciones(tenant_id,superior_id,email,perfil,obras,creado_por) values(p_tenant,p_superior,mail,p_perfil,p_obras,auth.uid()) returning id into v;
 perform public.plan_equipo_verificar_cupos(p_tenant);
 insert into public.plan_equipo_eventos(tenant_id,actor_id,accion,despues) values(p_tenant,auth.uid(),'reservar_invitacion',jsonb_build_object('id',v,'superior',p_superior,'perfil',p_perfil));
 return v;
end $$;
create function public.plan_equipo_confirmar(p_reserva uuid,p_usuario uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.plan_equipo_invitaciones;n public.plan_equipo_nodos;legado text;
begin
 select * into i from public.plan_equipo_invitaciones where id=p_reserva;
 if not found then raise exception 'Reserva inexistente' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(i.tenant_id::text,721));
 select * into i from public.plan_equipo_invitaciones where id=p_reserva and estado='reservada' for update;
 if not found or not exists(select 1 from auth.users where id=p_usuario and lower(email)=i.email) then raise exception 'Reserva no válida' using errcode='42501';end if;
 if not public.plan_equipo_activo(i.tenant_id,i.superior_id) or (not exists(select 1 from public.plataforma_administradores where user_id=i.creado_por and activo) and not public.plan_equipo_permiso_usuario(i.tenant_id,i.creado_por,'equipo.invitar')) or exists(select 1 from unnest(i.obras) w where not public.plan_equipo_obra_usuario(i.tenant_id,i.superior_id,w)) then raise exception 'La autorización cambió durante la invitación' using errcode='42501';end if;
 if not exists(select 1 from public.plataforma_administradores where user_id=i.creado_por and activo) and (not public.plan_equipo_permiso_usuario(i.tenant_id,i.superior_id,'equipo.invitar') or (i.creado_por<>i.superior_id and not public.plan_equipo_descendiente(i.tenant_id,i.superior_id,i.creado_por)) or exists(select 1 from unnest(i.obras) w where not public.plan_equipo_obra_usuario(i.tenant_id,i.creado_por,w))) then raise exception 'La rama autorizada cambió durante la invitación' using errcode='42501';end if;
 select * into n from public.plan_equipo_nodos where tenant_id=i.tenant_id and user_id=i.superior_id;
 if n.perfil<>'jefe' and i.perfil<>'ayudante' then raise exception 'El perfil del superior cambió' using errcode='42501';end if;
 legado:=case when i.perfil='lector' then 'viewer' else 'tecnico' end;
 insert into public.tenant_miembros(tenant_id,user_id,rol,activo,created_by) values(i.tenant_id,p_usuario,legado,true,i.creado_por);
 update public.plan_equipo_nodos set superior_id=i.superior_id,perfil=i.perfil where tenant_id=i.tenant_id and user_id=p_usuario;
 update public.plan_equipo_permisos p set permitido=c.clave<>'equipo.invitar' and legado=any(c.base_roles) and public.plan_equipo_permiso_usuario(i.tenant_id,i.superior_id,c.clave,true),delegable=false from public.plan_permiso_catalogo c where p.tenant_id=i.tenant_id and p.user_id=p_usuario and c.clave=p.clave;
 insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por) select w,p_usuario,legado,i.creado_por from unnest(i.obras) w;
 update public.plan_equipo_invitaciones set estado='enviada',usuario_id=p_usuario,actualizado_en=now() where id=p_reserva;
 perform public.plan_equipo_verificar_cupos(i.tenant_id);
 insert into public.plan_equipo_eventos(tenant_id,usuario_id,actor_id,accion,despues) values(i.tenant_id,p_usuario,i.creado_por,'confirmar_invitacion',jsonb_build_object('id',p_reserva));
end $$;
create function public.plan_equipo_cancelar(p_reserva uuid) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare i public.plan_equipo_invitaciones;
begin
 select * into i from public.plan_equipo_invitaciones where id=p_reserva;
 if not found then raise exception 'Invitación inexistente' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(i.tenant_id::text,721));
 if auth.uid() is not null and not public.plan_es_creador() and (not public.plan_tiene_permiso('equipo.invitar',i.tenant_id) or (i.superior_id<>auth.uid() and not public.plan_equipo_puede_gestionar(i.tenant_id,i.superior_id,'equipo.editar'))) then raise exception 'Sin permiso' using errcode='42501';end if;
 if i.estado='enviada' then raise exception 'La cuenta ya fue asignada. Desactivala desde su ficha.' using errcode='22023';end if;
 update public.plan_equipo_invitaciones set estado='cancelada',actualizado_en=now() where id=p_reserva and estado='reservada';
 insert into public.plan_equipo_eventos(tenant_id,actor_id,accion,despues) values(i.tenant_id,auth.uid(),'cancelar_invitacion',jsonb_build_object('id',p_reserva));
end $$;
revoke all on function public.plan_equipo_reservar(uuid,uuid,text,text,uuid[]),public.plan_equipo_confirmar(uuid,uuid),public.plan_equipo_cancelar(uuid) from public,anon,authenticated;
grant execute on function public.plan_equipo_reservar(uuid,uuid,text,text,uuid[]),public.plan_equipo_cancelar(uuid) to authenticated;
grant execute on function public.plan_equipo_confirmar(uuid,uuid),public.plan_equipo_cancelar(uuid) to service_role;
-- The old reservation endpoint must not bypass current quotas and permissions.
revoke execute on function public.plan_reservar_invitacion_equipo(uuid,uuid,text),public.plan_configurar_delegacion_invitacion(uuid,text,smallint,boolean) from authenticated;
notify pgrst,'reload schema';
commit;
