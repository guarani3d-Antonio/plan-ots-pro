import assert from 'node:assert/strict';
export async function probarMarcaDocumental({db,one,as,creator,outsider,tenant,work,order,contractor,planDoc,planData,budgetData,previousRevision,id}){
 let n=8000;const request=()=>id(n++),template='expediente-controlado-2026-10-16-marca';
 const logo1=`empresa/${tenant}/${request()}.jpg`,logo2=`empresa/${tenant}/${request()}.jpg`;
 const previous=(await one('select fuentes_sha256 from plan_documento_fuentes where revision_id=$1',[previousRevision])).fuentes_sha256;
 await db.exec('reset role');for(const path of [logo1,logo2])await db.query("insert into storage.objects(bucket_id,name,owner_id) values('directory-photos',$1,$2)",[path,creator]);await as(creator);
 await one("select plan_guardar_foto_directorio('empresa',$1,$2)",[tenant,logo1]);
 assert.equal((await one('select plan_empresa_marca_obra($1) r',[work])).r.logo_path,logo1);
 const saved=(await one('select plan_documento_version_guardar($1,$2,2,$3,true,$4,1,$5) r',[planDoc,planData,request(),'Marca de prueba',template])).r.revision;
 const src=(await one('select fuentes from plan_documento_fuentes where revision_id=$1',[saved.id])).fuentes;assert.equal(src.logo_path,logo1);
 const budget=(await one('select plan_presupuesto_guardar($1,$2,$3,null,null,$4) r',[order,contractor,{...budgetData,documento_revision:saved.id},request()])).r;
 assert.equal(budget.fuentes.logo_path,logo1);assert.equal(budget.fuentes.plantilla_version,'presupuesto-arquitectura-2026-10-16');
 await one("select plan_guardar_foto_directorio('empresa',$1,$2)",[tenant,logo2]);
 assert.equal((await one('select fuentes from plan_documento_fuentes where revision_id=$1',[saved.id])).fuentes.logo_path,logo1);
 assert.equal((await one('select fuentes_sha256 from plan_documento_fuentes where revision_id=$1',[previousRevision])).fuentes_sha256,previous);
 assert.equal((await one('select plan_documento_logo_conservar($1) ok',[logo1])).ok,false);
 await db.query("delete from storage.objects where bucket_id='directory-photos' and name=$1",[logo1]);await db.exec('reset role');assert.equal((await one("select count(*)::int n from storage.objects where name=$1",[logo1])).n,1);await as(creator);
 const next=(await one('select plan_documento_version_guardar($1,$2,3,$3,true,$4,1,$5) r',[planDoc,planData,request(),'Otro logo de prueba',template])).r.revision;
 assert.equal((await one('select fuentes from plan_documento_fuentes where revision_id=$1',[next.id])).fuentes.logo_path,logo2);
 assert.equal((await one('select plan_documento_logo_conservar($1) ok',[logo2])).ok,false,'A report alone preserves its logo');
 const candidate=(await one('select to_jsonb(plan_documento_preparar($1,$2)) r',[next.id,request()])).r;
 await assert.rejects(one('select plan_documento_logo_binario_validar($1,$2)',[candidate.id,[]]),e=>e.code==='42501');
 await as(outsider);await assert.rejects(one('select plan_empresa_marca_obra($1)',[work]),e=>e.code==='42501');await as(null);
 const token=request(),prefix=`${tenant}/${work}/documentos/${next.id}`,hash='c'.repeat(64),pdfPath=`${prefix}/${hash}.pdf`,logoHash='d'.repeat(64),logoPath=`${prefix}/logo/${logoHash}`;
 await one('select plan_documento_render_reclamar($1,$2)',[candidate.id,token]);
 for(const path of [pdfPath,logoPath])await db.query("insert into storage.objects(bucket_id,name) values('exports',$1)",[path]);
 const manifest=[];for(const f of src.fotos){const item={id:f.id};for(const kind of ['original','edicion']){const sh=(kind==='original'?'a':'b').repeat(64),path=`${prefix}/fotos/${f.id}/${kind}/${sh}`;await db.query("insert into storage.objects(bucket_id,name) values('exports',$1)",[path]);item[kind]={fuente_path:f[kind+'_path'],path,sha256:sh,bytes:100};}manifest.push(item);}
 const logo={tipo:'logo',fuente_path:logo2,path:logoPath,sha256:logoHash,bytes:100,mime:'image/jpeg'};
 const mark=ms=>one('select to_jsonb(plan_documento_pdf_listo($1,$2,$3,$4,100,$5)) r',[candidate.id,token,pdfPath,hash,ms]);
 for(const bad of [manifest,[...manifest,logo,logo],[...manifest,{...logo,fuente_path:logo1}],[...manifest,{...logo,path:logoPath+'bad'}],[...manifest,{...logo,sha256:'bad'}],[...manifest,{...logo,mime:'image/png'}]])await assert.rejects(mark(bad),e=>e.code==='22023');
 const ready=(await mark([...manifest,logo])).r;assert.equal(ready.estado,'listo');assert.deepEqual(ready.fuentes_binarias,[...manifest,logo]);
 await as(creator);console.log('PASS marca: empresa por obra, logos congelados/protegidos, compatibilidad, manifiesto verificado y aislamiento.');
}
