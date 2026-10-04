// Un solo archivo para el editor de Edge Functions; sin secretos incorporados.
import { mkdir } from 'node:fs/promises';
import { rolldown } from 'rolldown';

await mkdir('tmp/deploy', { recursive: true });
const bundle = await rolldown({
  input: 'supabase/functions/render-documento/index.ts',
  external: id => id.startsWith('npm:'),
});
await bundle.write({ file: 'tmp/deploy/render-documento.ts', format: 'esm' });
await bundle.close();
console.log('Servicio compilado para despliegue: tmp/deploy/render-documento.ts');
