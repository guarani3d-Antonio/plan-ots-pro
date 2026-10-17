import {createContext,useContext,useEffect,useState} from 'react';
import {unirObrasDirectorio,type ObraFiltroDirectorio} from '../../services/directoryNavigationModel';

export interface FiltroObraCompartido {
 obra:string;
 obras:ObraFiltroDirectorio[];
 cambiar:(id:string)=>void;
 registrar:(obras:readonly ObraFiltroDirectorio[])=>void;
}
export const FiltroObraDirectorioContext=createContext<FiltroObraCompartido|null>(null);

/** Conserva el filtro común incluso si la nueva categoría no tiene fichas en esa obra. */
export function useFiltroObraDirectorio(locales:readonly ObraFiltroDirectorio[]){
 const compartido=useContext(FiltroObraDirectorioContext),[local,setLocal]=useState('');
 const registrar=compartido?.registrar;
 useEffect(()=>{registrar?.(locales)},[registrar,locales]);
 return {obras:unirObrasDirectorio(compartido?.obras??[],locales),
  obra:compartido?compartido.obra:locales.some(([id])=>id===local)?local:'',
  setObra:compartido?compartido.cambiar:setLocal};
}
