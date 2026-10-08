import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
await mkdir('tmp/report-editor-tests',{recursive:true});
await writeFile('tmp/report-editor-tests/entry.ts',"export {EtapaCampos} from '../../src/components/informes/EtapaCampos';export {ETAPAS_OT,claveEtapa} from '../../src/services/otStageSchema';");
await build({configFile:false,plugins:[react()],build:{lib:{entry:'tmp/report-editor-tests/entry.ts',formats:['es'],fileName:'fixture'},outDir:'tmp/report-editor-tests',emptyOutDir:false,minify:false,rollupOptions:{external:['react','react/jsx-runtime']}}});
const {EtapaCampos,ETAPAS_OT,claveEtapa}=await import('../tmp/report-editor-tests/fixture.js');
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
 const locked=render(true,true);
 for(const control of locked.match(/<(?:input|textarea|select)\b[^>]*>/g)??[])assert.match(control,/disabled=""/,`${etapa.tipo}: campo congelado editable`);
 console.log(`${etapa.tipo}: todos los campos, actividades, dictado y bloqueo de revisión conservados`);
}
