// Compara exclusivamente filas previas al lote. Solo reporta conteos y resultado.
import {isDeepStrictEqual} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
const dir='.backups.local/2026-09-20-dia4/';
const backup=JSON.parse(await readFile(dir+'domain-data.json','utf8'));
const client=createClient('https://iqgbyqyoovzvhhdjawnt.supabase.co',(await readFile(dir+'admin-key.local','utf8')).trim(),{auth:{persistSession:false,autoRefreshToken:false}});
const results=[];
const exact={...backup,captured_at:new Date().toISOString(),capture_method:'REST: filas legadas identificadas por backup previo'};
const normalize=v=>typeof v==='string'?v.replace(/ {2,}/g,' '):Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):v;
for(const [table,rows] of Object.entries(backup).filter(([,v])=>Array.isArray(v)&&v.length)){
  const key=r=>table==='proyecto_miembros'?r.proyecto_id+':'+r.user_id:r.id;
  const {data,error}=await client.from(table).select('*');if(error)throw new Error(error.code);
  const byKey=new Map(data.map(r=>[key(r),r]));
  let whitespaceDifferences=0;
  for(const row of rows){
    const actual=byKey.get(key(row));
    if(!isDeepStrictEqual(actual,row)){
      if(!isDeepStrictEqual(normalize(actual),normalize(row)))throw new Error(`Diferencia de contenido en ${table}; no se muestran valores privados`);
      whitespaceDifferences++;
    }
  }
  exact[table]=rows.map(r=>byKey.get(key(r)));
  results.push({table,preservedRows:rows.length,rowsWithAXWhitespaceNormalization:whitespaceDifferences});
}
await writeFile(dir+'domain-data-rest.json',JSON.stringify(exact,null,2)+'\n');
const report={verifiedAt:new Date().toISOString(),contentMatchesPreMigrationCapture:true,limitation:'AX normaliza espacios repetidos. Se conserva captura original y respaldo REST exacto de las mismas filas; no se afirma igualdad byte a byte con la captura AX.',results};
await writeFile('docs/estabilizacion-2026-09-20/dia-4/legacy-preservation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
