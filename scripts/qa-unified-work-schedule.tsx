// Local interaction fixture for the real React components. No RPC or production records.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EtapaCampos} from '../src/components/informes/EtapaCampos';
import {VistaPreviaDocumento} from '../src/components/informes/VistaPreviaDocumento';
import {generarInformeRelevamiento,type DatosRelevamiento} from '../src/services/reportService';
import {camposVacios,validarEtapa} from '../src/services/otStageSchema';
import {cronogramaDesdeActividades} from '../src/services/workScheduleActivities';
import {recalcularCronograma,serializarCronograma,periodoCronograma} from '../src/services/workScheduleModel';
import type {ItemAlcance} from '../src/services/reportService';
import type {OrdenLocal} from '../src/types/orden';
import '../src/index.css';
const fuente={rubro:'Albañilería',contratistas:['Contratista de prueba']};
const items:ItemAlcance[]=[{id:'A-01',trabajo:'Limpieza del sector',criterio:'Sin residuos'},{id:'A-02',trabajo:'Reparación de fisura',criterio:'Terminación prolija'},{id:'A-03',trabajo:'Refuerzo de fundación',criterio:'Comprobación técnica'}];
const fresh=():Record<string,unknown>=>({observaciones:'Diagnóstico de ensayo.',itemsAlcance:items,relevamiento:{...camposVacios('relevamiento'),inicioPrevisto:'2026-10-15',finPrevisto:'2026-10-19'}});
function fixture(long=false,legacy=false){const joined=cronogramaDesdeActividades(items,'2026-10-15',fuente),c=joined.cronograma;c.incluirMatriz=true;c.trabajos[1].relaciones=[{predecesora:1,tipo:'FI',desfase:0}];c.trabajos[2].relaciones=[{predecesora:2,tipo:'FI',desfase:0}];c.trabajos[2].fin=long?'2026-12-21':'2026-10-17';const next=recalcularCronograma(c),p=periodoCronograma(next)!;if(legacy){delete next.unificado;next.trabajos.forEach(t=>delete t.actividadId);next.trabajos[1].nombre='Fisura de la otra lista';}return {...fresh(),itemsAlcance:joined.actividades,relevamiento:{...camposVacios('relevamiento'),cronogramaJSON:serializarCronograma(next),inicioPrevisto:p.inicio,finPrevisto:p.fin,fechaLimitePrevista:p.fin}};}
const order={ot:'OT-QA',descripcion:'Reparar la fundación.',fecha_ingreso:'2026-10-14',estado:'En proceso',prioridad:'Media',rubro:fuente.rubro,contratistas:fuente.contratistas,obra:'Obra de prueba',responsable:'Técnico QA',campos:{},pos_x:null,pos_y:null} as unknown as OrdenLocal;
function QA(){const [datos,setDatos]=useState<Record<string,unknown>>(fresh),[frozen,setFrozen]=useState(false),[preview,setPreview]=useState(false),[expanded,setExpanded]=useState(false),[generation,setGeneration]=useState(0),[message,setMessage]=useState('Ensayo local · no modifica producción');
 const load=(long=false,legacy=false)=>{setDatos(fixture(long,legacy));setGeneration(g=>g+1);setFrozen(false);};
 const pointer=(el:Element,type:string,x:number,y:number,buttons:number)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,buttons,button:0,pointerType:'touch',pointerId:7,isPrimary:true}));
 const drag=()=>{const bar=document.querySelector<HTMLElement>('[data-trabajo="1"]');if(!bar)return;const r=bar.getBoundingClientRect();pointer(bar,'pointerdown',r.x+5,r.y+12,1);pointer(bar,'pointermove',r.x+5+r.width*2,r.y+12,1);pointer(bar,'pointerup',r.x+5+r.width*2,r.y+12,0);setMessage('Arrastre de dedo simulado +2 días');};
 const draw=()=>{const chart=document.querySelector<HTMLElement>('[aria-label="Gantt de trabajos"]');if(!chart)return;const r=chart.getBoundingClientRect();pointer(chart,'pointerdown',r.x+100,r.bottom-24,1);pointer(chart,'pointermove',r.x+180,r.bottom-24,1);pointer(chart,'pointerup',r.x+180,r.bottom-24,0);};
 const arrow=()=>{const a=document.querySelector<HTMLElement>('[data-extremo="F"][data-trabajo="1"]'),b=document.querySelector<HTMLElement>('[data-extremo="I"][data-trabajo="3"]');if(!a||!b)return;const r=a.getBoundingClientRect(),s=b.getBoundingClientRect();pointer(a,'pointerdown',r.x+r.width/2,r.y+r.height/2,1);pointer(a,'pointermove',s.x+s.width/2,s.y+s.height/2,1);pointer(a,'pointerup',s.x+s.width/2,s.y+s.height/2,0);};
 const html=preview?generarInformeRelevamiento(order,String(datos.observaciones??''),[],datos.relevamiento as DatosRelevamiento,undefined,datos.itemsAlcance as ItemAlcance[]):'';
 return <main style={{maxWidth:1040,margin:'12px auto',padding:12}}><h2>Relevamiento (Plan de Trabajo) · ensayo real</h2><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><button onClick={()=>load()}>Cargar plan compacto</button><button onClick={()=>load(true)}>Cargar plan largo</button><button onClick={()=>load(false,true)}>Cargar listas anteriores</button><label><input type="checkbox" checked={frozen} onChange={e=>setFrozen(e.target.checked)}/>Versión conservada</label><button onClick={()=>setPreview(!preview)}>Ver informe de ensayo</button><button onClick={()=>setMessage(validarEtapa('relevamiento',datos)||'Plan válido para guardar')}>Validar guardado</button></div>
 <EtapaCampos key={generation} scopeKey={String(generation)} tipo="relevamiento" datos={datos} fuenteReclamo={fuente} disabled={frozen} onChange={d=>{setDatos(d);setMessage('Borrador sincronizado en memoria');}}/>
 {preview&&<div style={{height:780}}><VistaPreviaDocumento html={html} pdfUrl={null} ampliada={expanded} onAmpliar={()=>setExpanded(!expanded)} titulo="Informe de ensayo"/></div>}
 <details><summary>Datos de prueba</summary><pre aria-label="Datos sincronizados" style={{fontSize:12,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(datos,null,2)}</pre></details><p role="status">{message}</p>
 <div style={{position:'fixed',zIndex:2300,bottom:2,left:2,right:2,background:'var(--bg-surface)',border:'1px solid var(--border-default)',padding:5,display:'flex',gap:6,flexWrap:'wrap'}}><button onClick={drag}>Ensayar dedo +2 días</button><button onClick={draw}>Ensayar dibujo</button><button onClick={arrow}>Ensayar flecha</button></div></main>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
