// PDF artifact renderer only: isolated temporary Chromium, synthetic HTML,
// no user profile/session, no external requests and no interaction with live apps.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {opcionesPdfDocumento} from '../supabase/functions/_shared/document-pdf-options.mjs';
const require=createRequire('C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const dir='output/branding-documents-20261016';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith('data:')?route.continue():route.abort());
 const page=await context.newPage(),types=['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta','cierre_largo'],result=[];
 for(let n=0;n<types.length;n++){
  const html=await readFile(`tmp/pdfs/controlado-${n+1}.html`,'utf8');
  if(!html.includes('OT-PRUEBA')||!html.includes('data-company-brand="true"'))throw Error('Solo se admiten los expedientes sintéticos de QA');
  await page.setContent(html,{waitUntil:'load'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const path=`${dir}/informe-${types[n]}.pdf`;await page.pdf({path,...opcionesPdfDocumento('POT-2026-OS-00000001',0,{empresa:'Emisor de prueba <literal>'})});
  result.push({tipo:types[n],path,bytes:(await readFile(path)).length});
 }
 await writeFile(`${dir}/informes-renderizados.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
