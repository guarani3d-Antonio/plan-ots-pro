import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { Sidebar, type Vista } from '../../src/components/layout/Sidebar';
import { ApplicationTopBar } from '../../src/components/layout/ApplicationTopBar';
import { AsistenteFlotante } from '../../src/components/asistente/AsistenteFlotante';
import { MiAsistente } from '../../src/components/asistente/MiAsistente';
import { useAuthStore } from '../../src/stores/authStore';
import { useAccessStore } from '../../src/stores/accessStore';
import { bindIdentity } from '../../src/security/sessionScope';
const uid='13000000-0000-4000-8000-000000000099';
bindIdentity(uid);
useAuthStore.setState({loading:false,user:{id:uid,email:'usuario-qa@example.invalid',user_metadata:{nombre:'Usuario QA'}} as never});
useAccessStore.setState({disponible:true,empresaId:'qa-a',contexto:{creador:true,empresas:[{id:'qa-a',nombre:'Empresa de prueba local',rol:'administrador',puede_crear:true}],obras:[]}});
function Fixture(){
 const [view,setView]=useState<Vista>('proyectos');
 return <div style={{display:'flex',width:'100%',height:'100dvh'}}><Sidebar vistaActiva={view} onCambiarVista={setView}/><main style={{flex:1,minWidth:0,overflow:'auto'}}><ApplicationTopBar vista={view}/>{view==='asistente'?<MiAsistente/>:<div style={{padding:24}}><h1>{view==='dashboard'?'Dashboard':'Mis proyectos'}</h1><p>Prueba local de los componentes reales. Sin API ni datos de usuarios.</p><label>Campo de trabajo<input id="qa-work" style={{display:'block',width:'100%',padding:10}} defaultValue="Contenido conservado"/></label></div>}<div style={{padding:12}}><button id="qa-switch-scope" onClick={()=>useAccessStore.setState({empresaId:'qa-b'})}>Cambiar empresa de prueba</button><button id="qa-offline" onClick={()=>useAccessStore.setState({disponible:false})}>Simular sesión no disponible</button></div></main><AsistenteFlotante onCommand={c=>{if(c.kind==='navigate'){setView(c.destination);return 'Sección abierta.';}return 'Comando local reconocido.';}}/></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
