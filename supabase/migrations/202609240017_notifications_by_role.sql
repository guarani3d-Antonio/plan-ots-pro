begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

create table public.plan_notificaciones_rol (
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 rol text not null check (rol in ('administrador','supervisor','tecnico','viewer')),
 tipos text[] not null default array['nueva_ot','estado'],
 updated_at timestamptz not null default now(),
 primary key (tenant_id, rol),
 check (tipos <@ array['nueva_ot','estado','riesgo']::text[])
);
alter table public.plan_notificaciones_rol enable row level security;
revoke all on public.plan_notificaciones_rol from public, anon, authenticated;
grant select on public.plan_notificaciones_rol to authenticated;
create policy notificaciones_rol_creator_read on public.plan_notificaciones_rol
 for select to authenticated using (public.plan_es_creador());

create function public.plan_configurar_notificaciones(p_tenant uuid,p_rol text,p_tipos text[])
 returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if auth.uid() is null or not public.plan_es_creador() then
  raise exception 'Solo el Creador puede configurar notificaciones' using errcode='42501';
 end if;
 if p_rol not in ('administrador','supervisor','tecnico','viewer')
 or not exists(select 1 from public.tenants where id=p_tenant and activo)
 or exists(select 1 from unnest(coalesce(p_tipos,array[]::text[])) x where x not in ('nueva_ot','estado','riesgo')) then
  raise exception 'Configuración de notificaciones inválida' using errcode='22023';
 end if;
 insert into public.plan_notificaciones_rol(tenant_id,rol,tipos,updated_at)
 values(p_tenant,p_rol,coalesce(p_tipos,array[]::text[]),now())
 on conflict(tenant_id,rol) do update set tipos=excluded.tipos,updated_at=now();
end $$;

create function public.plan_notificaciones_config(p_tenant uuid)
 returns table(rol text,tipos text[]) language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
begin
 if auth.uid() is null or not public.plan_es_creador() then
  raise exception 'Solo el Creador puede consultar esta configuración' using errcode='42501';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant and activo) then
  raise exception 'Empresa no disponible' using errcode='42501';
 end if;
 return query select r.rol,coalesce(n.tipos,array['nueva_ot','estado']::text[])
 from unnest(array['administrador','supervisor','tecnico','viewer']::text[]) r(rol)
 left join public.plan_notificaciones_rol n on n.tenant_id=p_tenant and n.rol=r.rol;
end $$;

create or replace function public.plan_eventos_pagina(p_orden uuid default null,p_antes timestamptz default null,p_id uuid default null)
 returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 with pagina as (
 select e.*,exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid()) as leida
 from public.plan_ot_eventos e
 where ((p_orden is not null and e.orden_id=p_orden)
    or (p_orden is null and not e.legado and (
      (e.tipo='ordenes.insert' and 'nueva_ot'=any(coalesce(
        (select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),
        array['nueva_ot','estado']::text[])))
      or (e.tipo='ordenes.update' and e.cambios ? 'estado' and 'estado'=any(coalesce(
        (select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),
        array['nueva_ot','estado']::text[])))
      or (e.tipo='ordenes.update' and e.cambios ? 'nivel_riesgo' and e.cambios->'nivel_riesgo'->>'despues' in ('Alto','Extremo') and 'riesgo'=any(coalesce(
        (select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),
        array['nueva_ot','estado']::text[])))
    )))
 and (p_antes is null or (e.created_at,e.id)<(p_antes,p_id))
 order by e.created_at desc,e.id desc limit 51
 )
 select jsonb_build_object(
  'eventos',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (select * from pagina order by created_at desc,id desc limit 50) x),'[]'::jsonb),
  'hayMas',(select count(*)>50 from pagina),
  'sinLeer',(select count(*) from public.plan_ot_eventos e
    where not e.legado and not exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid())
    and ((e.tipo='ordenes.insert' and 'nueva_ot'=any(coalesce((select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),array['nueva_ot','estado']::text[])))
      or (e.tipo='ordenes.update' and e.cambios ? 'estado' and 'estado'=any(coalesce((select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),array['nueva_ot','estado']::text[])))
      or (e.tipo='ordenes.update' and e.cambios ? 'nivel_riesgo' and e.cambios->'nivel_riesgo'->>'despues' in ('Alto','Extremo') and 'riesgo'=any(coalesce((select n.tipos from public.plan_notificaciones_rol n where n.tenant_id=e.tenant_id and n.rol=(case when public.plan_es_creador() then 'administrador' else (select m.rol from public.tenant_miembros m where m.tenant_id=e.tenant_id and m.user_id=auth.uid() and m.activo) end)),array['nueva_ot','estado']::text[])))))
 );
 $$;

revoke all on function public.plan_configurar_notificaciones(uuid,text,text[]),public.plan_notificaciones_config(uuid) from public,anon,authenticated;
grant execute on function public.plan_configurar_notificaciones(uuid,text,text[]),public.plan_notificaciones_config(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
