import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkWorkDemand,pilotWindow} from '../server/backup/work-check.mjs';
const now=Date.parse('2026-10-13T12:00:00Z');
const schedule={BACKUP_TRIGGER:'schedule',BACKUP_AUTOMATIC_STARTED_AT:'2026-10-12T12:00:00Z',BACKUP_AUTOMATIC_UNTIL:'2026-10-15T12:00:00Z',BACKUP_AUTOMATIC_MAX_COPIES:'3'};
function fixture({active=false,pending=false,count=0,enabled=true,due=true}={}) {
 const calls=[];
 return {calls,port:{
  readConfig:async()=>{calls.push('config');return {activo:enabled,destino:'r2_verificado',siguiente_en:due?'2026-10-13T11:59:00Z':'2026-10-14T12:00:00Z'};},
  countPilotRequests:async start=>{assert.equal(Date.parse(start),Date.parse(schedule.BACKUP_AUTOMATIC_STARTED_AT));calls.push('count');return count;},
  probeDestination:async()=>calls.push('r2-head'),
  readQueue:async()=>{calls.push('queue');return {active,pending};},
  heartbeat:async()=>calls.push('heartbeat'),
 }};
}
for(const env of [
 {BACKUP_TRIGGER:'schedule'},
 {...schedule,BACKUP_AUTOMATIC_MAX_COPIES:'4'},
 {...schedule,BACKUP_AUTOMATIC_MAX_COPIES:'-1'},
 {...schedule,BACKUP_AUTOMATIC_UNTIL:'2026-10-19T12:00:00Z'},
 {...schedule,BACKUP_AUTOMATIC_UNTIL:'2026-10-13T12:00:00Z'},
 {...schedule,BACKUP_AUTOMATIC_STARTED_AT:'2026-10-14T12:00:00Z'},
]) {
 const f=fixture();assert.equal((await checkWorkDemand(f.port,env,now)).needsWork,false);assert.deepEqual(f.calls,[]);
}
for(const options of [{count:3},{count:8},{enabled:false}]) {
 const f=fixture(options);assert.equal((await checkWorkDemand(f.port,schedule,now)).needsWork,false);assert(!f.calls.includes('r2-head'));assert(!f.calls.includes('heartbeat'));
}
const idle=fixture({due:false});assert.deepEqual(await checkWorkDemand(idle.port,schedule,now),{needsWork:false,reason:'sin_trabajo'});assert.deepEqual(idle.calls,['config','count','r2-head','queue','heartbeat']);
const busy=fixture({active:true,pending:true});assert.equal((await checkWorkDemand(busy.port,schedule,now)).reason,'otro_trabajo_activo');
const due=fixture({count:2});assert.deepEqual(await checkWorkDemand(due.port,schedule,now),{needsWork:true,reason:'copia_programada'});
const manual=fixture({enabled:false,pending:true});assert.deepEqual(await checkWorkDemand(manual.port,{BACKUP_TRIGGER:'workflow_dispatch'},now),{needsWork:true,reason:'cola_pendiente'});assert(!manual.calls.includes('count'));
const manualWhileAutomatic=fixture({pending:true});assert.equal((await checkWorkDemand(manualWhileAutomatic.port,{BACKUP_TRIGGER:'workflow_dispatch'},now)).reason,'limites_pendientes');assert(!manualWhileAutomatic.calls.includes('heartbeat'));
assert.equal(pilotWindow({BACKUP_TRIGGER:'workflow_dispatch'},now),null);
await assert.rejects(checkWorkDemand({...fixture().port,probeDestination:async()=>{throw Error('sin conexión');}},schedule,now));
const invalidCount=fixture({count:null});await assert.rejects(checkWorkDemand(invalidCount.port,schedule,now));assert(!invalidCount.calls.includes('heartbeat'));
const workflow=await readFile('.github/workflows/respaldo-operativo.yml','utf8');
for(const step of ['Preparar cliente PostgreSQL 17 oficial en el ejecutor temporal','Comprobar laboratorio','Preparar laboratorio oficial fijado','Comprobar recuperación antes de transferir datos reales','Procesar una tarea y comprobar recuperación']) {
 const section=workflow.split(`- name: ${step}`).at(-1).split('\n      - ')[0];
 // The separate secret-free synthetic job remains explicitly requested. Every
 // heavy operation in the real backup job must be gated by the demand result.
 assert(section.includes("steps.demanda.outputs.needs_work == 'true'"),step);
}
console.log('Comprobación ligera aprobada: límites, fecha de fin, cola, señal, fallos y laboratorio omitido sin trabajo. Sin conexiones reales.');
