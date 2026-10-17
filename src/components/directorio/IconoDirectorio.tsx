import type {CategoriaDirectorio} from '../../services/directoryNavigationModel';
export function IconoDirectorio({tipo}:{tipo:CategoriaDirectorio|'directorio'|'empresa'|'flecha'|'volver'}){
 const paths={
  directorio:<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M6 9h5M6 13h5M6 17h5"/><circle cx="16" cy="10" r="1.5"/><path d="M13 16a3 3 0 0 1 6 0"/></>,
  clientes:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5 17a4 4 0 0 1 8 0M16 9h2M16 13h2"/></>,
  responsables:<><path d="M3 16h18M5 16v-3a7 7 0 0 1 14 0v3M10 8V4h4v4M3 16v3h18v-3"/></>,
  contratistas:<><path d="M4 21V5h10v16M14 10h6v11M2 21h20M8 9h2M8 13h2M8 17h2M17 14h1M17 18h1"/></>,
  contactos:<><rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4"/><circle cx="13" cy="9" r="2"/><path d="M9 17a4 4 0 0 1 8 0"/></>,
  empresa:<><path d="M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4"/></>,
  flecha:<path d="M5 12h14m-5-5 5 5-5 5"/>,volver:<path d="M19 12H5m5-5-5 5 5 5"/>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[tipo]}</svg>;
}
