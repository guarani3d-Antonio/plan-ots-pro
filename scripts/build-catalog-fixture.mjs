// Deriva DDL de la captura autorizada. No copia filas, usuarios ni secretos.
import {readFile,writeFile} from 'node:fs/promises';
const s=JSON.parse(await readFile('.backups.local/2026-09-20-dia2/schema-baseline.json','utf8'));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const bootstrap=(await readFile('supabase/tests/legacy-foundation.sql','utf8')).split('create table public.proyectos')[0];
const sql=[bootstrap,'-- Catálogo completo de dominio; tipos sin typmod. Auth sigue simulado.'];
for(const t of s.relations.filter(t=>t.relkind==='r')){
  const cols=s.columns.filter(c=>c.table_name===t.relname).sort((a,b)=>a.ordinal_position-b.ordinal_position);
  sql.push(`create table public.${q(t.relname)} (${cols.map(c=>`${q(c.column_name)} ${c.udt_name.startsWith('_')?c.udt_name.slice(1)+'[]':c.udt_name}${c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'?' not null':''}`).join(',\n')});`);
}
for(const c of [...s.constraints].sort((a,b)=>(a.contype==='f')-(b.contype==='f')))
  sql.push(`alter table public.${q(c.relname)} add constraint ${q(c.conname)} ${c.definition};`);
for(const f of s.functions) sql.push(f.definition+';');
for(const t of s.triggers) sql.push(t.definition+';');
for(const t of s.relations.filter(t=>t.relrowsecurity)) sql.push(`alter table public.${q(t.relname)} enable row level security;`);
for(const v of s.views) sql.push(`create view public.${q(v.relname)} with (security_invoker=true) as ${v.definition}`);
for(const p of s.policies.filter(p=>p.schemaname==='public')) sql.push(`create policy ${q(p.policyname)} on public.${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);
await writeFile('supabase/tests/captured-domain.sql',sql.join('\n')+'\n');
console.log('Fixture escrito: 12 tablas, 2 vistas, funciones, constraints, triggers y políticas capturados; sin datos.');
// La reversión restaura las definiciones capturadas, no una reescritura manual.
const rbPath='supabase/rollback/202609200002_multitenancy_enforcement.rollback.sql';
const rb=await readFile(rbPath,'utf8');
const start=rb.indexOf('create or replace function public.es_miembro');
const drops=rb.slice(rb.indexOf('drop function public.plan_puede_crear_proyecto'),rb.indexOf('create policy "Ver proyectos propios"'));
const restoredPolicies=sql.filter(x=>x.startsWith('create policy '));
const grants=rb.slice(rb.indexOf('grant all privileges on table public.proyectos'));
await writeFile(rbPath,rb.slice(0,start)+s.functions.map(f=>f.definition+';').join('\n')+
  '\ngrant execute on function public.es_miembro(uuid),public.es_supervisor(uuid),public.agregar_creador_como_supervisor(),public.fn_audit_orden_eliminada(),public.set_updated_at() to public,anon,authenticated;\n'+drops+restoredPolicies.join('\n')+'\n'+grants);
