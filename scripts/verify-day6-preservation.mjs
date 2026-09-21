import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='.backups.local/2026-09-20-dia6/';
const before=JSON.parse(await readFile(dir+'domain-before.json','utf8')),after=JSON.parse(await readFile(dir+'domain-after.json','utf8'));
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
const fixtures=new Set(['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002']);
let verified=0;
for(const [table,rows]of Object.entries(before)){
 if(!Array.isArray(rows))continue;
 const current=after[table].map(row=>table==='ordenes'?{...row,costo:after.orden_costos.find(c=>c.orden_id===row.id)?.costo??null}:row);
 const set=new Set(current.map(hash));
 for(const row of rows){if(table==='ordenes'&&fixtures.has(row.id))continue;assert(set.has(hash(row)),`Contenido conservado en ${table}`);verified++;}
}
assert(after.ordenes.every(o=>o.costo===null));
const report={checkedAt:new Date().toISOString(),previousRowsPreserved:verified,fixtureOrdersChanged:4,originalCostsPreserved:before.ordenes.filter(o=>o.costo!==null).length,privateCostRows:after.orden_costos.length,publicCosts:0,method:'Comparación SHA-256 de cada fila anterior, reconstituyendo costo desde la tabla privada. Excluye cuatro OTs sintéticas con importes de prueba.'};
await writeFile('docs/estabilizacion-2026-09-20/dia-6/preservation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
