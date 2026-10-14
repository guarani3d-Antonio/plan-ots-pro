import {createRoot} from 'react-dom/client';
import Clientes from '../src/components/views/Clientes';
import {Sidebar} from '../src/components/layout/Sidebar';
import {useAccessStore} from '../src/stores/accessStore';
import {bindIdentity} from '../src/security/sessionScope';
import '../src/index.css';
bindIdentity('30000000-0000-4000-8000-000000000001');
useAccessStore.setState({disponible:true,empresaId:'30000000-0000-4000-8000-000000000010',contexto:{creador:true,empresas:[{id:'30000000-0000-4000-8000-000000000010',nombre:'Empresa QA',rol:'supervisor',puede_crear:true}],obras:[{id:'30000000-0000-4000-8000-000000000020',tenant_id:'30000000-0000-4000-8000-000000000010',nombre:'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}]}});
createRoot(document.getElementById('root')!).render(<div style={{display:'flex',minWidth:0}}><Sidebar vistaActiva="clientes" onCambiarVista={()=>{}}/><main style={{flex:1,minWidth:0}}><div style={{padding:10,background:'var(--bg-surface)'}}>Plan–OTs · Clientes · ensayo local sin producción</div><Clientes/></main></div>);
