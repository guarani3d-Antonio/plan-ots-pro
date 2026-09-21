// Revalidación de archivos privados usando solo clave pública y JWT ficticios.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url = 'https://iqgbyqyoovzvhhdjawnt.supabase.co';
const env = await readFile('.env.local', 'utf8');
const key = env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert(key);
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const clients = {}, results = [];
const projects = ['11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002'];
const tenants = ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'];
const orders = ['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002'];
const path = (i, bucket) => `${tenants[Math.floor(i / 2)]}/${projects[i]}/${bucket === 'fotos' ? `${orders[i]}/private-fixture.png` : 'private-fixture.svg'}`;
const ok = r => { if (r.error) throw Error(r.error.message); return r.data; };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = { planos: hash(await readFile('public/fixtures/plano-prueba.svg')), fotos: hash(await readFile('public/icon-192.png')) };
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: e.message.split('\n')[0] }); }
  console.log(`${results.at(-1).ok ? 'OK' : 'FAIL'} ${name}`);
}
try {
  for (const credential of credentials) {
    const client = createClient(url, key, options);
    ok(await client.auth.signInWithPassword({ email: credential.email, password: credential.password }));
    clients[credential.key] = client;
  }
  for (const credential of credentials) await check(`${credential.key}: planos/fotos según membresía`, async () => {
    const name = credential.key;
    const allowed = name === 'platform-creator' ? [0, 1, 2, 3] : /admin|supervisor/.test(name) ? (name.startsWith('e1') ? [0, 1] : [2, 3]) : [(name.startsWith('e1') ? 0 : 2) + (name.endsWith('tecnico-2') ? 1 : 0)];
    for (let i = 0; i < 4; i++) for (const bucket of ['planos', 'fotos']) {
      const response = await clients[name].storage.from(bucket).download(path(i, bucket));
      if (allowed.includes(i)) assert.equal(hash(Buffer.from(await ok(response).arrayBuffer())), expected[bucket]);
      else assert(response.error, 'Archivo ajeno descargable');
    }
  });
  await check('anónimo no descarga ni firma archivos privados', async () => {
    const anon = createClient(url, key, options);
    for (const bucket of ['planos', 'fotos']) {
      assert((await anon.storage.from(bucket).download(path(0, bucket))).error);
      assert((await anon.storage.from(bucket).createSignedUrl(path(0, bucket), 30)).error);
      const publicUrl = anon.storage.from(bucket).getPublicUrl(path(0, bucket)).data.publicUrl;
      assert(!(await fetch(publicUrl)).ok);
    }
  });
  await check('firma autorizada entrega foto exacta; otra empresa no firma', async () => {
    const signed = ok(await clients['e1-tecnico-1'].storage.from('fotos').createSignedUrl(path(0, 'fotos'), 30));
    const response = await fetch(signed.signedUrl);
    assert(response.ok);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), expected.fotos);
    assert((await clients['e2-supervisor'].storage.from('fotos').createSignedUrl(path(0, 'fotos'), 30)).error);
  });
} catch (e) { results.push({ name: 'preparación', ok: false, error: e.message.split('\n')[0] }); }
await mkdir('docs/estabilizacion-2026-09-20/dia-10', { recursive: true });
const report = { testedAt: new Date().toISOString(), scope: 'Lectura/firma Storage real con clave pública, once cuentas y hashes de ocho fixtures. Sin cambios en archivos.', passed: results.filter(r => r.ok).length, total: results.length, results };
await writeFile('docs/estabilizacion-2026-09-20/dia-10/storage-rest.json', JSON.stringify(report, null, 2) + '\n');
if (results.some(r => !r.ok)) process.exitCode = 1;
