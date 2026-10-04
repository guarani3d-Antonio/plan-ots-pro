select
  (select count(*) from public.plan_documento_candidatos) as candidatos,
  (select count(*) from public.plan_documento_aprobaciones) as decisiones,
  (select count(*) from public.plan_documento_emisiones) as emisiones;

-- Cero filas es el resultado correcto en cada control de integridad.
select count(*) as emisiones_inconsistentes
from public.plan_documento_emisiones e
join public.plan_documento_candidatos c on c.id=e.candidato_id
join public.plan_documento_aprobaciones a on a.id=e.aprobacion_id
left join storage.objects o on o.bucket_id='exports' and o.name=e.pdf_path
left join storage.buckets b on b.id='exports'
where a.candidato_id<>c.id or a.decision<>'aprobado'
   or a.pdf_sha256<>e.pdf_sha256 or c.pdf_sha256<>e.pdf_sha256
   or c.revision_id<>e.revision_id or c.documento_id<>e.documento_id
   or c.fuentes_binarias is distinct from e.fuentes_binarias
   or o.name is null or b.public is distinct from false;

select
  has_function_privilege('authenticated',
    'public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb)','EXECUTE') as cliente_puede_declarar_pdf,
  has_function_privilege('service_role',
    'public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb)','EXECUTE') as servicio_puede_declarar_pdf;

select
  has_function_privilege('authenticated',
    'public.plan_documento_render_reclamar(uuid,uuid)','EXECUTE') as cliente_puede_reclamar_render,
  has_function_privilege('service_role',
    'public.plan_documento_render_reclamar(uuid,uuid)','EXECUTE') as servicio_puede_reclamar_render;

select policyname,cmd,permissive,roles from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname in ('plan_documentos_storage_insert','plan_documentos_storage_delete',
    'plan_documentos_storage_update');
