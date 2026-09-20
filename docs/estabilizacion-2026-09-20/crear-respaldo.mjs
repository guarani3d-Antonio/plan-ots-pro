// Copia local privada del checkout y verifica cada entrada sin sobrescribir originales.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import JSZip from 'jszip';
const root=process.cwd();
const dest=path.join(root,'.backups.local','2026-09-20-pre-estabilizacion');
fs.mkdirSync(dest,{recursive:true});
const names=[...new Set(execFileSync('git',['ls-files','-z','-c','-o','--exclude-standard'],{encoding:'utf8'}).split('\0').filter(Boolean))];
for(const name of ['.env','.env.local'])if(fs.existsSync(name)&&!names.includes(name))names.push(name);
const zip=new JSZip(),manifest=[];
for(const name of names){
 const absolute=path.resolve(root,name);
 if(!absolute.startsWith(root+path.sep)||fs.lstatSync(absolute).isSymbolicLink())throw new Error('Ruta no admitida: '+name);
 const bytes=fs.readFileSync(absolute);
 zip.file(name,bytes);
 manifest.push({file:name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const archive=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const archivePath=path.join(dest,'checkout.zip');
fs.writeFileSync(archivePath,archive,{flag:'wx'});
const restored=await JSZip.loadAsync(fs.readFileSync(archivePath));
for(const item of manifest){
 const bytes=await restored.file(item.file).async('nodebuffer');
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Verificacion fallida: '+item.file);
}
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({head,files:manifest},null,2),{flag:'wx'});
execFileSync('git',['bundle','create',path.join(dest,'repository.bundle'),'--all'],{stdio:'pipe'});
execFileSync('git',['bundle','verify',path.join(dest,'repository.bundle')],{stdio:'pipe'});
const result={head,filesVerified:manifest.length,zipSha256:crypto.createHash('sha256').update(archive).digest('hex'),directory:dest,scope:'Codigo, documentacion y entorno local; NO contiene base de datos ni objetos remotos. Archivo privado, no publicar.',verified:true};
fs.writeFileSync(path.join(root,'docs/estabilizacion-2026-09-20/respaldo-local.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
