// Reejecuta suites existentes sin sobrescribir su evidencia histórica.
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const root = 'docs/estabilizacion-2026-09-20';
const runtime = 'C:/dev/fio-pro/dist/nc-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const remote = process.argv.includes('--remote');
const suites = remote ? [
  ['test-day6-rest', 'dia-6/rest-tests.json'],
  ['test-day7-rest', 'dia-7/rest-tests.json'],
  ['test-day8-rest', 'dia-8/rest-tests.json'],
  ['test-day9-rest', 'dia-9/rest-tests.json'],
] : [
  ['test-private-storage-sql', 'dia-5/storage-sql-tests.json', runtime],
  ['test-day6-sql', 'dia-6/sql-tests.json', runtime],
  ['test-day7-sql', 'dia-7/sql-tests.json', runtime],
  ['test-day8-sql', 'dia-8/sql-tests.json', runtime],
  ['test-storage-client', 'dia-5/storage-client-tests.json'],
  ['test-day6-client', 'dia-6/client-tests.json'],
  ['test-day7-client', 'dia-7/client-tests.json'],
  ['test-day8-client', 'dia-8/client-tests.json'],
  ['test-day9-client', 'dia-9/client-tests.json'],
  ['test-day5-recovery', 'dia-5/recovery-test.json', runtime],
  ['test-day6-recovery', 'dia-6/recovery-test.json', runtime],
];
await mkdir(`${root}/dia-10`, { recursive: true });
await mkdir('.backups.local/2026-09-21-dia10/logs', { recursive: true });
const results = [];
for (const [name, report, ...args] of suites) {
  const original = await readFile(`${root}/${report}`);
  const previousWrite = (await stat(`${root}/${report}`)).mtimeMs;
  let result;
  try {
    result = spawnSync(process.execPath, [`scripts/${name}.mjs`, ...args], { encoding: 'utf8', timeout: 240000 });
    await writeFile(`.backups.local/2026-09-21-dia10/logs/${name}.log`, `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    const fresh = await readFile(`${root}/${report}`);
    const changed = (await stat(`${root}/${report}`)).mtimeMs > previousWrite;
    const evidence = changed ? JSON.parse(fresh) : null;
    if (changed) await copyFile(`${root}/${report}`, `${root}/dia-10/${name}.json`);
    const ok = result.status === 0 && changed && (!evidence.total || evidence.passed === evidence.total);
    results.push({ name, ok, exitCode: result.status, passed: evidence?.passed, total: evidence?.total });
    console.log(`${ok ? 'OK' : 'FAIL'} ${name}${evidence?.total ? ` ${evidence.passed}/${evidence.total}` : ''}`);
  } finally {
    await writeFile(`${root}/${report}`, original);
  }
  // Detener ante un fallo evita ejecutar más mutaciones sobre un estado incierto.
  if (!results.at(-1)?.ok) break;
}
const report = { testedAt: new Date().toISOString(), remote, planned: suites.length, completed: results.length, allPassed: results.length === suites.length && results.every(r => r.ok), results };
await writeFile(`${root}/dia-10/${remote ? 'remote' : 'local'}-regression.json`, JSON.stringify(report, null, 2) + '\n');
if (!report.allPassed) process.exitCode = 1;
