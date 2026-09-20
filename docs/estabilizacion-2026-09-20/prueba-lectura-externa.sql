-- Ejecutada en el Dashboard, 20/09/2026. Sin mutaciones de filas ni roles persistentes.
-- Claims sintéticos: no crea una cuenta Auth ni prueba un JWT firmado.
begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select jsonb_build_object(
  'role',current_user,
  'memberships',(select count(*) from public.proyecto_miembros),
  'projects',(select count(*) from public.proyectos),
  'orders',(select count(*) from public.ordenes),
  'photo_rows',(select count(*) from public.fotos),
  'project_view',(select count(*) from public.vista_proyectos_resumen),
  'order_view',(select count(*) from public.vista_ordenes_fotos),
  'storage_metadata',(select count(*) from storage.objects where bucket_id in ('fotos','planos','exports'))
) as outsider_read_test;
rollback;
