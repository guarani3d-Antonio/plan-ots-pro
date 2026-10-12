import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
await mkdir('tmp/report-editor-tests',{recursive:true});
await writeFile('tmp/report-editor-tests/entry.ts',"export {EtapaCampos} from '../../src/components/informes/EtapaCampos';export {ETAPAS_OT,claveEtapa} from '../../src/services/otStageSchema';export {CAMPOS_HEREDADOS} from '../../src/services/reportFieldPolicy';export {DatoInforme,CampoTextoInforme} from '../../src/components/informes/CampoTextoInforme';export {IdentificacionInformeCampos} from '../../src/components/informes/IdentificacionInformeCampos';export {CAMPOS_IDENTIFICACION} from '../../src/services/reportAutofillService';");
await build({configFile:false,plugins:[react()],build:{lib:{entry:'tmp/report-editor-tests/entry.ts',formats:['es'],fileName:'fixture'},outDir:'tmp/report-editor-tests',emptyOutDir:false,minify:false,rollupOptions:{external:['react','react/jsx-runtime','react-dom']}}});
const {EtapaCampos,ETAPAS_OT,claveEtapa,CAMPOS_HEREDADOS,DatoInforme,CampoTextoInforme,IdentificacionInformeCampos,CAMPOS_IDENTIFICACION}=await import('../tmp/report-editor-tests/fixture.js');
for(const etapa of ETAPAS_OT){
 const values=Object.fromEntries(etapa.groups.flatMap(g=>g.fields).map(f=>[f.key,f.options?f.options[0]:f.type==='scale'?'8':f.type==='date'?'2026-10-08':f.type==='time'?'09:00':f.type==='datetime-local'?'2026-10-08T09:00':`QA_${f.key}`]));
 const datos={[claveEtapa(etapa.tipo)]:values,observaciones:'QA_OBSERVACIONES',itemsAlcance:[{id:'A-01',trabajo:'QA_ACTIVIDAD',rubro:'QA_RUBRO',profesional:'QA_PROFESIONAL',criterio:'QA_CRITERIO'}],itemsAvance:[{id:'A-01',previsto:'QA_PREVISTO',realizado:'QA_REALIZADO',saldo:'QA_SALDO'}],itemsCierre:[{id:'A-01',trabajo:'QA_TRABAJO',criterio:'QA_CRITERIO',resultado:'QA_RESULTADO',verificadorFecha:'QA_VERIFICADOR'}]};
 const render=(compact,disabled=false)=>renderToStaticMarkup(createElement(EtapaCampos,{tipo:etapa.tipo,datos,compact,disabled,onChange:()=>{}}));
 const original=render(false),editor=render(true);
 for(const marker of new Set(original.match(/QA_[A-Z_a-z]+/g)))assert.ok(editor.includes(marker),`${etapa.tipo}: campo perdido ${marker}`);
 for(const tag of ['input','textarea','select'])assert.equal((editor.match(new RegExp(`<${tag}\\b`,'g'))??[]).length,(original.match(new RegExp(`<${tag}\\b`,'g'))??[]).length,`${etapa.tipo}: controles ${tag}`);
 assert.equal((editor.match(/aria-label="Dictar"/g)??[]).length,(original.match(/aria-label="Dictar"/g)??[]).length,`${etapa.tipo}: dictado`);
 assert.doesNotMatch(editor,/<textarea[^>]*rows="[123]"/);
 assert.ok(editor.includes('<details'),`${etapa.tipo}: grupos compactos`);
 for(const key of CAMPOS_HEREDADOS[etapa.tipo]){
  const marker=values[key];if(!marker?.startsWith('QA_'))continue;
  assert.ok(editor.includes(marker),`${etapa.tipo}: dato heredado oculto ${key}`);
  assert.ok(!editor.includes(`value="${marker}"`),`${etapa.tipo}: dato heredado en input ${key}`);
  assert.doesNotMatch(editor,new RegExp(`<textarea[^>]*>${marker}</textarea>`),`${etapa.tipo}: dato heredado en textarea ${key}`);
 }
 const locked=render(true,true);
 assert.doesNotMatch(locked,/<(?:input|textarea|select)\b/,`${etapa.tipo}: lectura conserva controles de edición`);
 assert.doesNotMatch(locked,/aria-label="Dictar"/,`${etapa.tipo}: lectura conserva dictado`);
 for(const marker of new Set(editor.match(/QA_[A-Z_a-z]+/g)))assert.ok(locked.includes(marker),`${etapa.tipo}: contenido perdido en lectura ${marker}`);
 const identificacion=Object.fromEntries(CAMPOS_IDENTIFICACION.map(([key])=>[key,`QA_ID_${key}`]));
 const identity=renderToStaticMarkup(createElement(IdentificacionInformeCampos,{tipo:etapa.tipo,identificacion,disabled:false,onUbicacion:()=>{}}));
 const protectedIdentity=renderToStaticMarkup(createElement(IdentificacionInformeCampos,{tipo:etapa.tipo,identificacion,disabled:true,onUbicacion:()=>{}}));
 for(const value of Object.values(identificacion)){assert.ok(identity.includes(value));assert.ok(protectedIdentity.includes(value));}
 assert.equal((identity.match(/<textarea\b/g)??[]).length,1,'Solo ubicación referencial puede editarse');
 assert.doesNotMatch(protectedIdentity,/<(?:input|textarea|select|button)\b/);
 assert.match(protectedIdentity,/Solo lectura/);
 console.log(`${etapa.tipo}: todos los campos, actividades, dictado y bloqueo de revisión conservados`);
}
const ficha=renderToStaticMarkup(createElement(DatoInforme,{etiqueta:'Obra',value:'Torre heredada'}));
assert.doesNotMatch(ficha,/<(?:input|textarea|select|button)\b/);assert.match(ficha,/Torre heredada/);
const texto=renderToStaticMarkup(createElement(CampoTextoInforme,{etiqueta:'Comentario',value:'Texto conservado',disabled:true,multiline:true,onChange:()=>{}}));
assert.doesNotMatch(texto,/<(?:input|textarea|select|button)\b/);assert.match(texto,/Texto conservado/);
console.log('Datos duros visibles sin teclado ni dictado; textos propios y lectura histórica conservados.');
