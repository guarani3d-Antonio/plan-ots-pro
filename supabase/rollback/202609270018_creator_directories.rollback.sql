-- Reversión conservadora: aborta si hay fichas o vínculos nuevos para no borrar datos.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';
do $$ begin
  if exists(select 1 from public.plan_clientes limit 1)
    or exists(select 1 from public.plan_cliente_ubicaciones limit 1)
    or exists(select 1 from public.plan_contratista_fichas limit 1)
    or exists(select 1 from public.ordenes where cliente_id is not null or cliente_ubicacion_id is not null limit 1) then
    raise exception 'Reversión cancelada: hay fichas o OTs vinculadas; conservar datos y preparar migración correctiva';
  end if;
end $$;
drop function public.plan_clientes_para_obra(uuid);
drop function public.plan_contratistas_activos(uuid);
drop trigger plan_bloquear_reubicacion_cliente on public.plan_cliente_ubicaciones;
drop function public.plan_bloquear_reubicacion_cliente();
drop function public.plan_guardar_cliente_ubicacion(uuid,uuid,uuid,uuid,text,text,text,text,text,text,boolean);
drop function public.plan_guardar_cliente(uuid,uuid,text,text,text,text,text,text,boolean);
drop function public.plan_guardar_contratista_ficha(uuid,uuid,text,text,text,text,text,text,boolean);
drop trigger plan_validar_cliente_ot on public.ordenes;
drop function public.plan_validar_cliente_ot();
alter table public.ordenes drop column cliente_ubicacion_id;
alter table public.ordenes drop column cliente_id;
drop table public.plan_contratista_fichas;
alter table public.plan_contratistas drop constraint plan_contratistas_tenant_id_unico;
drop table public.plan_cliente_ubicaciones;
drop table public.plan_clientes;
notify pgrst, 'reload schema';
commit;
