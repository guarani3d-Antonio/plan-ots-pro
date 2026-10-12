import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rolldown} from 'rolldown';
import JSZip from 'jszip';

const target='output/claims-pilot-20261013';
await mkdir(target,{recursive:true});
const migration=await readFile('supabase/migrations/202610130001_claims_controlled_pilot.sql','utf8');
const sql=migration.replace(/^begin;\s*/i,"begin;\nset local lock_timeout='5s';\nset local statement_timeout='90s';\n").replace(/commit;\s*$/i,"insert into supabase_migrations.schema_migrations(version,name) values('202610130001','claims_controlled_pilot');\nnotify pgrst,'reload schema';\ncommit;\n");
await writeFile(`${target}/instalar-piloto.sql`,sql);
const bundle=await rolldown({input:'supabase/functions/portal-reclamos/index.ts',external:id=>id.startsWith('npm:')});
await bundle.write({file:`${target}/portal-reclamos.ts`,format:'esm',minify:false});
await bundle.close();
const edge=await readFile(`${target}/portal-reclamos.ts`,'utf8');
const zip=new JSZip();zip.file('index.ts',edge);
await writeFile(`${target}/portal-reclamos.zip`,await zip.generateAsync({type:'nodebuffer'}));
await writeFile(`${target}/release-preparation.json`,JSON.stringify({sqlSha256:createHash('sha256').update(sql).digest('hex'),edgeSha256:createHash('sha256').update(edge).digest('hex')},null,2));
console.log('Preparados SQL transaccional y función sin secretos. No ejecutados.');
