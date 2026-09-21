import { useProyectosStore } from '../stores/proyectosStore';
import { useAccessStore, usePermisoObra } from '../stores/accessStore';
export function usePuedeVerCostos(proyectoId?:string|null):boolean {
  const active=useProyectosStore(s=>s.proyectoActivo?.id);
  return !!usePermisoObra(proyectoId??active)?.ver_costos;
}
export function usePuedeVerCostosMultiple(ids:string[]):boolean {
  const {contexto,disponible}=useAccessStore();
  return disponible&&ids.length>0&&ids.every(id=>contexto?.obras.find(p=>p.id===id)?.ver_costos===true);
}
