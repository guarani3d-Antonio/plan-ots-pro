import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import Contratistas from '../src/components/views/Contratistas';
import {ListadoContratistas} from '../src/components/contratistas/ListadoContratistas';
import {bindIdentity} from '../src/security/sessionScope';
import {useAccessStore} from '../src/stores/accessStore';
import {tenant,work,contractor} from './qa-contractor-commerce-mock';
import '../src/index.css';
bindIdentity('41000000-0000-4000-8000-000000000001');
useAccessStore.setState({disponible:true,empresaId:tenant,contexto:{creador:true,empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:true}],obras:[{id:work,tenant_id:tenant,nombre:'Edificio QA',editar:true,administrar:true,ver_costos:true}]}});
const rows=[{id:contractor,tenant_id:tenant,datos:{nombre:'Contratista QA'},completa:false,codigo:null,actualizado_en:null,vinculos:[],obras:[],indicadores:{total:2,abiertas:1,ultima:null}}];
function QA(){const[visible,setVisible]=useState(true),[refresh,setRefresh]=useState(false);return <main style={{padding:12}}>
 <p>Ensayo local · datos ficticios · lecturas demoradas 1,8 s · sin acceso a producción</p>
 <button onClick={()=>setVisible(v=>!v)}>{visible?'Otra sección':'Volver a Contratistas'}</button>
 {visible?<Contratistas/>:<p>Otra sección de prueba</p>}
 <hr/><h3>Actualización del mismo directorio</h3><button onClick={()=>setRefresh(v=>!v)}>Alternar actualización</button>
 <ListadoContratistas registros={rows} cargando={refresh} error="" puedeCrear={false} onCrear={()=>{}} onVer={()=>{}} onReintentar={()=>{}}/>
 </main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('narrow')?<iframe title="Ensayo a 320 px" src="/scripts/qa-directory-transitions.html?frame=1" style={{width:320,height:900,border:0}}/>:<QA/>);
