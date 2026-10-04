-- Reversion solo antes de producir candidatos, decisiones o emisiones.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if exists(select 1 from public.plan_documento_candidatos)
     or exists(select 1 from public.plan_documento_aprobaciones)
     or exists(select 1 from public.plan_documento_emisiones) then
    raise exception 'Hay expediente en proceso: no se permite borrar su trazabilidad';
  end if;
end $$;
drop policy plan_documentos_storage_insert on storage.objects;
drop policy plan_documentos_storage_delete on storage.objects;
drop policy plan_documentos_storage_update on storage.objects;
drop trigger plan_no_revisar_emitido on public.plan_documento_revisiones;
drop function public.plan_documento_no_revisar_emitido();
drop function public.plan_documento_emitir(uuid,uuid);
drop function public.plan_documento_revisar_pdf(uuid,text,text,text,uuid);
drop function public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb);
drop function public.plan_documento_render_liberar(uuid,uuid);
drop function public.plan_documento_render_reclamar(uuid,uuid);
drop function public.plan_documento_preparar(uuid,uuid);
drop table public.plan_documento_emisiones;
drop table public.plan_documento_aprobaciones;
drop table public.plan_documento_candidatos;
notify pgrst,'reload schema';
commit;
