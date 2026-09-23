import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const results=[];
async function test(name,fn){try{await fn();results.push({name,ok:true});console.log('OK '+name);}catch(e){results.push({name,ok:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function load(path,mocks={}){const module={exports:{}};vm.runInNewContext(compile(await readFile(path,'utf8')),{module,exports:module.exports,console,require:k=>{if(!(k in mocks))throw Error(k);return mocks[k];}});return module.exports;}
async function extract(path,names){const source=await readFile(path,'utf8'),tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found={};function walk(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(tree)))found[node.name.getText(tree)]='const '+node.getText(tree)+';';if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))found[node.name.text]=node.getText(tree);ts.forEachChild(node,walk);}walk(tree);return names.map(n=>{assert(found[n],n);return found[n];}).join('\n');}
const ref=current=>({current});
const gestures={useCallback:f=>f,MIN_SCALE:.05,MAX_SCALE:12,scRef:ref(1),txRef:ref(0),tyRef:ref(0),panRef:ref({active:false}),pointersRef:ref(new Map()),pinchRef:ref(null),didDragRef:ref(false),gestoBloqueadoRef:ref(false),setIsPanning:()=>{}};
gestures.applyTransform=(s,x,y)=>{gestures.scRef.current=s;gestures.txRef.current=x;gestures.tyRef.current=y;};
vm.createContext(gestures);
vm.runInContext(compile(await extract('src/components/plano/VistaPlano.tsx',['onPointerDown','onPointerMove','onPointerUp']))+'\nthis.handlers={onPointerDown,onPointerMove,onPointerUp};',gestures);
const h=gestures.handlers,event=(id,x,y,type='touch',control=false)=>({pointerId:id,clientX:x,clientY:y,pointerType:type,button:0,target:{closest:s=>control&&s==='[data-no-pan]'},currentTarget:{setPointerCapture(){},getBoundingClientRect:()=>({left:20,top:30})}});
await test('20 ciclos de pinch conservan el punto focal y no crean taps accidentales',()=>{
 for(let i=0;i<20;i++){
  gestures.applyTransform(1,0,0);h.onPointerDown(event(1,120,130));h.onPointerDown(event(2,220,130));h.onPointerMove(event(2,320,130));
  assert.equal(gestures.scRef.current,2);assert.equal(gestures.txRef.current,-100);assert.equal(gestures.tyRef.current,-100);assert.equal(gestures.didDragRef.current,true);
  h.onPointerUp(event(2,320,130));h.onPointerMove(event(1,500,500));assert.equal(gestures.txRef.current,-100);
  h.onPointerUp(event(1,500,500));assert.equal(gestures.pointersRef.current.size,0);assert.equal(gestures.pinchRef.current,null);
 }
});
await test('tercer dedo y controles no provocan saltos; arrastre táctil sin movementX',()=>{
 gestures.applyTransform(1,0,0);h.onPointerDown(event(1,100,100));h.onPointerMove(event(1,150,180));assert.equal(gestures.txRef.current,50);assert.equal(gestures.didDragRef.current,true);h.onPointerUp(event(1,150,180));
 h.onPointerDown(event(1,100,100));h.onPointerDown(event(2,200,100));h.onPointerDown(event(3,250,100));const before=gestures.scRef.current;h.onPointerUp(event(2,200,100));h.onPointerMove(event(3,500,100));assert.equal(gestures.scRef.current,before);h.onPointerUp(event(1,100,100));h.onPointerUp(event(3,500,100));assert.equal(gestures.gestoBloqueadoRef.current,false);
 h.onPointerDown(event(4,0,0,'touch',true));assert.equal(gestures.pointersRef.current.size,0);
});
await test('coordenadas de anotación iguales tras zoom y cambio de tamaño',async()=>{
 let width=500;const ctx={canvasRef:ref({getBoundingClientRect:()=>({width,left:20,top:30})})};vm.createContext(ctx);vm.runInContext(compile(await extract('src/components/plano/EditorFoto.tsx',['getCoords']))+'\nthis.coords=getCoords;',ctx);
 for(const w of [320,500,900,1600,2500]){width=w;const p=ctx.coords({clientX:20+w*.25,clientY:30+w*.4});assert(Math.abs(p.x-250)<1e-8);assert(Math.abs(p.y-400)<1e-8);}
});
const printCss=await load('src/services/reportPrintCss.ts');const templates=await load('src/services/reportTemplates.ts',{'./reportPrintCss':printCss});const reports=await load('src/services/reportService.ts',{'./reportTemplates':templates});
await test('navegación no crea OTs y un doble toque crea una sola',async()=>{
 let creates=0,release;
 const context={useCallback:f=>f,accionPlanoRef:ref(false),didDragRef:ref(false),puedeEditar:true,modoPlano:'navegar',ordenAMover:null,planoListo:true,planoDims:{w:1000,h:1000},proyecto:{id:'p'},planAreaRef:ref({getBoundingClientRect:()=>({left:0,top:0})}),scRef:ref(1),txRef:ref(0),tyRef:ref(0),ordenes:[],actualizarOrden:async()=>{},crearOrdenEnPosicion:async()=>{creates++;await new Promise(r=>release=r);return {id:'qa'};},setModoPlano:()=>{},setOrdenSeleccionada:()=>{},setEsNuevaOT:()=>{},setErrorAccion:()=>{},setOrdenAMover:()=>{}};
 vm.createContext(context);vm.runInContext(compile(await extract('src/components/plano/VistaPlano.tsx',['onPlanClick']))+'\nthis.click=onPlanClick;',context);
 const tap={target:{closest:()=>false},clientX:200,clientY:300};await context.click(tap);assert.equal(creates,0);
 context.modoPlano='crear';const first=context.click(tap);await context.click(tap);assert.equal(creates,1);release();await first;assert.equal(context.accionPlanoRef.current,false);
});
await test('cinco borradores no atribuyen emisión ni reutilizan ubicación legada',()=>{
 const order={id:'qa',ot:'OT-QA',estado:'Cerrada',obra:'OBRA_REAL_QA',unidad_amenities:'UNIDAD_REAL_QA',ubicacion:'UBICACION_ANTIGUA',rubro:'Prueba',responsable:'QA',prioridad:'Media',campos:{},updated_at:'2026-09-22T20:00:00Z',fecha_ingreso:'2026-09-22',fecha_inicio_trabajos:'2026-09-23',fecha_fin_trabajos:'2026-09-26'};
 for(const name of ['generarInformeOrdenServicio','generarInformeRelevamiento','generarInformeAvance','generarInformeCierre','generarInformeActaConformidad']){const html=name==='generarInformeCierre' ? reports[name](order,'PROYECTO_DISTINTO','QA',[],[]) : name==='generarInformeActaConformidad' ? reports[name](order) : name==='generarInformeOrdenServicio' ? reports[name](order,'QA') : reports[name](order,'QA',[],[]);assert(!html.includes('UBICACION_ANTIGUA'),name+' legacy');assert(html.includes('Revisión documental: sin emitir'),name+' borrador');}
 const apertura=reports.generarInformeOrdenServicio(order,'QA');assert(apertura.includes('OBRA_REAL_QA'));assert(apertura.includes('UNIDAD_REAL_QA'));
 assert.equal(templates.formatearFechaLarga('2026-09-22'),'22 de Septiembre, 2026');
});
await test('respuesta ambigua de guardado no borra una imagen posiblemente confirmada',async()=>{
 let deletes=0,response={data:null,error:{message:'conexión interrumpida'}},revision=0;
 const query={update(){return this},eq(k,v){if(k==='revision')revision=v;return this},select(){return this},maybeSingle:async()=>response};
 const service=await load('src/services/editorFotoService.ts',{'../db/supabase':{supabase:{from:()=>query,storage:{from:()=>({remove:async()=>{deletes++;return {error:null};}})}}},'./storageService':{subirArchivo:async()=>({path:'qa.jpg',ref:'storage://fotos/qa.jpg'})},'../security/sessionScope':{sessionTicket:()=>1,assertSession:()=>{}}});
 const save=()=>service.subirImagenAnotada('f','o','p',{},[],'qa',{espacio:'ancho1000',brillo:0,contraste:0},7);
 await assert.rejects(save,/conexión/);assert.equal(deletes,0);assert.equal(revision,7);
 response={data:null,error:null};await assert.rejects(save,/otra sesión/);assert.equal(deletes,1);
 response={data:{revision:8},error:null};assert.equal(await save(),8);assert.equal(deletes,1);
});
const report={testedAt:new Date().toISOString(),scope:'Handlers reales con eventos simulados; no sustituye la prueba física de tablet.',passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/bloqueos-2026-09-22/client-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total}));if(results.some(r=>!r.ok))process.exitCode=1;
