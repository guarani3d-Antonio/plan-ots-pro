// Ensayo HTTP real, limitado a fixtures. Nunca registra tokens ni contraseñas.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const url='https://iqgbyqyoovzvhhdjawnt.supabase.co';
const directory='.backups.local/2026-09-20-dia4/';
const env=await readFile('.env.local','utf8');
const anon=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert(anon,'Falta clave pública');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,(await readFile(directory+'admin-key.local','utf8')).trim(),opts);
const credentials=JSON.parse(await readFile(directory+'test-credentials.local.json','utf8'));
const clients={};const results=[];
const projects=['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002'];
const tenants=['10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
const orderIds=['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002'];
const user=key=>credentials.find(x=>x.key===key);
const ok=r=>{if(r.error)throw new Error(`${r.error.code}: ${r.error.message}`);return r.data;};
async function check(name,fn){try{await fn();results.push({name,ok:true});console.log('OK '+name);}catch(e){results.push({name,ok:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
const denied=r=>{assert(r.error,'Se esperaba rechazo');assert.equal(r.error.code,'42501');};
const order=(project,id,author)=>({id,proyecto_id:project,ot:'QA-REST-'+id.slice(0,8),ubicacion:'Sector A',rubro:'Prueba',responsable:'Equipo ficticio',prioridad:'Media',plano_ref_url:'/fixtures/plano-prueba.svg',created_by:author,pos_x:0.25,pos_y:0.3,ubicada_en_plano:true});
try{
  for(const c of credentials){const client=createClient(url,anon,opts);ok(await client.auth.signInWithPassword({email:c.email,password:c.password}));clients[c.key]=client;}
  await check('11 cuentas inician sesión con JWT real',async()=>assert.equal(Object.keys(clients).length,11));
  const before=ok(await admin.from('proyectos').select('id,tenant_id'));
  assert.equal(before.filter(p=>p.tenant_id).length,4);
  for(let i=0;i<4;i++)ok(await admin.from('ordenes').upsert(order(projects[i],orderIds[i],user(i<2?'e1-admin':'e2-admin').id),{onConflict:'id'}));
  for(const c of credentials){
    const expected=c.key==='platform-creator'?before.map(p=>p.id):c.key.includes('admin')||c.key.includes('supervisor')?projects.slice(c.key.startsWith('e1')?0:2,c.key.startsWith('e1')?2:4):[projects[(c.key.startsWith('e1')?0:2)+(c.key.endsWith('tecnico-2')?1:0)]];
    await check(`${c.key}: solo obras autorizadas`,async()=>assert.deepEqual(ok(await clients[c.key].from('proyectos').select('id')).map(p=>p.id).sort(),expected.sort()));
    await check(`${c.key}: órdenes respetan empresa y obra`,async()=>assert.deepEqual(ok(await clients[c.key].from('ordenes').select('proyecto_id').in('id',orderIds)).map(o=>o.proyecto_id).sort(),projects.filter(p=>expected.includes(p)).sort()));
  }
  const tech=clients['e1-tecnico-1'],viewer=clients['e1-lector'],sup=clients['e1-supervisor'];
  await check('anon no lee tablas de dominio',async()=>denied(await createClient(url,anon,opts).from('proyectos').select('id')));
  await check('técnico no crea OT en otra obra de su empresa',async()=>denied(await tech.from('ordenes').insert(order(projects[1],randomUUID(),user('e1-tecnico-1').id))));
  await check('técnico no crea OT en otra empresa',async()=>denied(await tech.from('ordenes').insert(order(projects[2],randomUUID(),user('e1-tecnico-1').id))));
  await check('lector no crea OT',async()=>denied(await viewer.from('ordenes').insert(order(projects[0],randomUUID(),user('e1-lector').id))));
  await check('lector no modifica OT existente',async()=>assert.equal(ok(await viewer.from('ordenes').update({ot:'NO'}).eq('id',orderIds[0]).select('id')).length,0));
  await check('autor de OT es inmutable',async()=>denied(await tech.from('ordenes').update({created_by:user('e2-admin').id}).eq('id',orderIds[0])));
  await check('editor falsificado se rechaza',async()=>denied(await tech.from('ordenes').update({updated_by:user('e2-admin').id}).eq('id',orderIds[0])));
  await check('referencia cruzada foto/OT se rechaza',async()=>{
    const r=await tech.from('fotos').insert({proyecto_id:projects[0],orden_id:orderIds[2],uploaded_by:user('e1-tecnico-1').id,categoria:'ANTES',file_path:'qa/no-object',file_url:'/fixtures/plano-prueba.svg',file_type:'imagen'});
    assert.equal(r.error?.code,'23503');
  });
  await check('supervisor agrega miembro de su empresa',async()=>{
    try{ok(await sup.from('proyecto_miembros').insert({proyecto_id:projects[1],user_id:user('e1-lector').id,rol:'viewer'}));}
    finally{ok(await admin.from('proyecto_miembros').delete().eq('proyecto_id',projects[1]).eq('user_id',user('e1-lector').id));}
  });
  await check('supervisor no agrega usuario de otra empresa',async()=>denied(await sup.from('proyecto_miembros').insert({proyecto_id:projects[0],user_id:user('e2-lector').id,rol:'viewer'})));
  await check('revocación corta lectura con JWT previamente emitido',async()=>{
    try{ok(await admin.from('tenant_miembros').update({activo:false}).eq('user_id',user('e1-tecnico-1').id));assert.equal(ok(await tech.from('proyectos').select('id')).length,0);assert.equal(ok(await tech.from('ordenes').select('id')).length,0);}
    finally{ok(await admin.from('tenant_miembros').update({activo:true}).eq('user_id',user('e1-tecnico-1').id));}
  });
  await check('rebajar rol corta edición con JWT vigente',async()=>{
    try{ok(await admin.from('tenant_miembros').update({rol:'viewer'}).eq('user_id',user('e1-tecnico-1').id));denied(await tech.from('ordenes').insert(order(projects[0],randomUUID(),user('e1-tecnico-1').id)));}
    finally{ok(await admin.from('tenant_miembros').update({rol:'tecnico'}).eq('user_id',user('e1-tecnico-1').id));}
  });
  await check('empresa inactiva corta acceso de admin',async()=>{
    try{ok(await admin.from('tenants').update({activo:false}).eq('id',tenants[0]));assert.equal(ok(await clients['e1-admin'].from('proyectos').select('id')).length,0);}
    finally{ok(await admin.from('tenants').update({activo:true}).eq('id',tenants[0]));}
  });
  await check('RPC devuelve proyecto con membresía creada',async()=>{
    let id;try{const p=ok(await clients['e1-admin'].rpc('plan_crear_proyecto',{p_nombre:'QA temporal creación',p_plano_url:'/fixtures/plano-prueba.svg'}).single());id=p.id;assert.equal(p.tenant_id,tenants[0]);assert.equal(ok(await clients['e1-admin'].from('proyecto_miembros').select('user_id').eq('proyecto_id',id)).length,1);}
    finally{if(id)ok(await admin.from('proyectos').delete().eq('id',id));}
  });
  await check('RPC niega creación en empresa ajena',async()=>denied(await clients['e1-admin'].rpc('plan_crear_proyecto',{p_nombre:'NO',p_plano_url:'fixture',p_tenant_id:tenants[1]})));
  await check('técnico crea/edita, supervisor borra y audita',async()=>{
    const id=randomUUID();
    try{
      ok(await tech.from('ordenes').insert(order(projects[0],id,user('e1-tecnico-1').id)).select().single());
      const edited=ok(await tech.from('ordenes').update({estado:'Cerrada'}).eq('id',id).select().single());assert.equal(edited.updated_by,user('e1-tecnico-1').id);
      assert.equal(ok(await tech.from('ordenes').delete().eq('id',id).select('id')).length,0);
      assert.equal(ok(await sup.from('ordenes').delete().eq('id',id).select('id')).length,1);
      assert.equal(ok(await sup.from('ordenes_eliminadas').select('eliminado_por').eq('orden_id',id)).at(0)?.eliminado_por,user('e1-supervisor').id);
    }finally{ok(await admin.from('ordenes').delete().eq('id',id));ok(await admin.from('ordenes_eliminadas').delete().eq('orden_id',id));}
  });
  await check('13 obras legadas conservadas y 4 fixtures exactos',async()=>{
    const after=ok(await admin.from('proyectos').select('id,tenant_id'));assert.deepEqual(after.map(p=>p.id).sort(),before.map(p=>p.id).sort());assert.equal(after.filter(p=>!p.tenant_id).length,13);
  });
}catch(e){results.push({name:'preparación REST',ok:false,error:e.message});}
finally{
  const report={testedAt:new Date().toISOString(),scope:'Supabase Auth y REST reales; JWT emitidos por login. No certifica Storage, UI, caché ni confidencialidad de costos.',passed:results.filter(r=>r.ok).length,total:results.length,results};
  await writeFile('docs/estabilizacion-2026-09-20/dia-4/rest-matrix.json',JSON.stringify(report,null,2)+'\n');
  console.log(`${report.passed}/${report.total}`);if(results.some(r=>!r.ok))process.exitCode=1;
}
