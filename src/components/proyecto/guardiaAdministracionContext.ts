import {createContext} from 'react';
export const GuardiaAdministracionContext=createContext<{registrar:(id:string,dirty:boolean,busy:boolean)=>()=>void;solicitar:(accion:()=>void,id?:string)=>void}>({registrar:()=>()=>{},solicitar:accion=>accion()});
