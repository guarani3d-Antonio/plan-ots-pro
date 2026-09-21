import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=(await readFile('src/services/storageService.ts','utf8')).replace('import.meta.env.VITE_SUPABASE_URL',JSON.stringify('https://iqgbyqyoovzvhhdjawnt.supabase.co'));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};const calls=[];let userId='A',switchAfterSign=false,signError=false;
const supabase={
  auth:{getSession:async()=>({data:{session:userId?{user:{id:userId}}:null}})},
  storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{calls.push({bucket,path,ttl});if(switchAfterSign)userId='B';return signError?{error:{message:'denied'}}:{data:{signedUrl:'https://signed.example/test'}};}})},
};
vm.runInNewContext(compiled,{module,exports:module.exports,URL,Set,require:()=>({supabase})});
const api=module.exports;const results=[];
async function check(name,fn){calls.length=0;userId='A';switchAfterSign=false;signError=false;try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}}
await check('referencia durable no incluye credenciales',async()=>assert.equal(api.referenciaArchivo('fotos','a/b/c.jpg'),'storage://fotos/a/b/c.jpg'));
await check('URL pública antigua se autoriza nuevamente',async()=>{await api.resolverArchivo('https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/public/planos/old%20plan.pdf');assert.deepEqual(calls,[{bucket:'planos',path:'old plan.pdf',ttl:300}]);});
await check('URL firmada vencida se vuelve a autorizar, sin reutilizar token',async()=>{await api.resolverArchivo('https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/sign/fotos/a.jpg?token=expired');assert.equal(calls[0].path,'a.jpg');});
await check('sin sesión no se firma',async()=>{userId=null;await assert.rejects(()=>api.resolverArchivo('storage://fotos/a.jpg'));assert.equal(calls.length,0);});
await check('error RLS no cae a una URL pública',async()=>{signError=true;await assert.rejects(()=>api.resolverArchivo('storage://fotos/a.jpg'));});
await check('respuesta tardía de otra sesión se rechaza',async()=>{switchAfterSign=true;await assert.rejects(()=>api.resolverArchivo('storage://fotos/a.jpg'),/sesión cambió/);});
await check('dominios ajenos y protocolo javascript se rechazan sin solicitudes',async()=>{for(const ref of ['https://evil.example/a.jpg','javascript:alert(1)'])await assert.rejects(()=>api.resolverArchivo(ref));assert.equal(calls.length,0);});
await check('no hay caché de firmas entre resoluciones',async()=>{await api.resolverArchivo('storage://fotos/a.jpg');userId='B';await api.resolverArchivo('storage://fotos/a.jpg');assert.equal(calls.length,2);});
await check('referencias con traversal o bucket ajeno se rechazan',async()=>{for(const ref of ['storage://fotos/../secret','storage://other/a.jpg'])await assert.rejects(()=>api.resolverArchivo(ref));});
await check('cache cleanup elimina solo las dos cachés heredadas',async()=>{
  let handler,promise;const deleted=[];
  vm.runInNewContext(await readFile('public/storage-cache-cleanup.js','utf8'),{self:{addEventListener:(_,h)=>handler=h},caches:{delete:async name=>deleted.push(name)},Promise});
  handler({waitUntil:p=>promise=p});await promise;assert.deepEqual(deleted,['supabase-storage','supabase-api']);
});
await mkdir('docs/estabilizacion-2026-09-20/dia-5',{recursive:true});const report={scope:'Código TS real de acceso Storage y limpieza de caché; adaptador Supabase simulado.',passed:results.filter(r=>r.ok).length,total:results.length,results};
await writeFile('docs/estabilizacion-2026-09-20/dia-5/storage-client-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
