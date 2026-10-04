import { mkdir } from 'node:fs/promises';
import { rolldown } from 'rolldown';

const output = 'supabase/functions/_shared/controlled-report.mjs';
await mkdir('supabase/functions/_shared', { recursive: true });
const bundle = await rolldown({ input: 'src/services/controlledReportService.ts' });
await bundle.write({ file: output, format: 'esm' });
await bundle.close();
console.log(`Generador documental servidor: ${output}`);
