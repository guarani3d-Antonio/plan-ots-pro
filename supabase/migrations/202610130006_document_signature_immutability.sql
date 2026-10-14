begin;
create function public.plan_documento_firma_inmutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 raise exception 'Las firmas registradas son inmutables. Cree una versión corregida' using errcode='42501';
end $$;
create trigger plan_documento_firma_inmutable before update or delete on public.plan_documento_firmas
 for each row execute function public.plan_documento_firma_inmutable();
revoke all on function public.plan_documento_firma_inmutable() from public,anon,authenticated;
commit;
