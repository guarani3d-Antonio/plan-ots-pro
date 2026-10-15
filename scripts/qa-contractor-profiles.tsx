import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import Contratistas from '../src/components/views/Contratistas';
import {Sidebar} from '../src/components/layout/Sidebar';
import {useAccessStore} from '../src/stores/accessStore';
import {bindIdentity} from '../src/security/sessionScope';
import {escenarioContratistasQA} from './qa-contractor-profiles-mock';
import '../src/index.css';
bindIdentity('41000000-0000-4000-8000-000000000001');
const tenant='41000000-0000-4000-8000-000000000010',work='41000000-0000-4000-8000-000000000020';
function scenario(value:string){escenarioContratistasQA(value==='error');useAccessStore.setState({disponible:true,empresaId:value==='empresa'?'':tenant,contexto:{creador:value!=='empresa',empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:true,permisos:['contratista.ver','contratista.crear','contratista.editar']}],obras:[{id:work,tenant_id:tenant,nombre:'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}]}})}
scenario('creador');
function QA(){const [mode,setMode]=useState('creador');return <><label>Escenario QA <select aria-label="Escenario QA" value={mode} onChange={e=>{setMode(e.target.value);scenario(e.target.value)}}><option value="creador">Creador</option><option value="empresa">Cuenta de empresa</option><option value="error">Error de lectura</option></select></label><div style={{display:'flex',minWidth:0}}><Sidebar vistaActiva="contratistas" onCambiarVista={()=>{}}/><main style={{flex:1,minWidth:0}}><div style={{padding:10,background:'var(--bg-surface)'}}>Plan-OTs · Contratistas · ensayo local con datos ficticios</div><Contratistas key={mode}/></main></div></>}
createRoot(document.getElementById('root')!).render(<QA/>);
