import {createRoot} from 'react-dom/client';
import Clientes from '../src/components/views/Clientes';
import {Sidebar} from '../src/components/layout/Sidebar';
import {useAccessStore} from '../src/stores/accessStore';
import {bindIdentity} from '../src/security/sessionScope';
import {useState} from 'react';
import {escenarioDirectorioQA} from './qa-client-profiles-mock';
import '../src/index.css';
bindIdentity('30000000-0000-4000-8000-000000000001');
useAccessStore.setState({disponible:true,empresaId:'30000000-0000-4000-8000-000000000010',contexto:{creador:true,empresas:[{id:'30000000-0000-4000-8000-000000000010',nombre:'Empresa QA',rol:'supervisor',puede_crear:true}],obras:[{id:'30000000-0000-4000-8000-000000000020',tenant_id:'30000000-0000-4000-8000-000000000010',nombre:'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}]}});
function Ensayo(){const [escenario,setEscenario]=useState('creador');return <><label>Escenario QA <select aria-label="Escenario QA" value={escenario} onChange={e=>{const value=e.target.value;setEscenario(value);escenarioDirectorioQA(value==='error');useAccessStore.setState({empresaId:value==='empresa'?'':'30000000-0000-4000-8000-000000000010',contexto:{creador:value!=='empresa',empresas:[{id:'30000000-0000-4000-8000-000000000010',nombre:'Empresa QA',rol:'supervisor',puede_crear:true,permisos:['cliente.ver','cliente.crear','cliente.editar','cliente.ubicaciones']}],obras:[{id:'30000000-0000-4000-8000-000000000020',tenant_id:'30000000-0000-4000-8000-000000000010',nombre:'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}]}});}}><option value="creador">Creador</option><option value="empresa">Cuenta de empresa</option><option value="error">Error de lectura</option></select></label><div style={{display:'flex',minWidth:0}}><Sidebar vistaActiva="clientes" onCambiarVista={()=>{}}/><main style={{flex:1,minWidth:0}}><div style={{padding:10,background:'var(--bg-surface)'}}>Plan–OTs · Clientes · ensayo local sin producción</div><Clientes key={escenario}/></main></div></>}
createRoot(document.getElementById('root')!).render(<Ensayo/>);
