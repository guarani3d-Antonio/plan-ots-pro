import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const migrations=['202610090001_hierarchical_permissions','202610090002_permission_enforcement','202610090003_team_invitations','202610090004_delegated_directories','202610090005_permission_coverage'];
const bodies=await Promise.all(migrations.map(async name=>`-- ${name}\n`+(await readFile(`supabase/migrations/${name}.sql`,'utf8')).replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'')));
const sql=`-- Plan-OTs: jerarquias y permisos. Aplicacion atomica, sin altas de usuarios ni correos.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='90s';\ndo $$ begin if exists(select 1 from supabase_migrations.schema_migrations where version in (${migrations.map(m=>`'${m.split('_')[0]}'`).join(',')})) then raise exception 'La migracion ya existe. Revisar el historial antes de reintentar.';end if;end $$;\n${bodies.join('\n')}\ninsert into supabase_migrations.schema_migrations(version,name) values\n${migrations.map(m=>`('${m.split('_')[0]}','${m.slice(13)}')`).join(',\n')};\ncommit;\n`;
await mkdir('output/hierarchy-release',{recursive:true});
await writeFile('output/hierarchy-release/jerarquias-permisos.sql',sql);
console.log(`SQL prepared, not executed. SHA256 ${createHash('sha256').update(sql).digest('hex')}`);
