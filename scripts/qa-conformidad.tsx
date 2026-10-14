// Local-only real component test. Vite QA config replaces RPCs with memory fixtures.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConformidadCliente} from '../src/components/informes/ConformidadCliente';
import {leerConformidad,validarConformidad} from '../src/services/customerConformityModel';
import {setRevision} from './qa-conformidad-service';
import '../src/index.css';
const initial={id:'20000000-0000-4000-8000-000000000050',documento_id:'20000000-0000-4000-8000-000000000051',revision:1,borrador_version:1,datos:{},motivo:null,esquema_version:1,plantilla_version:'expediente-controlado-2026-10-13-conformidad',contenido_sha256:'a'.repeat(64),creada_por:'QA',creada_en:'2026-10-13T12:00:00Z'};
function QA(){const [datos,setDatos]=useState<Record<string,unknown>>({acta:{receptor:'Cliente QA'}}),[revision,setSaved]=useState<typeof initial|undefined>(),[notice,setNotice]=useState('Datos ficticios · sin llamadas a producción');
 const draw=async()=>{const c=document.querySelector('canvas');if(!c)return;const r=c.getBoundingClientRect();const emit=(name:string,x:number,y:number,buttons:number)=>{(name==='pointerdown'?c:window).dispatchEvent(new PointerEvent(name,{bubbles:true,cancelable:true,clientX:r.left+x,clientY:r.top+y,buttons,button:0,pointerType:'touch',pointerId:7,pressure:buttons?.5:0,isPrimary:true}));};emit('pointerdown',20,50,1);for(let x=25;x<180;x+=9){await new Promise(resolve=>setTimeout(resolve,18));emit('pointermove',x,50+x%40,1);}emit('pointerup',175,75,0);setNotice('Trazo sintético de dedo realizado');};
 return <main style={{maxWidth:820,margin:'20px auto',padding:16}}><h2>Panel OT · acta de prueba</h2><ConformidadCliente datos={datos} onChange={setDatos} revision={revision} codigo="POT-QA-ACT-1" proyecto="QA" editable={!revision} blocked={false} vigente={!!revision} responsable="Técnico QA" onGuardar={async()=>{const error=validarConformidad(datos);if(error){setNotice(error);return;}const saved={...initial,datos:structuredClone(datos)};setRevision(saved,leerConformidad(datos.acta));setSaved(saved);setNotice('Versión guardada en memoria');}}/><div style={{position:'fixed',bottom:8,left:8,zIndex:1700,background:'white',border:'1px solid #bbb',padding:8,display:'flex',gap:8}}><button onClick={()=>void draw()}>Ensayar dedo sintético</button><span role="status">{notice}</span></div></main>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
