import type {ContextoAcceso} from '../stores/accessStore';
import type {ClienteDirectorio} from './customerProfileService';
import {lugarCliente} from './customerProfileModel';

export function empresaDirectorio(contexto:ContextoAcceso|null,seleccion:string):string {
 if(!contexto)return '';
 const empresas=contexto.empresas.filter(e=>contexto.creador||e.permisos?.includes('cliente.ver'));
 if(empresas.some(e=>e.id===seleccion))return seleccion;
 return !contexto.creador&&empresas.length===1?empresas[0].id:'';
}
const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
export function filtrarDirectorioClientes(clientes:ClienteDirectorio[],buscar:string,obra:string,estado:string){
 const query=norm(buscar);
 return clientes.filter(c=>
  (obra==='todos'||c.ubicaciones.some(u=>u.obra_id===obra))&&
  (estado==='todos'||estado==='activos'&&c.datos.activo!==false||estado==='inactivos'&&c.datos.activo===false||estado==='abiertas'&&c.indicadores.abiertas>0)&&
  norm([c.datos.nombre,c.datos.razon_social,c.datos.identificacion,c.datos.telefono,c.datos.correo,
    ...c.ubicaciones.map(u=>lugarCliente(u)+' '+(u.direccion??''))].filter(Boolean).join(' ')).includes(query)
 );
}
