// Herramienta acotada al proyecto autorizado. Nunca imprime credenciales ni datos.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export const dir='.backups.local/2026-09-20-dia5/';
export const url='https://iqgbyqyoovzvhhdjawnt.supabase.co';
export async function adminClient(){return createClient(url,(await readFile(dir+'admin-key.local','utf8')).trim(),{auth:{persistSession:false,autoRefreshToken:false}});}
export function ok(r){if(r.error)throw new Error(`${r.error.code??r.error.status}: ${r.error.message}`);return r.data;}
if(process.argv[2]==='backup'){
  const admin=await adminClient();await mkdir(dir+'objects',{recursive:true});
  const buckets=ok(await admin.storage.listBuckets()).filter(b=>['planos','fotos','exports'].includes(b.id));
  await writeFile(dir+'buckets-before.json',JSON.stringify(buckets,null,2));
  const tables=['proyectos','proyecto_miembros','ordenes','fotos','campos_definicion','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs','tenants','tenant_miembros','plataforma_administradores'];
  const rows={};for(const table of tables){rows[table]=[];for(let offset=0;;offset+=500){const page=ok(await admin.from(table).select('*').range(offset,offset+499));rows[table].push(...page);if(page.length<500)break;}}
  await writeFile(dir+'domain-before.json',JSON.stringify(rows,null,2));
  const objects=[];
  async function list(bucket,prefix=''){
    for(let offset=0;;offset+=100){const entries=ok(await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}}));
      for(const obj of entries){const name=prefix?prefix+'/'+obj.name:obj.name;if(!obj.id)await list(bucket,name);else objects.push({bucket,name,...obj,namePath:name});}
      if(entries.length<100)break;
    }
  }
  for(const b of buckets)await list(b.id);
  await writeFile(dir+'objects-before.json',JSON.stringify(objects,null,2));
  let bytes=0;
  for(const o of objects){
    const blob=ok(await admin.storage.from(o.bucket).download(o.namePath));const content=Buffer.from(await blob.arrayBuffer());
    o.sha256=createHash('sha256').update(content).digest('hex');o.backupFile=o.sha256+'.bin';o.bytes=content.length;
    await writeFile(dir+'objects/'+o.backupFile,content);bytes+=content.length;
  }
  await writeFile(dir+'objects-before.json',JSON.stringify(objects,null,2));
  console.log(JSON.stringify({buckets:buckets.map(b=>({id:b.id,public:b.public})),objects:objects.length,bytes,rows:Object.fromEntries(tables.map(t=>[t,rows[t].length]))},null,2));
}
if(process.argv[2]==='private'){
  const admin=await adminClient();
  for(const bucket of ['planos','fotos','exports']){ok(await admin.storage.updateBucket(bucket,{public:false}));console.log(bucket+': privado');}
}
if(process.argv[2]==='verify-preservation'){
  const admin=await adminClient();const before=JSON.parse(await readFile(dir+'domain-before.json','utf8'));
  const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
  const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
  const fixtures=new Set(['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002']);
  let unchangedRows=0;for(const [table,rows] of Object.entries(before)){
    const current=[];for(let start=0;;start+=500){const page=ok(await admin.from(table).select('*').range(start,start+499));current.push(...page);if(page.length<500)break;}
    const set=new Set(current.map(hash));for(const row of rows){if(table==='proyectos'&&fixtures.has(row.id))continue;assert(set.has(hash(row)),`Fila previa conservada: ${table}`);unchangedRows++;}
  }
  const old=JSON.parse(await readFile(dir+'objects-before.json','utf8')),current=[];
  async function list(bucket,prefix=''){for(let offset=0;;offset+=100){const page=ok(await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}}));for(const o of page){const path=prefix?prefix+'/'+o.name:o.name;if(!o.id)await list(bucket,path);else current.push({...o,bucket,path});}if(page.length<100)break;}}
  for(const b of ['planos','fotos','exports'])await list(b);
  for(const o of old){const match=current.find(x=>x.bucket===o.bucket&&x.path===o.namePath);assert(match,'Objeto anterior presente');assert.equal(match.id,o.id);assert.equal(match.metadata?.size,o.metadata?.size);assert.equal(match.metadata?.eTag,o.metadata?.eTag);}
  const report={checkedAt:new Date().toISOString(),previousRowsUnchanged:unchangedRows,modifiedFixtureProjects:4,previousObjectsPreserved:old.length,totalObjects:current.length,method:'Filas comparadas por SHA-256 de JSON canónico; objetos por ruta, ID, tamaño y eTag. No vuelve a descargar los 180 binarios.'};
  await writeFile('docs/estabilizacion-2026-09-20/dia-5/preservation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
