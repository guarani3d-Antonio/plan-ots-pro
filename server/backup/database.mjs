// Both clients authenticate the source server; never downgrade TLS for a backup.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {rootCertificates} from 'node:tls';
const certificatePath=fileURLToPath(new URL('./supabase-prod-ca-2021.crt',import.meta.url));
const sourceCertificate=readFileSync(certificatePath,'utf8');
function sourceUrl(value) {
 let url;try{url=new URL(value);}catch{throw new Error('Conexión PostgreSQL inválida');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password)throw new Error('Conexión PostgreSQL incompleta');
 const mode=url.searchParams.get('sslmode');
 if(mode&&mode!=='verify-full')throw new Error('El respaldo requiere validar el certificado PostgreSQL');
 for(const key of url.searchParams.keys())if(!['sslmode','sslrootcert'].includes(key))throw new Error('Parámetro PostgreSQL no admitido en el respaldo');
 const root=url.searchParams.get('sslrootcert');
 if(root&&root!=='system')throw new Error('El respaldo usa certificados de confianza del sistema');
 return url;
}
export function databaseOptions(value) {
 const url=sourceUrl(value);url.search='';
 return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:[...rootCertificates,sourceCertificate]},connectionTimeoutMillis:15000};
}
export function dumpEnvironment(value,environment=process.env) {
 const url=sourceUrl(value);
 return {...environment,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'verify-full',PGSSLROOTCERT:certificatePath,PGCONNECT_TIMEOUT:'15'};
}
