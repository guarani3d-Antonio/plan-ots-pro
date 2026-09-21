// JWT reales y Storage API. Solo agrega fixtures sintéticos y borra sus propios temporales.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {adminClient,ok,url,dir} from './day5-storage-admin.mjs';
const admin=await adminClient();const env=await readFile('.env.local','utf8');
const anonKey=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];assert(anonKey);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const anon=createClient(url,anonKey,options),clients={},results=[],temporary=[];
const credentials=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json','utf8'));
const projects=['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002'];
const tenants=['10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
const orders=['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'];
const plane=i=>`${tenants[Math.floor(i/2)]}/${projects[i]}/private-fixture.svg`;
const photo=i=>`${tenants[Math.floor(i/2)]}/${projects[i]}/${orders[i]}/private-fixture.png`;
const png=await readFile('public/icon-192.png'),svg=await readFile('public/fixtures/plano-prueba.svg');
const uid=key=>credentials.find(c=>c.key===key).id;
const denied=r=>assert(r.error,'Se esperaba rechazo de Storage');
async function check(name,fn){try{await fn();results.push({name,ok:true});console.log('OK '+name);}catch(e){const message=e.message.split('\n')[0];results.push({name,ok:false,error:message});console.log('FAIL '+name+': '+message);}}
async function put(client,bucket,path,bytes,type){ok(await client.storage.from(bucket).upload(path,bytes,{contentType:type,cacheControl:'0',upsert:false}));}
async function ephemeral(client,bucket,path){temporary.push({bucket,path});await put(client,bucket,path,png,'image/png');return path;}
const tempPath=(i,bucket='fotos')=>`${tenants[Math.floor(i/2)]}/${projects[i]}/${bucket==='fotos'?orders[i]+'/':''}qa-${randomUUID()}.png`;
let shortUrl;
try{
  assert(ok(await admin.storage.listBuckets()).filter(b=>['planos','fotos','exports'].includes(b.id)).every(b=>!b.public),'Buckets privados');
  for(const c of credentials){const client=createClient(url,anonKey,options);ok(await client.auth.signInWithPassword({email:c.email,password:c.password}));clients[c.key]=client;}
  await check('3 buckets privados y 11 cuentas con JWT real',async()=>assert.equal(Object.keys(clients).length,11));
  // Fixtures duraderos para el recorrido web. Reejecución no sobrescribe archivos.
  for(let i=0;i<4;i++){
    const prefix=i<2?'e1':'e2',manager=clients[prefix+'-admin'],tech=clients[prefix+'-tecnico-'+(i%2+1)];
    if((await admin.storage.from('planos').download(plane(i))).error)await put(manager,'planos',plane(i),svg,'image/svg+xml');
    ok(await manager.from('proyectos').update({plano_url:'storage://planos/'+plane(i)}).eq('id',projects[i]).select('id').single());
    if((await admin.storage.from('fotos').download(photo(i))).error)await put(tech,'fotos',photo(i),png,'image/png');
    const id=`${i<2?'a':'b'}5000000-0000-4000-8000-00000000000${i%2+1}`;
    if(!ok(await admin.from('fotos').select('id').eq('id',id)).length)ok(await tech.from('fotos').insert({id,proyecto_id:projects[i],orden_id:orders[i],categoria:'ANTES',file_url:'storage://fotos/'+photo(i),file_path:photo(i),file_type:'imagen'}).select('id').single());
  }
  await check('4 planos y 4 fotos privados registrados por usuarios autorizados',async()=>{
    for(let i=0;i<4;i++)assert.equal(ok(await admin.from('proyectos').select('plano_url').eq('id',projects[i]).single()).plano_url,'storage://planos/'+plane(i));
  });
  for(const c of credentials){
    const allowed=c.key==='platform-creator'?[0,1,2,3]:c.key.includes('admin')||c.key.includes('supervisor')?(c.key.startsWith('e1')?[0,1]:[2,3]):[(c.key.startsWith('e1')?0:2)+(c.key.endsWith('tecnico-2')?1:0)];
    await check(`${c.key}: descarga y firma según empresa/obra`,async()=>{
      for(let i=0;i<4;i++){const r=await clients[c.key].storage.from('planos').download(plane(i));const s=await clients[c.key].storage.from('fotos').createSignedUrl(photo(i),30);if(allowed.includes(i)){ok(r);ok(s);}else{denied(r);denied(s);}}
    });
  }
  const tech=clients['e1-tecnico-1'],viewer=clients['e1-lector'],sup=clients['e1-supervisor'];
  await check('anónimo: URL pública, descarga y firma bloqueadas',async()=>{
    for(const [bucket,path] of [['planos',plane(0)],['fotos',photo(0)]]){
      const publicURL=anon.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      assert(!(await fetch(publicURL,{cache:'no-store'})).ok,'URL pública bloqueada');denied(await anon.storage.from(bucket).download(path));denied(await anon.storage.from(bucket).createSignedUrl(path,30));
    }
  });
  await check('URL firmada autorizada descarga el binario exacto',async()=>{
    const signed=ok(await tech.storage.from('planos').createSignedUrl(plane(0),300)).signedUrl;
    const r=await fetch(signed,{cache:'no-store'});assert(r.ok);assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),createHash('sha256').update(svg).digest('hex'));
    shortUrl=ok(await tech.storage.from('planos').createSignedUrl(plane(0),2)).signedUrl;
  });
  for(const [name,client,bucket,path] of [
    ['otra empresa',tech,'fotos',tempPath(2)],['otra obra propia',tech,'fotos',tempPath(1)],
    ['lector',viewer,'fotos',tempPath(0)],['técnico sobre planos',tech,'planos',tempPath(0,'planos')],
    ['técnico sobre exports',tech,'exports',tempPath(0,'exports')],
    ['tenant falsificado',tech,'fotos',tempPath(0).replace(tenants[0],tenants[1])],
    ['orden ajena',tech,'fotos',tempPath(0).replace(orders[0],orders[2])]
  ])await check('subida denegada: '+name,async()=>{temporary.push({bucket,path});denied(await client.storage.from(bucket).upload(path,png,{contentType:'image/png'}));});
  await check('listado no revela nombres de otra obra',async()=>assert.equal(ok(await tech.storage.from('planos').list(`${tenants[1]}/${projects[2]}`)).length,0));
  await check('sobrescribir y mover están bloqueados',async()=>{
    const path=await ephemeral(sup,'planos',tempPath(0,'planos'));
    denied(await sup.storage.from('planos').update(path,png));denied(await sup.storage.from('planos').move(path,tempPath(0,'planos')));ok(await admin.storage.from('planos').download(path));
  });
  await check('copiar desde obra ajena está bloqueado',async()=>{const path=tempPath(0,'planos');temporary.push({bucket:'planos',path});denied(await clients['e1-admin'].storage.from('planos').copy(plane(2),path));});
  await check('lector no elimina, propietario técnico sí',async()=>{
    const path=await ephemeral(tech,'fotos',tempPath(0));
    await viewer.storage.from('fotos').remove([path]);ok(await admin.storage.from('fotos').download(path));
    assert.equal(ok(await tech.storage.from('fotos').remove([path])).length,1);
    assert.equal(ok(await admin.storage.from('fotos').list(path.slice(0,path.lastIndexOf('/')),{search:path.split('/').at(-1)})).length,0);
    denied(await admin.storage.from('fotos').download(path,{cacheNonce:randomUUID()}));
  });
  await check('exports reservado a supervisores de la obra',async()=>{
    const path=await ephemeral(sup,'exports',tempPath(0,'exports'));
    ok(await sup.storage.from('exports').download(path));for(const c of [tech,viewer,clients['e2-admin'],anon]){denied(await c.storage.from('exports').download(path));denied(await c.storage.from('exports').createSignedUrl(path,30));}
  });
  await check('revocación impide descarga JWT y emisión de nuevas firmas',async()=>{
    try{ok(await admin.from('tenant_miembros').update({activo:false}).eq('user_id',uid('e1-tecnico-1')));denied(await tech.storage.from('fotos').download(photo(0)));denied(await tech.storage.from('planos').createSignedUrl(plane(0),30));}
    finally{ok(await admin.from('tenant_miembros').update({activo:true}).eq('user_id',uid('e1-tecnico-1')));}
  });
  await check('URL de dos segundos caduca',async()=>assert(!(await fetch(shortUrl,{cache:'no-store'})).ok));
  await check('referencias cruzadas de plano y foto se rechazan en REST',async()=>{
    assert.equal((await clients['e1-admin'].from('proyectos').update({plano_url:'storage://planos/'+plane(2)}).eq('id',projects[0])).error?.code,'42501');
    assert.equal((await tech.from('fotos').insert({proyecto_id:projects[0],orden_id:orders[0],categoria:'ANTES',file_path:photo(2),file_url:'storage://fotos/'+photo(2),file_type:'imagen'})).error?.code,'42501');
  });
  await check('crear obra, subir plano y vincular referencia privada',async()=>{
    let id;try{const p=ok(await clients['e1-admin'].rpc('plan_crear_proyecto',{p_nombre:'QA Storage temporal',p_plano_url:'pending://plan-upload-required'}).single());id=p.id;const path=`${tenants[0]}/${id}/qa.svg`;temporary.push({bucket:'planos',path});await put(clients['e1-admin'],'planos',path,svg,'image/svg+xml');ok(await clients['e1-admin'].from('proyectos').update({plano_url:'storage://planos/'+path}).eq('id',id).select('id').single());ok(await clients['e1-admin'].storage.from('planos').download(path));}
    finally{if(id)ok(await admin.from('proyectos').delete().eq('id',id));}
  });
  await check('legados conservados y descargables solo con membresía',async()=>{
    const links=ok(await admin.from('plan_archivos_legados').select('bucket_id,object_name,proyecto_id'));
    assert.equal(links.length,140);const sample=links.find(l=>l.bucket_id==='planos');assert(sample);
    ok(await clients['platform-creator'].storage.from(sample.bucket_id).download(sample.object_name));denied(await tech.storage.from(sample.bucket_id).download(sample.object_name));
    const objects=JSON.parse(await readFile(dir+'objects-before.json','utf8'));
    const orphan=objects.find(o=>!links.some(l=>l.bucket_id===o.bucket&&l.object_name===o.namePath));assert(orphan);
    denied(await clients['platform-creator'].storage.from(orphan.bucket).download(orphan.namePath));ok(await admin.storage.from(orphan.bucket).download(orphan.namePath));
  });
}catch(e){results.push({name:'preparación',ok:false,error:e.message.split('\n')[0]});console.log('FAIL preparación: '+e.message.split('\n')[0]);}
finally{
  for(const {bucket,path} of temporary){try{ok(await admin.storage.from(bucket).remove([path]));}catch{results.push({name:'limpieza temporal',ok:false,error:'Revisar manifest privado'});}}
  await writeFile(dir+'temporary-storage-test.json',JSON.stringify(temporary,null,2));
  const report={testedAt:new Date().toISOString(),scope:'Supabase Auth, REST y Storage API reales. Firmas son portadoras: una ya emitida sigue válida hasta caducar; el cliente pide 300 s, no es un máximo impuesto por servidor.',passed:results.filter(r=>r.ok).length,total:results.length,fixtureObjects:8,results};
  await writeFile('docs/estabilizacion-2026-09-20/dia-5/storage-rest-tests.json',JSON.stringify(report,null,2)+'\n');console.log(`${report.passed}/${report.total}`);if(results.some(r=>!r.ok))process.exitCode=1;
}
