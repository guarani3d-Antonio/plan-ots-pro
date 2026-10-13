import { mkdir } from 'node:fs/promises';
import { rolldown } from 'rolldown';
await mkdir('tmp/deploy', { recursive: true });
const bundle = await rolldown({ input: 'supabase/functions/mi-asistente/index.ts', external: id => id.startsWith('npm:') });
await bundle.write({ file: 'tmp/deploy/mi-asistente.ts', format: 'esm' });
await bundle.close();
console.log('Servicio compilado para despliegue: tmp/deploy/mi-asistente.ts. No incluye claves.');
