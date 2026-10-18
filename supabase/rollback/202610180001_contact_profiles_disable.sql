-- Optional rollback: retain all records, keys and old RPCs. Deploy the previous
-- client first. Re-grant these six functions from the migration to resume.
begin;
revoke execute on function public.plan_contactos_directorio(uuid),public.plan_contacto_opciones(uuid,uuid,text),public.plan_contacto_ficha_guardar(uuid,uuid,timestamptz,jsonb,uuid,text,uuid),public.plan_contacto_vinculo_guardar(uuid,uuid,text,uuid,text,boolean,boolean),public.plan_contacto_comunicacion_guardar(uuid,uuid,uuid,jsonb),public.plan_contacto_historial(uuid,uuid,uuid,text,integer) from authenticated;
notify pgrst,'reload schema';
commit;
