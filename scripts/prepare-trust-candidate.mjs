import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import JSZip from 'jszip';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const zip = new JSZip(), files = [];
async function add(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    assert(!/(?:^|\/)(?:\.env|\.git|\.backups)|day9-tablet-harness|test-credentials/i.test(path));
    if (entry.isDirectory()) await add(`${dir}/${entry.name}`, `${path}/`);
    else {
      const bytes = await readFile(`${dir}/${entry.name}`);
      zip.file(path, bytes);
      files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    }
  }
}
await add('dist');
const allJs = (await Promise.all(files.filter(f => /\.(js|html)$/.test(f.path)).map(f => readFile(`dist/${f.path}`, 'utf8')))).join('\n');
const env = await readFile('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_0-9]+)\s*=\s*["']?([^\r\n"']+)/);
  if (match && /ANTHROPIC|SERVICE_ROLE|SECRET|PASSWORD|PRIVATE/.test(match[1]) && match[2].length >= 20)
    assert(!allJs.includes(match[2]), `Secreto incorporado: ${match[1]}`);
}
assert(!/anthropic-dangerous-direct-browser-access|api\.anthropic\.com\/v1\/messages|sb_secret_[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}/.test(allJs));
for (const token of allJs.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(payload.role, 'anon', 'JWT privado en build');
}
assert.equal(await readFile('dist/_headers', 'utf8'), await readFile('public/_headers', 'utf8'));

// La activación de la PWA elimina solo cachés HTTP privadas heredadas.
let activation;
const deleted = [];
vm.runInNewContext(await readFile('dist/storage-cache-cleanup.js', 'utf8'), {
  self: { addEventListener: (event, fn) => { assert.equal(event, 'activate'); activation = fn; } },
  caches: { delete: async name => { deleted.push(name); return true; } },
});
let completed;
activation({ waitUntil: promise => { completed = promise; } });
await completed;
assert.deepEqual(deleted.sort(), ['supabase-api', 'supabase-storage']);
const sw = await readFile('dist/sw.js', 'utf8');
assert.match(sw, /NetworkOnly/);
assert.match(sw, /storage-cache-cleanup/);
assert(!sw.includes('day9-tablet-harness'));

await mkdir('.backups.local/2026-09-22-servidor', { recursive: true });
const artifact = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const artifactPath = '.backups.local/2026-09-22-servidor/plan-ots-candidate.zip';
await writeFile(artifactPath, artifact);
const reopened = await JSZip.loadAsync(await readFile(artifactPath));
for (const file of files) assert.equal(digest(await reopened.file(file.path).async('nodebuffer')), file.sha256);
const report = { preparedAt: new Date().toISOString(), artifactPath, artifactSha256: digest(artifact), artifactBytes: artifact.length, secretsScanPassed: true, zipReadbackVerified: true, legacyHttpCacheCleanupVerified: true, pwaRealDeviceUpdateVerified: false, deployed: false, files };
await mkdir('docs/bloqueos-2026-09-22', { recursive: true });
await writeFile('docs/bloqueos-2026-09-22/candidate.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Candidata verificada: ${files.length} archivos; ZIP ${artifact.length} bytes; sin secretos detectados.`);
