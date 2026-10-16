import {readFile,writeFile} from 'node:fs/promises';
const migration=await readFile('supabase/migrations/202610160003_versioned_document_branding.sql','utf8');
const capture=migration.split('$patch$')[1];if(!capture)throw Error('Falta el bloque de captura reversible');
await writeFile('supabase/rollback/202610160003_versioned_document_branding.rollback.sql',`begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Revert behavior only. Existing revisions, sources, signatures and files remain.
do $$ declare src text;begin
 src:=pg_get_functiondef('public.plan_documento_capturar_fuentes()'::regprocedure);
 src:=replace(src,$patch$${capture}$patch$,'');execute src;
 src:=pg_get_functiondef('public.plan_documento_pdf_listo(uuid,uuid,text,text,bigint,jsonb)'::regprocedure);
 src:=replace(src,'v_fotos jsonb; v_manifest_fotos jsonb;','v_fotos jsonb;');
 src:=replace(src,'  v_manifest_fotos:=public.plan_documento_logo_binario_validar(p_candidato,p_fuentes_binarias);'||E'\\n','');
 src:=replace(src,'jsonb_array_length(v_manifest_fotos)','jsonb_array_length(p_fuentes_binarias)');
 src:=replace(src,'v_item:=v_manifest_fotos->v_index;','v_item:=p_fuentes_binarias->v_index;');execute src;
 src:=pg_get_functiondef('public.plan_documento_version_guardar(uuid,jsonb,bigint,uuid,boolean,text,integer,text)'::regprocedure);
 src:=replace(src,'p_plantilla in (''expediente-controlado-2026-10-14-cronograma-unificado'',''expediente-controlado-2026-10-16-marca'')','p_plantilla=''expediente-controlado-2026-10-14-cronograma-unificado''');execute src;
 src:=pg_get_functiondef('public.plan_presupuesto_guardar(uuid,uuid,jsonb,uuid,uuid,uuid)'::regprocedure);
 src:=replace(src,'''plantilla_version'',''presupuesto-arquitectura-2026-10-16'',''logo_path'',logo','''logo_path'',logo');execute src;
end $$;
drop policy plan_documento_logo_read on storage.objects;
drop policy plan_documento_logo_no_delete on storage.objects;
drop policy plan_documento_logo_no_update on storage.objects;
drop index public.plan_documento_logo_path;
drop function public.plan_empresa_marca_obra(uuid),public.plan_documento_logo_leer(text),public.plan_documento_logo_conservar(text),public.plan_documento_logo_binario_validar(uuid,jsonb);
notify pgrst,'reload schema';
commit;
`);
console.log('Reversión preparada: no elimina documentos ni archivos.');
