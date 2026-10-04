import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile('src/services/verifiedPdfDownload.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {descargarPdfVerificado}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const bytes=new TextEncoder().encode('%PDF-1.7\n'+'x'.repeat(150));
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const original=globalThis.fetch;
try {
  globalThis.fetch=async()=>new Response(bytes);
  assert.equal((await descargarPdfVerificado('https://fixture.invalid',bytes.length,hash)).size,bytes.length);
  await assert.rejects(descargarPdfVerificado('https://fixture.invalid',bytes.length,'a'.repeat(64)),/no coincide/);
  await assert.rejects(descargarPdfVerificado('https://fixture.invalid',bytes.length+1,hash),/no coincide/);
  let cancelled=false;
  globalThis.fetch=async()=>new Response(new ReadableStream({pull(c){c.enqueue(bytes);},cancel(){cancelled=true;}}));
  await assert.rejects(descargarPdfVerificado('https://fixture.invalid',100,hash),/supera/);assert(cancelled);
  globalThis.fetch=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  await assert.rejects(descargarPdfVerificado('https://fixture.invalid',bytes.length,hash,10),/tardó demasiado/);
  await assert.rejects(descargarPdfVerificado('https://fixture.invalid',null,hash),/no son válidos/);
  console.log('PDF privado: hash, truncado, exceso cancelado, timeout y metadatos invalidos OK');
} finally {globalThis.fetch=original;}
