// Valida únicamente integridad de archivos y coherencia de la entrega documental.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(), dir=path.join(root,'docs/auditoria-2026-09-20');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const inventory=JSON.parse(read('evidencias/inventario.json'));
const changed=inventory.filter(item=>{
 const file=path.join(root,item.file);
 return !fs.existsSync(file)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==item.sha256;
}).map(item=>item.file);
const report=read('INFORME.md'), backlog=read('BACKLOG.md');
const sections=[...report.matchAll(/^## (\d+)\. /gm)].map(m=>Number(m[1]));
const tasks=[...backlog.matchAll(/^### (B\d{3}) — ([^\n]+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)];
const ids=tasks.map(m=>m[1]);
const missingFields=[];
const fields=['Prioridad / área','Descripción','Motivo','Archivos/componentes','Dependencias','Aceptación','Riesgo / dificultad / esfuerzo'];
for(const task of tasks) for(const field of fields) if(!task[3].includes('**'+field+':**'))missingFields.push({id:task[1],field});
const unknownTaskRefs=[...new Set([...report.matchAll(/\bB\d{3}\b/g)].map(m=>m[0]).filter(id=>!ids.includes(id)))];
const missingLinks=[];
for(const name of ['INFORME.md','BACKLOG.md','VERIFICACION.md']) for(const match of read(name).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
 const target=match[1]; if(/^(https?:|#)/.test(target))continue;
 if(!fs.existsSync(path.resolve(dir,target.split('#')[0])))missingLinks.push({file:name,target});
}
const result={scope:'Integridad de archivos originales y documentos; no valida servidor ni producto.',
 originalFilesChecked:inventory.length,originalFilesChanged:changed,
 reportSections:sections,sectionsComplete:sections.length===20&&sections.every((n,i)=>n===i+1),
 backlogTasks:ids.length,tasksComplete:ids.length===43&&new Set(ids).size===43,
 missingFields,unknownTaskRefs,missingLinks};
result.ok=changed.length===0&&result.sectionsComplete&&result.tasksComplete&&missingFields.length===0&&unknownTaskRefs.length===0&&missingLinks.length===0;
fs.writeFileSync(path.join(dir,'evidencias/validacion-entrega.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=1;
