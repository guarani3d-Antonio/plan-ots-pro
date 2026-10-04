// Ejecuta el handler real con fallos de transporte/Storage/RPC simulados.
// No usa credenciales, red ni modifica Supabase. RLS y render visual se prueban aparte.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as requestModule from '../supabase/functions/_shared/document-request.mjs';
import * as pdfOptions from '../supabase/functions/_shared/document-pdf-options.mjs';

const code = ts.transpileModule(await readFile('supabase/functions/render-documento/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const revisionId = '00000000-0000-4000-8000-000000000001';
const documentId = '00000000-0000-4000-8000-000000000002';
const solicitudId = '00000000-0000-4000-8000-000000000003';
const prefix = `tenant/project/documentos/${revisionId}`;
const pdf = Buffer.from('%PDF-1.7\n' + 'synthetic test bytes\n'.repeat(15));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pdfPath = `${prefix}/${hash(pdf)}.pdf`;
const ok = data => ({ data, error: null });
const failed = message => ({ data: null, error: { message } });

function fixture() {
  const s = { objects: new Map(), lock: null, renders: 0, readyCalls: 0,
    uploadFails: 0, registerFails: 0, renderFails: 0, corruptUpload: false, logs: [],
    candidate: { id: 'candidate', estado: 'preparando', revision_id: revisionId,
      documento_id: documentId, datos_sha256: 'data-hash', fuentes_sha256: 'source-hash' } };
  const tables = {
    plan_documento_revisiones: { id: revisionId, contenido_sha256: 'data-hash', revision: 0, datos: {} },
    plan_documento_fuentes: { fuentes_sha256: 'source-hash', fuentes: {
      documento: { id: documentId, orden_id: 'order', tenant_id: 'tenant', proyecto_id: 'project',
        codigo: 'POT-2026-VIS-00000001' }, orden: { id: 'order' }, fotos: [],
    } },
  };
  const user = {
    auth: { getUser: async token => { assert.equal(token, 'test-session'); return ok({ user: { id: 'reviewer' } }); } },
    rpc: async (name, args) => {
      assert.equal(name, 'plan_documento_preparar');
      assert.deepEqual({ ...args }, { p_revision: revisionId, p_solicitud: solicitudId });
      return ok({ ...s.candidate });
    },
  };
  const admin = {
    from: name => {
      assert.ok(Object.hasOwn(tables, name), `Unexpected table ${name}`);
      return { select: () => ({ eq: (column, value) => {
        assert.equal(column, name === 'plan_documento_revisiones' ? 'id' : 'revision_id');
        assert.equal(value, revisionId);
        return { single: async () => ok(tables[name]) };
      } }) };
    },
    rpc: async (name, args) => {
      assert.equal(args.p_candidato, s.candidate.id);
      if (name === 'plan_documento_render_reclamar') {
        if (s.lock) return ok(false);
        s.lock = args.p_token;
        return ok(true);
      }
      if (name === 'plan_documento_render_liberar') {
        if (s.lock === args.p_token) s.lock = null;
        return ok(true);
      }
      assert.equal(name, 'plan_documento_pdf_listo');
      assert.equal(args.p_token, s.lock);
      s.readyCalls++;
      if (s.registerFails-- > 0) return failed('simulated database interruption');
      const bytes = s.objects.get(args.p_path);
      assert.ok(bytes);
      assert.equal(args.p_sha256, hash(bytes));
      assert.equal(args.p_bytes, bytes.length);
      Object.assign(s.candidate, { estado: 'listo', pdf_path: args.p_path,
        pdf_sha256: args.p_sha256, pdf_bytes: args.p_bytes });
      return ok({ ...s.candidate });
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'exports');
      return {
        list: async directory => {
          assert.equal(directory, prefix);
          return ok([...s.objects.keys()].map(path => ({ name: path.slice(prefix.length + 1) })));
        },
        download: async path => s.objects.has(path) ? ok(new Blob([s.objects.get(path)])) : failed('missing object'),
        upload: async (path, blob, options) => {
          assert.equal(options.upsert, false);
          if (s.uploadFails-- > 0) return failed('simulated storage interruption');
          if (s.objects.has(path)) return failed('already exists');
          const bytes = Buffer.from(await blob.arrayBuffer());
          if (s.corruptUpload) bytes[bytes.length - 1] ^= 1;
          s.objects.set(path, bytes);
          return ok({ path });
        },
      };
    } },
  };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-public',
    SUPABASE_SERVICE_ROLE_KEY: 'test-server', CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_BROWSER_TOKEN: 'test-browser' };
  let handler;
  const context = vm.createContext({ exports: {}, Request, Response, Blob, Uint8Array,
    TextEncoder, TextDecoder, AbortSignal, btoa, crypto: webcrypto,
    console: { error: (...args) => s.logs.push(args) },
    Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback; } },
    require: spec => {
      if (spec === 'npm:@supabase/supabase-js@2.105.4') return { createClient: (url, key) => {
        assert.equal(url, env.SUPABASE_URL);
        assert.ok(key === 'test-public' || key === 'test-server');
        return key === 'test-public' ? user : admin;
      } };
      if (spec.endsWith('/document-request.mjs')) return requestModule;
      if (spec.endsWith('/document-pdf-options.mjs')) return pdfOptions;
      assert.ok(spec.endsWith('/controlled-report.mjs'));
      return { materializarHtmlControlado: () => '<html><body>Recovery test</body></html>' };
    },
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/test-account/browser-run/pdf');
      assert.equal(options.method, 'POST');
      s.renders++;
      return s.renderFails-- > 0 ? new Response('unavailable', { status: 503 }) : new Response(pdf);
    },
  });
  vm.runInContext(code, context, { filename: 'render-documento.ts' });
  s.run = () => handler(new Request('https://example.invalid/render-documento', {
    method: 'POST', headers: { origin: 'https://plan-ots-pro.pages.dev',
      authorization: 'Bearer test-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ revisionId, solicitudId }),
  }));
  return s;
}

