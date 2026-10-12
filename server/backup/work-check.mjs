import {createClient} from '@supabase/supabase-js';
import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const hour=3600000;
// A scheduled pilot is opt-in and bounded. Missing/expired limits never touch
// user data, renew the engine signal or start the PostgreSQL/Docker laboratory.
export function pilotWindow(env,now=Date.now()) {
 if(env.BACKUP_TRIGGER!=='schedule')return null;
 const start=Date.parse(env.BACKUP_AUTOMATIC_STARTED_AT||'');
 const end=Date.parse(env.BACKUP_AUTOMATIC_UNTIL||'');
 const max=Number(env.BACKUP_AUTOMATIC_MAX_COPIES);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>72*hour||!Number.isInteger(max)||max<1||max>3)return {blocked:'limites_pendientes'};
 if(now<start)return {blocked:'piloto_no_iniciado'};
 if(now>=end)return {blocked:'piloto_finalizado'};
 return {start:new Date(start).toISOString(),end:new Date(end).toISOString(),max};
}

export async function checkWorkDemand(port,env,now=Date.now()) {
 let pilot=pilotWindow(env,now);
 if(pilot?.blocked)return {needsWork:false,reason:pilot.blocked};
 const config=await port.readConfig();
 if(!pilot && config.activo===true) {
  pilot=pilotWindow({...env,BACKUP_TRIGGER:'schedule'},now);
  if(pilot?.blocked)return {needsWork:false,reason:pilot.blocked};
 }
 if(pilot) {
  if(config.activo!==true)return {needsWork:false,reason:'programacion_apagada'};
  const count=await port.countPilotRequests(pilot.start);
  if(!Number.isInteger(count)||count<0)throw new Error('No se pudo comprobar el límite de copias.');
  if(count>=pilot.max)return {needsWork:false,reason:'limite_de_copias'};
 }
 await port.probeDestination();
 const queue=await port.readQueue(new Date(now).toISOString());
 await port.heartbeat();
 if(queue.active)return {needsWork:false,reason:'otro_trabajo_activo'};
 const due=pilot && config.activo===true && config.destino==='r2_verificado' && Number.isFinite(Date.parse(config.siguiente_en)) && Date.parse(config.siguiente_en)<=now;
 return {needsWork:queue.pending||Boolean(due),reason:queue.pending?'cola_pendiente':due?'copia_programada':'sin_trabajo'};
}

async function main() {
 const env=process.env;
 const early=pilotWindow(env);
 if(early?.blocked)return publish({needsWork:false,reason:early.blocked});
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
 if(names.some(name=>!env[name]))throw new Error('Configuración de comprobación incompleta.');
 for(const name of ['SUPABASE_URL','R2_ENDPOINT'])if(new URL(env[name]).protocol!=='https:')throw new Error('Las conexiones requieren HTTPS.');
 const api=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const r2=new S3Client({region:'auto',endpoint:env.R2_ENDPOINT,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},maxAttempts:2});
 const ok=r=>{if(r.error)throw new Error('La comprobación de respaldo no pudo consultar el servidor.');return r.data;};
 const count=r=>{ok(r);if(!Number.isInteger(r.count))throw new Error('El servidor no informó el conteo.');return r.count;};
 try {
  return await publish(await checkWorkDemand({
   readConfig:async()=>ok(await api.from('plan_respaldo_config').select('activo,destino,siguiente_en').eq('id',true).single()),
   countPilotRequests:async start=>count(await api.from('plan_respaldos').select('id',{count:'exact',head:true}).is('solicitado_por',null).is('tenant_id',null).gte('creado_en',start)),
   probeDestination:()=>r2.send(new HeadBucketCommand({Bucket:env.R2_BUCKET})),
   readQueue:async stamp=>{
    const [active,pending]=await Promise.all([
     api.from('plan_respaldos').select('id',{count:'exact',head:true}).eq('estado','procesando').gte('lease_hasta',stamp),
     api.from('plan_respaldos').select('id',{count:'exact',head:true}).or(`estado.eq.pendiente,and(estado.eq.procesando,lease_hasta.lt.${stamp})`),
    ]);
    return {active:count(active)>0,pending:count(pending)>0};
   },
   heartbeat:async()=>ok(await api.rpc('plan_respaldo_latido')),
  },env));
 } finally {r2.destroy();}
}
async function publish(result) {
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`needs_work=${result.needsWork?'true':'false'}\n`);
 console.log(`Comprobación ligera: ${result.reason}. Laboratorio: ${result.needsWork?'necesario':'omitido'}.`);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Respaldo\nEstado: ${result.reason}. ${result.needsWork?'Hay trabajo; continúa el ensayo.':'No se exportan datos ni se prepara el laboratorio.'}\n`);
 return result;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(()=>{console.error('Falló la comprobación ligera; no se inicia el laboratorio. Revisá configuración, límites y conexión.');process.exitCode=1;});
