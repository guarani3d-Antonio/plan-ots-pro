-- Solo permite volver atras antes de crear nuevas revisiones con fuentes.
-- Una vez que existan, conservar la tabla y planear una migracion compatible.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if exists(select 1 from public.plan_documento_fuentes) then
    raise exception 'Hay fuentes congeladas: no se permite borrarlas';
  end if;
end $$;
drop trigger plan_documento_capturar_fuentes on public.plan_documento_revisiones;
drop trigger plan_revisiones_inmutables on public.plan_documento_revisiones;
drop trigger plan_fuentes_inmutables on public.plan_documento_fuentes;
drop trigger plan_foto_referencias_inmutables on public.plan_documento_foto_referencias;
drop policy plan_documento_conservar_foto on storage.objects;
drop policy plan_documento_no_sobrescribir_foto on storage.objects;
drop function public.plan_documento_capturar_fuentes();
drop function public.plan_documento_no_alterar_registro();
drop function public.plan_documento_foto_referida(text);
drop table public.plan_documento_foto_referencias;
drop table public.plan_documento_fuentes;
notify pgrst,'reload schema';
commit;