const checks = [];
async function test(name, action) { await action(); checks.push(name); console.log(`OK ${name}`); }

await test('fallo antes de subir: no declara listo y permite reintento', async () => {
  const s = fixture(); s.uploadFails = 1;
  assert.equal((await s.run()).status, 503);
  assert.equal(s.objects.size, 0); assert.equal(s.readyCalls, 0); assert.equal(s.lock, null);
  assert.equal((await s.run()).status, 200);
  assert.equal(s.renders, 2); assert.equal(s.objects.size, 1);
});
await test('fallo despues de subir: recupera el objeto sin volver a renderizar', async () => {
  const s = fixture(); s.registerFails = 1;
  assert.equal((await s.run()).status, 503);
  assert.equal(s.candidate.estado, 'preparando'); assert.equal(s.lock, null);
  assert.equal(s.objects.size, 1);
  const recovered = await s.run(); assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).pdfSha256, hash(pdf));
  assert.equal(s.renders, 1); assert.equal(s.readyCalls, 2);
  assert.equal((await s.run()).status, 200); assert.equal(s.renders, 1);
});
await test('guardado corrupto: rechaza tambien el objeto previo en el reintento', async () => {
  const s = fixture(); s.corruptUpload = true;
  assert.equal((await s.run()).status, 503); assert.equal(s.readyCalls, 0);
  assert.equal((await s.run()).status, 503); assert.equal(s.renders, 1);
  assert.equal(s.candidate.estado, 'preparando'); assert.equal(s.lock, null);
});
await test('dos PDFs previos: requiere revision y no elige uno arbitrariamente', async () => {
  const s = fixture(); s.objects.set(pdfPath, pdf);
  const other = Buffer.concat([pdf, Buffer.from('different')]);
  s.objects.set(`${prefix}/${hash(other)}.pdf`, other);
  assert.equal((await s.run()).status, 503); assert.equal(s.renders, 0); assert.equal(s.readyCalls, 0);
});
await test('candidato listo alterado: deniega la descarga logica', async () => {
  const s = fixture(); assert.equal((await s.run()).status, 200);
  s.objects.set(pdfPath, Buffer.from('changed'));
  assert.equal((await s.run()).status, 503); assert.equal(s.renders, 1);
});
await test('otro render en curso: 202 sin liberar su bloqueo ni generar otro PDF', async () => {
  const s = fixture(); s.lock = 'other-worker';
  assert.equal((await s.run()).status, 202); assert.equal(s.lock, 'other-worker');
  assert.equal(s.renders, 0); assert.equal(s.readyCalls, 0);
});
await test('proveedor caido: libera bloqueo y permite recuperacion', async () => {
  const s = fixture(); s.renderFails = 1;
  assert.equal((await s.run()).status, 503); assert.equal(s.lock, null);
  assert.equal(s.objects.size, 0); assert.equal(s.readyCalls, 0);
  assert.equal((await s.run()).status, 200);
});
await mkdir('tmp/pdfs/live-flow', { recursive: true });
await writeFile('tmp/pdfs/live-flow/recovery-results.json', JSON.stringify({
  date: new Date().toISOString(), scope: 'local actual handler; injected transport failures', checks,
}, null, 2));
