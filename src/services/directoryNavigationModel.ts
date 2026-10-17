import type {ContextoAcceso} from '../stores/accessStore';

export const categoriasDirectorio = [
 {id:'clientes',nombre:'Clientes',permiso:'cliente.ver',descripcion:'Datos, unidades, reclamos y encuestas.'},
 {id:'responsables',nombre:'Responsables / Técnicos',corto:'Responsables',permiso:'equipo.ver',descripcion:'Cuentas del equipo, OT e indicadores.'},
 {id:'contratistas',nombre:'Contratistas',permiso:'contratista.ver',descripcion:'Trabajos, presupuestos y evaluaciones.'},
 {id:'contactos',nombre:'Contactos',permiso:'contacto.ver',descripcion:'Personas de contacto de cada obra.',proxima:true},
] as const;
export type CategoriaDirectorio = typeof categoriasDirectorio[number]['id'];
export type ObraFiltroDirectorio = readonly [id:string,nombre:string];

export function puedeVerDirectorio(contexto:ContextoAcceso|null,tenant?:string,categoria?:CategoriaDirectorio):boolean {
 if(!contexto)return false;
 if(contexto.creador)return !tenant||contexto.empresas.some(e=>e.id===tenant);
 const claves=categoria?[categoriasDirectorio.find(c=>c.id===categoria)!.permiso]:categoriasDirectorio.map(c=>c.permiso);
 return contexto.empresas.some(e=>(!tenant||e.id===tenant)&&claves.some(k=>e.permisos?.includes(k)));
}

export function empresaDelDirectorio(contexto:ContextoAcceso|null,seleccion:string):string {
 if(!contexto)return '';
 // El alcance nunca se infiere de los registros o de la primera empresa de la lista.
 if(contexto.empresas.some(e=>e.id===seleccion))return seleccion;
 return !contexto.creador&&contexto.empresas.length===1?contexto.empresas[0].id:'';
}

export function unirObrasDirectorio(...listas:ReadonlyArray<readonly ObraFiltroDirectorio[]>):ObraFiltroDirectorio[] {
 return [...new Map(listas.flat().filter(([id,nombre])=>id&&nombre)).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'));
}
