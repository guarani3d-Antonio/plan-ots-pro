import JSZip from 'jszip';
import {createHash,createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,appendFile,stat,open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
export const magic=Buffer.from('POTBACKUP1\n');
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export async function hashFile(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
function master(key){const b=Buffer.from(key||'','base64');if(b.length!==32)throw new Error('La clave de respaldo debe tener 32 bytes en Base64');return b;}
function derived(key,salt){return Buffer.from(hkdfSync('sha256',master(key),salt,magic,32));}
export async function writeArchive(output,entries,manifest,key){
 const zip=new JSZip(),files=[];
 const names=new Set(['manifest.json']);
 for(const e of entries){if(!validPath(e.name)||names.has(e.name))throw new Error('Ruta de paquete inválida o duplicada');names.add(e.name);
 const bytes=e.path?(await stat(e.path)).size:Buffer.byteLength(e.content);const sha256=e.path?await hashFile(e.path):digest(e.content);
 files.push({name:e.name,bytes,sha256});zip.file(e.name,e.path?createReadStream(e.path):e.content,{compression:e.name.endsWith('.json')?'DEFLATE':'STORE'});}
 zip.file('manifest.json',canonical({...manifest,format:'plan-ots-backup',version:1,entries:files}));
 const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([magic,salt,iv]),cipher=createCipheriv('aes-256-gcm',derived(key,salt),iv);cipher.setAAD(header);
 await writeFile(output,header,{mode:0o600,flag:'wx'});
 await pipeline(zip.generateNodeStream({type:'nodebuffer',streamFiles:true}),cipher,createWriteStream(output,{flags:'a'}));
 await appendFile(output,cipher.getAuthTag());return {bytes:(await stat(output)).size,sha256:await hashFile(output)};
}
export async function unpackArchive(input,output,key,maxBytes=512*1024*1024){
 const size=(await stat(input)).size,hsize=magic.length+28;if(size<=hsize+16)throw new Error('Paquete truncado');
 if(size>maxBytes+hsize+16)throw new Error('El paquete excede la capacidad de verificación');
 const handle=await open(input,'r');const header=Buffer.alloc(hsize),tag=Buffer.alloc(16);try{await handle.read(header,0,hsize,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
 if(!header.subarray(0,magic.length).equals(magic))throw new Error('Formato de respaldo no reconocido');
 const decipher=createDecipheriv('aes-256-gcm',derived(key,header.subarray(magic.length,magic.length+16)),header.subarray(magic.length+16));decipher.setAAD(header);decipher.setAuthTag(tag);
 await pipeline(createReadStream(input,{start:hsize,end:size-17}),decipher,createWriteStream(output,{flags:'wx',mode:0o600}));
 if((await stat(output)).size>maxBytes)throw new Error('Este paquete requiere un verificador de mayor capacidad');
 const zip=await JSZip.loadAsync(await readFile(output));const file=zip.file('manifest.json');if(!file||file._data.uncompressedSize>1048576)throw new Error('Falta manifiesto válido');
 const manifest=JSON.parse(await file.async('string'));if(manifest.format!=='plan-ots-backup'||manifest.version!==1||!Array.isArray(manifest.entries))throw new Error('Manifiesto inválido');
 const names=new Set(['manifest.json']);for(const e of manifest.entries){if(!validPath(e.name)||names.has(e.name)||!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256))throw new Error('Entrada inválida');names.add(e.name);}
 let expanded=0;for(const e of manifest.entries){expanded+=e.bytes;if(expanded>maxBytes)throw new Error('El contenido excede el límite de verificación');const f=zip.file(e.name);if(!f||f._data.uncompressedSize!==e.bytes)throw new Error('Archivo faltante o tamaño incorrecto: '+e.name);const b=await f.async('nodebuffer');if(b.length!==e.bytes||digest(b)!==e.sha256)throw new Error('Integridad incorrecta: '+e.name);}
 if(Object.values(zip.files).some(f=>!f.dir&&!names.has(f.name)))throw new Error('Contenido no declarado');
 return {manifest,zip};
}
function validPath(name){return typeof name==='string'&&/^[a-zA-Z0-9_./-]+$/.test(name)&&!name.includes('..')&&!name.startsWith('/');}
export function reuseIndex(previous,current){
 const old=new Map(previous.storage.map(o=>[`${o.bucket_id}/${o.name}`,o])),reusable=new Map();
 for(const object of current.storage){const source=old.get(`${object.bucket_id}/${object.name}`);if(!source?.backupEntry)continue;const {backupEntry,...metadata}=source;if(canonical(metadata)===canonical(object))reusable.set(`${object.bucket_id}/${object.name}`,backupEntry);}
 return reusable;
}
// Tenant data is selected by scoped ownership and declared foreign keys. Unknown
// nonempty tables block company export rather than silently omit new modules.
export function scopeSnapshot(snapshot,tenant){
 if(!tenant)return snapshot;
 const data=snapshot.tablas,selected=Object.fromEntries(Object.keys(data).map(t=>[t,[]]));
 const global=new Set(['plan_permiso_catalogo']);const excluded=new Set(['plataforma_administradores','plan_ot_codigo_migracion','plan_asistente_cuentas','plan_asistente_consultas']);
 // Personal API custody and usage span companies and must never enter a
 // company export. The encrypted full-platform archive preserves both tables.
 for(const [table,rows]of Object.entries(data))selected[table]=excluded.has(table)?[]:rows.filter(r=>table==='tenants'?r.id===tenant:Object.hasOwn(r,'tenant_id')?r.tenant_id===tenant:global.has(table));
 const relations=snapshot.relaciones||[],constraints=new Map();
 for(const edge of relations){if(edge.esquema_padre&&edge.esquema_padre!=='public')continue;const key=edge.restriccion||`${edge.tabla}/${edge.columna}/${edge.padre}`;const group=constraints.get(key)||[];group.push(edge);constraints.set(key,group);}
 for(let pass=0;pass<Object.keys(data).length;pass++){
  let changed=false;for(const [table,rows]of Object.entries(data))for(const row of rows){if(selected[table].includes(row)||excluded.has(table)||table==='tenants'||Object.hasOwn(row,'tenant_id'))continue;
   const groups=[...constraints.values()].filter(edges=>edges[0].tabla===table&&edges[0].padre!=='users');
   if(groups.some(edges=>selected[edges[0].padre]?.some(parent=>edges.every(f=>row[f.columna]!=null&&parent[f.clave]===row[f.columna])))){selected[table].push(row);changed=true;}
  }if(!changed)break;
 }
 const ids=new Set(Object.values(selected).flat().map(r=>r.id).filter(Boolean));
 if(data.plan_directorio_fotos)selected.plan_directorio_fotos=data.plan_directorio_fotos.filter(r=>ids.has(r.ficha_id));
 const users=new Set((selected.tenant_miembros||[]).map(r=>r.user_id));
 // Profiles are shared globally; only member profiles belong to a company copy.
 if(data.profiles)selected.profiles=data.profiles.filter(r=>users.has(r.id));
 const unknown=Object.entries(data).filter(([t,rows])=>rows.length&&!excluded.has(t)&&!global.has(t)&&t!=='tenants'&&t!=='profiles'&&t!=='plan_directorio_fotos'&&!rows.some(r=>Object.hasOwn(r,'tenant_id'))&&![...constraints.values()].some(edges=>edges[0].tabla===t&&edges[0].padre!=='users')).map(([t])=>t);
 if(unknown.length)throw new Error('Cobertura de empresa pendiente para: '+unknown.join(', '));
 const strings=new Set();function walk(v){if(typeof v==='string')strings.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);}walk(selected);
 const storage=snapshot.storage.filter(o=>{
  if(o.name.startsWith(tenant+'/'))return true;
  if((data.tenants||[]).some(t=>t.id!==tenant&&o.name.startsWith(t.id+'/')))return false;
  if(o.bucket_id==='directory-photos')return ids.has(o.name.split('/')[1]);
  if(o.bucket_id==='profile-photos')return users.has(o.name.split('/')[0]);
  return strings.has(`storage://${o.bucket_id}/${o.name}`)||strings.has(o.name)||[...strings].some(s=>['public','authenticated','sign'].some(mode=>s.includes(`/object/${mode}/${o.bucket_id}/${o.name}`)));
 });
 return {...snapshot,tablas:selected,storage,alcance:tenant,exclusiones:[...excluded]};
}
