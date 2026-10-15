import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {PresupuestosContratista} from '../src/components/contratistas/PresupuestosContratista';
import {EvaluacionesContratista} from '../src/components/contratistas/EvaluacionesContratista';
import {useAccessStore} from '../src/stores/accessStore';
import {bindIdentity} from '../src/security/sessionScope';
import {setCommerceScenario,contractor,tenant,work} from './qa-contractor-commerce-mock';
import '../src/index.css';
bindIdentity('41000000-0000-4000-8000-000000000001');useAccessStore.setState({disponible:true,empresaId:tenant,contexto:{creador:true,empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:true}],obras:[{id:work,tenant_id:tenant,nombre:'Edificio QA',editar:true,administrar:true,ver_costos:true}]}});
function QA(){const [tab,setTab]=useState('presupuestos'),[scenario,setScenario]=useState('uno');return <main style={{maxWidth:1050,margin:'16px auto',padding:16,background:'var(--bg-surface)',borderRadius:10}}><small>Ensayo local · datos ficticios · ninguna llamada a Supabase real</small><h2>Laura Benítez QA · ficha de contratista</h2><div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><button onClick={()=>setTab('presupuestos')}>Presupuestos</button><button onClick={()=>setTab('evaluaciones')}>Evaluaciones</button><label>Cuentas evaluadoras <select aria-label="Escenario de cuentas evaluadoras" value={scenario} onChange={e=>{setScenario(e.target.value);setCommerceScenario(e.target.value);setTab('recarga');queueMicrotask(()=>setTab('evaluaciones'));}}><option value="uno">Una autorizada</option><option value="varios">Varias autorizadas</option><option value="ninguno">Ninguna autorizada</option></select></label></div>{tab==='presupuestos'?<PresupuestosContratista contratistaId={contractor}/>:tab==='evaluaciones'?<EvaluacionesContratista key={scenario} contratistaId={contractor}/>:null}</main>}
createRoot(document.getElementById('root')!).render(<QA/>);
