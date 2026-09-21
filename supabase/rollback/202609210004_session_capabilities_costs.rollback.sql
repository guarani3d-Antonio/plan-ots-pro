begin;
set local lock_timeout='5s';
drop function public.plan_contexto_acceso();
drop function public.plan_admin_empresa(text,uuid,boolean);
drop function public.plan_admin_miembro(uuid,text,text,boolean);
drop function public.plan_admin_obra_miembro(uuid,text,text);
drop trigger plan_separar_costo on public.ordenes;
drop function public.plan_separar_costo();
alter table public.ordenes drop constraint plan_costo_no_publico;
alter table public.ordenes disable trigger user;
update public.ordenes o set costo=c.costo from public.orden_costos c where c.orden_id=o.id;
alter table public.ordenes enable trigger user;
drop table public.orden_costos;
create or replace function public.fn_audit_orden_eliminada()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  insert into public.ordenes_eliminadas(
    orden_id,proyecto_id,ot,ubicacion,rubro,estado,responsable,prioridad,
    pos_x,pos_y,datos_completos,eliminado_por
  ) values(
    old.id,old.proyecto_id,old.ot,old.ubicacion,old.rubro,old.estado,old.responsable,old.prioridad,
    old.pos_x,old.pos_y,pg_catalog.to_jsonb(old),auth.uid()
  );
  return old;
end;
$$;
drop policy versiones_select on public.versiones;
drop policy versiones_insert on public.versiones;
create policy versiones_select on public.versiones for select to authenticated using(public.plan_es_miembro_proyecto(proyecto_id));
create policy versiones_insert on public.versiones for insert to authenticated with check(public.plan_puede_editar_proyecto(proyecto_id) and (created_by is null or created_by=auth.uid()));
notify pgrst,'reload schema';
commit;
