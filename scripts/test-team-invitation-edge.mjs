import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile('supabase/functions/invitar-usuario/index.ts','utf8');
const code=ts.transpileModule(source.replace(/^import .*;\s*/,'') ,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const uuid='00000000-0000-4000-8000-000000000001';
const payload={equipo:true,tenantId:uuid,superiorId:uuid,perfil:'tecnico',rol:'tecnico',obras:[uuid],email:'qa@example.test',nombre:'QA'};
async function run(options={}){
 let handler;const calls=[];
 const createClient=(_url,key)=>({auth:{getUser:async()=>({data:{user:{id:uuid}}}),admin:{inviteUserByEmail:async()=>{calls.push('send');return options.sendFail?{error:{message:'Mail unavailable'},data:{}}:{data:{user:{id:uuid}}}}}},rpc:async(name)=>{
  calls.push(name);
  if(name==='plan_es_creador')return {data:!!options.creator};
  if(name==='plan_equipo_reservar')return options.deny?{error:{message:'Sin cupo'}}:{data:uuid};
  if(name==='plan_equipo_confirmar'){assert.equal(key,'service-test');return options.confirmFail?{error:{message:'Revoked'}}:{data:null}}
  if(name==='plan_equipo_cancelar')return {data:null};
  throw new Error('Unexpected RPC '+name);
 }});
 vm.runInNewContext(code,{createClient,Response,Set,Deno:{serve:h=>{handler=h},env:{get:n=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'})[n]}}});
 const response=await handler(new Request('https://example.invalid/invite',{method:'POST',headers:{origin:'https://plan-ots-pro.pages.dev',authorization:'Bearer test-only','content-type':'application/json'},body:JSON.stringify(options.legacy?{...payload,equipo:false}:payload)}));
 return {status:response.status,body:await response.json(),calls};
}
let result=await run({legacy:true});assert.equal(result.status,403);assert(!result.calls.includes('send'));
result=await run({deny:true});assert.equal(result.status,403);assert(!result.calls.includes('send'));
result=await run({sendFail:true});assert.equal(result.status,400);assert(result.calls.includes('plan_equipo_cancelar'));assert(!result.calls.includes('plan_equipo_confirmar'));
result=await run({confirmFail:true});assert.equal(result.status,409);assert.match(result.body.error,/no recibió acceso/);
result=await run();assert.equal(result.status,200);assert.equal(result.body.invited,true);assert(result.calls.indexOf('plan_equipo_reservar')<result.calls.indexOf('send'));assert(result.calls.indexOf('send')<result.calls.indexOf('plan_equipo_confirmar'));
console.log('Invitation edge: unauthorized legacy path, quota refusal, failure cancellation and confirm-after-send passed. No emails sent.');
