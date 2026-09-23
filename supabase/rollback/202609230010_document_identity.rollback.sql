-- Reversión segura solo si todavía no se reservaron folios.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Ejecutar como postgres'; end if;
  if exists(select 1 from public.plan_documentos) then
    raise exception 'Hay folios reservados; no borrar ni reutilizar numeración';
  end if;
  if (select is_called from public.plan_documento_folio_seq) then
    raise exception 'La secuencia ya consumió folios; no reiniciarla ni reutilizarlos';
  end if;
end $$;
drop function public.plan_documento_revision_crear(uuid,jsonb,text,integer,text,uuid);
drop function public.plan_documento_reservar(uuid,text,integer,uuid);
drop table public.plan_documento_revisiones;
drop table public.plan_documentos;
drop sequence public.plan_documento_folio_seq;
notify pgrst,'reload schema';
commit;
