import {permissionCatalog,type PermissionDefinition} from './permissionCatalog';
import type {TeamPerson} from '../services/teamService';

export const platformPermissions=new Set(['empresa.crear','empresa.eliminar','auditoria.ver','dashboard.configurar','notificacion.configurar']);
export function effectivePermission(people:TeamPerson[],person:TeamPerson,key:string,delegate=false,seen=new Set<string>()):boolean{
 if(seen.has(person.id)||!person.activo||platformPermissions.has(key))return false;
 const next=new Set([...seen,person.id]),grant=person.permisos.find(p=>p.clave===key);
 if(!grant?.permitido||delegate&&!grant.delegable)return false;
 const read=key.split('.')[0]+'.ver';
 if(key!==read&&permissionCatalog.some(p=>p.key===read)&&!effectivePermission(people,person,read,false,seen))return false;
 if(!person.superior_id)return true;
 const parent=people.find(p=>p.id===person.superior_id);
 return parent?effectivePermission(people,parent,key,true,next):grant.efectivo;
}
export function permissionLock(people:TeamPerson[],person:TeamPerson,definition:PermissionDefinition,canManage:boolean,delegate=false):string{
 const grant=person.permisos.find(p=>p.clave===definition.key);
 if(definition.planned)return 'Próximamente. Este permiso todavía no se puede habilitar.';
 if(platformPermissions.has(definition.key))return 'Reservado a la plataforma; no se asigna a cuentas de empresa.';
 if(!canManage||!person.editable||!grant?.editable)return 'Solo consulta. No tenés permiso para modificar esta persona o acción.';
 // Existing explicit grants can be revoked even if an ancestor no longer delegates them.
 if((delegate||!grant.permitido)&&person.superior_id){const parent=people.find(p=>p.id===person.superior_id);if(parent&&!effectivePermission(people,parent,definition.key,true))return 'El superior no tiene esta acción habilitada y delegable.';}
 if(delegate&&!grant.permitido)return 'Primero habilitá Permitir para esta acción.';
 return '';
}
export function togglePermission(people:TeamPerson[],user:string,key:string,delegate:boolean):TeamPerson[]{
 return people.map(person=>person.id!==user?person:{...person,permisos:person.permisos.map(p=>p.clave!==key?p:delegate?{...p,delegable:!p.delegable}:{...p,permitido:!p.permitido,delegable:p.permitido?false:p.delegable})});
}
export function changedPermissions(base:TeamPerson[],people:TeamPerson[]){
 return people.filter(p=>{const old=base.find(v=>v.id===p.id);return old&&p.permisos.some(g=>{const prev=old.permisos.find(v=>v.clave===g.clave);return prev?.permitido!==g.permitido||prev?.delegable!==g.delegable;});});
}
