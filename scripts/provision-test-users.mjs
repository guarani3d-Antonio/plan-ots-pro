// Solo para el proyecto de QA autorizado. Credenciales fuera de Git y del cliente.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const directory='.backups.local/2026-09-20-dia4/';
const key=(await readFile(directory+'admin-key.local','utf8')).trim();
const client=createClient('https://iqgbyqyoovzvhhdjawnt.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8'));
const users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
let credentials;
try{credentials=JSON.parse(await readFile(directory+'test-credentials.local.json','utf8'));}
catch(e){if(e.code!=='ENOENT')throw e;credentials=users.map(u=>({key:u.key,email:u.email,password:randomBytes(24).toString('base64url')}));await writeFile(directory+'test-credentials.local.json',JSON.stringify(credentials,null,2));}
for(const user of credentials){
  if(user.id){console.log(`${user.key}: ya creado`);continue;}
  const {data,error}=await client.auth.admin.createUser({email:user.email,password:user.password,email_confirm:true,user_metadata:{fixture:'plan-ots-qa',display_name:user.key}});
  if(error)throw new Error(`${user.key}: ${error.code??error.message}`);
  user.id=data.user.id;
  await writeFile(directory+'test-credentials.local.json',JSON.stringify(credentials,null,2));
  console.log(`${user.key}: creado`);
}
await writeFile('docs/estabilizacion-2026-09-20/dia-4/auth-provisioning.json',JSON.stringify({createdAt:new Date().toISOString(),project:'iqgbyqyoovzvhhdjawnt',accounts:credentials.map(({key,email,id})=>({key,email,id}))},null,2)+'\n');
