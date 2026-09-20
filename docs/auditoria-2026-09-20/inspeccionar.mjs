import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(), out=path.join(root,'docs/auditoria-2026-09-20/evidencias');
const skip=new Set(['node_modules','.git','dist','.claude','.agents','auditoria-2026-09-20','.audit-build-2026-09-20']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>skip.has(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(root), code=files.filter(f=>/\.(tsx?|m?js)$/.test(f));
const rel=f=>path.relative(root,f).replaceAll('\\','/');
const inventory=files.map(f=>({file:rel(f),bytes:fs.statSync(f).size,category:/\.bak|backup|patch_|repomix|audit-.*xml/.test(f)?'historico-generado':/src[\\/]/.test(f)?'fuente':/docs[\\/]/.test(f)?'documentacion':'configuracion-activo',sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}));
fs.writeFileSync(path.join(out,'inventario.json'),JSON.stringify(inventory,null,2));
const imports=[],facts=[],secrets=[];
for(const f of code){const txt=fs.readFileSync(f,'utf8');txt.split(/\r?\n/).forEach((l,i)=>{
 if(/from\s*['"]|import\s*\(/.test(l))imports.push(`${rel(f)}:${i+1}: ${l.trim()}`);
 if(/\.from\(|\.rpc\(|\.channel\(|import\.meta\.env|https?:\/\/|document\.write|innerHTML|dangerouslySetInnerHTML|eval\(|new Function|\.select\(|\.range\(|\.limit\(|auth\.|localStorage|sessionStorage|\.upload\(|\.remove\(/.test(l))facts.push(`${rel(f)}:${i+1}: ${l.trim()}`);
});}
// Never emit matching values. Scan source, local artifacts and backups as well as env.
const patterns=[['anthropic-key',/sk-ant-[a-zA-Z0-9_-]{20,}/g],['supabase-secret',/sb_secret_[a-zA-Z0-9_-]+/g],['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['credential-url',/(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/g],['jwt',/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g]];
for(const f of files.filter(f=>!/[.](?:png|jpg|ico|woff2?)$/.test(f))){const txt=fs.readFileSync(f,'utf8');for(const [kind,re] of patterns)for(const m of txt.matchAll(re)){let role=null;if(kind==='jwt'){try{role=JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role??'sin-rol';}catch{role='no-decodificable';}}secrets.push({file:rel(f),line:txt.slice(0,m.index).split('\n').length,kind,role});}}
const env=files.filter(f=>path.basename(f).startsWith('.env')).map(f=>({file:rel(f),variables:fs.readFileSync(f,'utf8').split(/\r?\n/).filter(l=>/^\s*[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const [name,...rest]=l.split('=');const v=rest.join('=').trim().replace(/^['"]|['"]$/g,'');return {name:name.trim(),configured:!!v,placeholder:/^(dummy|your_|example|changeme|<)/i.test(v)};})}));
fs.writeFileSync(path.join(out,'secretos-sin-valores.json'),JSON.stringify({env,candidates:secrets},null,2));
fs.writeFileSync(path.join(out,'indice-importaciones.txt'),imports.join('\n'));
fs.writeFileSync(path.join(out,'indice-integraciones.txt'),facts.join('\n'));
const src=code.filter(f=>rel(f).startsWith('src/'));
const pkg=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const direct=Object.keys({...pkg.packages[''].dependencies,...pkg.packages[''].devDependencies}).map(n=>({package:n,version:pkg.packages['node_modules/'+n]?.version,license:pkg.packages['node_modules/'+n]?.license}));
fs.writeFileSync(path.join(out,'dependencias-directas.json'),JSON.stringify(direct,null,2));
console.log(JSON.stringify({files:files.length,sourceFiles:src.length,sourceLines:src.reduce((n,f)=>n+fs.readFileSync(f,'utf8').split('\n').length,0),env,secretCandidates:secrets,dependencies:direct},null,2));
