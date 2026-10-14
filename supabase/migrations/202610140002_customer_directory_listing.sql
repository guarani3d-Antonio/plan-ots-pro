begin;
-- Solo agrega una lectura compacta. Las fichas y documentos existentes no se modifican.
create function public.plan_clientes_directorio(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare fichas jsonb; result jsonb;
begin
 fichas:=public.plan_clientes_fichas(p_tenant); -- verifica identidad, permiso y alcance de empresa
 with visibles as materialized (
   select o.id,o.cliente_id,o.estado,coalesce(o.fecha_ingreso,(o.created_at at time zone 'America/Asuncion')::date) recepcion
   from public.ordenes o join public.proyectos p on p.id=o.proyecto_id and p.tenant_id=p_tenant
   join public.proyectos w on w.id=coalesce(p.proyecto_padre_id,p.id) and w.deleted_at is null
   where o.deleted_at is null and public.plan_cliente_obra_accesible(p_tenant,p.id)
 ), atenciones as (
   select cliente_id,count(*) total,count(*) filter(where estado in ('Pendiente','En proceso')) abiertas,max(recepcion) ultima
   from visibles group by cliente_id
 ), respuestas as materialized (
   select d.id,sf.fuentes->'orden'->>'cliente_id' cliente,rv.datos->'encuesta' datos
   from public.plan_documentos d join visibles o on o.id=d.orden_id
   join lateral(select r.id,r.datos from public.plan_documento_revisiones r where r.documento_id=d.id order by r.revision desc limit 1) rv on true
   join public.plan_documento_fuentes sf on sf.revision_id=rv.id and sf.documento_id=d.id
   where d.tenant_id=p_tenant and d.tipo='encuesta'
   and nullif(btrim(rv.datos->'encuesta'->>'respondente'),'') is not null
   and public.plan_cliente_fecha(rv.datos->'encuesta'->>'fechaRespuesta') is not null
   and exists(select 1 from unnest(array['rapidez','plazoPrometido','calidadTrabajo','profesionalismo','confianza','recontratacion','recomendacion']) k
     where btrim(rv.datos->'encuesta'->>k) ~ '^([1-9]|10)$' or upper(btrim(rv.datos->'encuesta'->>k))='N/A')
 ), encuestas as (
   select r.cliente,count(distinct r.id) respondidas,
     avg(case when btrim(r.datos->>k) ~ '^([1-9]|10)$' then btrim(r.datos->>k)::numeric end) promedio
   from respuestas r cross join unnest(array['rapidez','plazoPrometido','calidadTrabajo','profesionalismo','confianza','recontratacion','recomendacion']) k
   group by r.cliente
 )
 select coalesce(jsonb_agg(f||jsonb_build_object('indicadores',jsonb_build_object(
   'total',coalesce(a.total,0),'abiertas',coalesce(a.abiertas,0),'ultima',a.ultima,
   'encuestasRespondidas',coalesce(e.respondidas,0),'satisfaccion',e.promedio)) order by f->'datos'->>'nombre'),'[]') into result
 from jsonb_array_elements(fichas) f left join atenciones a on a.cliente_id=(f->>'id')::uuid
 left join encuestas e on e.cliente=f->>'id';
 return result;
end $$;
revoke all on function public.plan_clientes_directorio(uuid) from public,anon,authenticated;
grant execute on function public.plan_clientes_directorio(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
