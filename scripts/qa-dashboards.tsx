import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { DashboardWorkspace } from '../src/components/dashboard/PersonalDashboard';
import { bindIdentity } from '../src/security/sessionScope';
import { loadDashboardData } from '../src/services/dashboardDataService';
import { loadPersonalDashboards, savePersonalDashboards } from '../src/services/personalDashboardService';
import { simulateFailure, simulateConflict } from './qa-dashboards-mock';
import { proyectos, tenant } from './qa-grid-local-mock';
import { useAccessStore } from '../src/stores/accessStore';
import { useAuthStore } from '../src/stores/authStore';
import '../src/index.css';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
function identity(id:string){bindIdentity(id);useAuthStore.setState({user:{id} as never,loading:false});}
identity(ids[0]);
useAccessStore.setState({disponible:true,contexto:{creador:true,empresas:[{id:tenant,nombre:'Empresa ficticia QA',rol:'supervisor',puede_crear:true}],obras:proyectos.map(p=>({id:p.id,tenant_id:tenant,nombre:p.nombre,editar:false,administrar:false,ver_costos:false}))}});
// Defensa adicional: incluso un transporte accidental queda confinado al origen local.
const originalFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:input,location.href);if(url.origin!==location.origin)throw Error('Red externa bloqueada en ensayo ficticio');return originalFetch(input,init)};
const services={data:loadDashboardData,load:loadPersonalDashboards,save:savePersonalDashboards};
function QA(){
 const [account,setAccount]=useState(ids[0]);
 const width=Number(new URLSearchParams(location.search).get('width'))||0;
 return <div style={{width:width||'100%',maxWidth:'100%',margin:'auto',height:'100dvh',display:'flex',flexDirection:'column',overflow:'hidden',containerType:'inline-size'}}>
  <header style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'8px 20px',background:'white',borderBottom:'1px solid #dce1eb',fontSize:12}}><strong>Plan-OTs · ensayo local</strong><span>1350 OT ficticias · sin conexión real</span><label>Cuenta de prueba <select value={account} onChange={e=>{identity(e.target.value);setAccount(e.target.value)}}><option value={ids[0]}>Cuenta A</option><option value={ids[1]}>Cuenta B</option></select></label><button onClick={simulateFailure}>Fallar próximo guardado</button><button onClick={simulateConflict}>Simular otra ventana</button></header>
  <DashboardWorkspace key={account} userId={account} services={services}/>
 </div>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
