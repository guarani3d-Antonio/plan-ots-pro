import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {VistaGrilla} from '../src/components/grilla/VistaGrilla';
import {bindIdentity} from '../src/security/sessionScope';
import {useAccessStore} from '../src/stores/accessStore';
import {useAuthStore} from '../src/stores/authStore';
import {proyectos,user,tenant} from './qa-grid-local-mock';
import '../src/index.css';
bindIdentity(user);
useAuthStore.setState({user:{id:user} as never,loading:false});
useAccessStore.setState({disponible:true,contexto:{creador:true,empresas:[{id:tenant,nombre:'Empresa ficticia QA',rol:'supervisor',puede_crear:true}],obras:proyectos.map(p=>({id:p.id,tenant_id:tenant,nombre:p.nombre,editar:true,administrar:true,ver_costos:true}))}});
history.replaceState({planots:true,vista:'grilla',proyectoId:null},'');
function QA(){const [show,setShow]=useState(true);return <div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><header style={{padding:'6px 16px',display:'flex',alignItems:'center',gap:12,background:'white',borderBottom:'1px solid #dce1eb'}}><strong>Plan-OTs · ensayo local</strong><small>1350 OT ficticias · conexión real sustituida</small><button onClick={()=>setShow(v=>!v)}>{show?'Salir de la grilla':'Volver a la grilla'}</button><button onClick={()=>history.back()}>Atrás de prueba</button><button onClick={()=>history.forward()}>Adelante de prueba</button></header>{show?<VistaGrilla/>:<main>Otro módulo ficticio</main>}</div>}
createRoot(document.getElementById('root')!).render(<QA/>);
