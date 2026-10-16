// Un solo archivo para el editor de Edge Functions; sin secretos incorporados.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { rolldown } from 'rolldown';
const output=process.argv[2]??'tmp/deploy/render-documento.ts';
await mkdir(dirname(output), { recursive: true });
const bundle = await rolldown({input:'supabase/functions/render-documento/index.ts',external:id=>id.startsWith('npm:')});
await bundle.write({file:output,format:'esm'});await bundle.close();
console.log(`Servicio compilado para despliegue: ${output}`);
