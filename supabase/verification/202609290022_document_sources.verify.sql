-- Ejecutar despues de la migracion. Las revisiones previas siguen sin fuentes:
-- nunca se completan usando el estado actual de la OT.
select
  count(*) filter (where f.revision_id is not null) as revisiones_con_fuentes,
  count(*) filter (where f.revision_id is null) as revisiones_anteriores_sin_fuentes
from public.plan_documento_revisiones r
left join public.plan_documento_fuentes f on f.revision_id=r.id;

select
  count(*) as huellas_invalidas
from public.plan_documento_fuentes f
where f.fuentes_sha256 <> encode(pg_catalog.sha256(convert_to(f.fuentes::text,'UTF8')),'hex')
   or f.fuentes->'revision'->>'id' <> f.revision_id::text;

select tgname,tgenabled from pg_trigger
where tgrelid='public.plan_documento_revisiones'::regclass
  and tgname='plan_documento_capturar_fuentes';

select count(*) as rutas_fotograficas_conservadas from public.plan_documento_foto_referencias;

select policyname,roles,cmd from pg_policies
where schemaname='public' and tablename='plan_documento_fuentes';
