-- Retira exclusivamente fixtures identificados. NO es el reset general.
-- Ejecutar solo para deshacer este lote; después permite rollback de fase 2.
-- Las cuentas Auth se conservan hasta decidir su eliminación por Admin API.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
lock table public.proyectos,public.tenants,public.tenant_miembros,public.proyecto_miembros in access exclusive mode;
do $$ begin
  if current_user<>'postgres' then raise exception 'Ejecutar rollback mediante postgres'; end if;
  if exists(select 1 from public.proyectos where tenant_id in
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')
    and id not in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',
      '22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002')) then
    raise exception 'Hay obras adicionales: revisar recuperación antes de continuar';
  end if;
  if exists(select 1 from public.tenants where
    (id='10000000-0000-4000-8000-000000000001' and slug<>'empresa-prueba-1') or
    (id='20000000-0000-4000-8000-000000000002' and slug<>'empresa-prueba-2')) then
    raise exception 'La identidad de fixtures no coincide';
  end if;
end $$;
-- El FK legado de ot_comentarios no tiene CASCADE.
delete from public.ot_comentarios where proyecto_id in (
  select id from public.proyectos where tenant_id in ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'));
delete from public.proyectos where tenant_id in ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
delete from public.ordenes_eliminadas where proyecto_id in
  ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',
   '22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002');
delete from public.tenant_miembros where tenant_id in ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
delete from public.tenants where id in ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
delete from public.plataforma_administradores where user_id in (select id from auth.users where email='creador@plan-ots.test');
commit;
