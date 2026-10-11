// Read-only inventory: emits counts and metadata, never credentials or domain rows.
import {writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL||'https://iqgbyqyoovzvhhdjawnt.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw new Error('Configurá SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor para medir el inventario. No se lee ninguna credencial antigua.');
const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const buckets=await api.storage.listBuckets();if(buckets.error)throw new Error('No se pudo leer Storage: '+buckets.error.message);
const result={capturedAt:new Date().toISOString(),project:new URL(url).hostname.split('.')[0],buckets:[],tables:[],objects:0,bytes:0};
async function list(bucket,prefix=''){
 const totals={objects:0,bytes:0,unknownSize:0};
 for(let offset=0;;offset+=100){const page=await api.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(page.error)throw new Error('No se pudo inventariar '+bucket);
  for(const obj of page.data){if(!obj.id){const nested=await list(bucket,prefix?prefix+'/'+obj.name:obj.name);for(const k of Object.keys(totals))totals[k]+=nested[k];}else{totals.objects++;const n=Number(obj.metadata?.size);if(Number.isFinite(n))totals.bytes+=n;else totals.unknownSize++;}}
  if(page.data.length<100)break;
 }return totals;
}
for(const b of buckets.data){const totals=await list(b.id);result.buckets.push({id:b.id,public:b.public,...totals});result.objects+=totals.objects;result.bytes+=totals.bytes;}
const response=await fetch(url+'/rest/v1/',{headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/openapi+json'}});if(!response.ok)throw new Error('No se pudo leer el catálogo REST');
const schema=await response.json();for(const [name,definition]of Object.entries(schema.definitions||{})){const fields=Object.entries(definition.properties||{}).map(([name,p])=>({name,type:p.type,format:p.format,description:p.description}));result.tables.push({name,fields});}
await mkdir('output/backup-implementation',{recursive:true});await writeFile('output/backup-implementation/live-inventory.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({project:result.project,objects:result.objects,bytes:result.bytes,buckets:result.buckets,tables:result.tables.length}));
