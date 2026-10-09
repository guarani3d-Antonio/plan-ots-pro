export const normalizarBusqueda=(valor:string)=>valor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
export function coincideBusqueda(valor:string,consulta:string){const texto=normalizarBusqueda(valor);return normalizarBusqueda(consulta).split(/\s+/).filter(Boolean).every(palabra=>texto.includes(palabra));}
