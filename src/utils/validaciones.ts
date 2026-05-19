import type { EstadoOT } from '../types/orden';

interface ResultadoValidacion {
  valido: boolean;
  errores: string[];
  antesOk: boolean;
  duranteOk: boolean;
  despuesOk: boolean;
  antesRequerida: boolean;
  duranteRequerida: boolean;
  despuesRequerida: boolean;
}

export function validarFotosParaEstado(
  fotosAntes: unknown[],
  fotosDurante: unknown[],
  fotosDespues: unknown[],
  estadoDestino: EstadoOT
): ResultadoValidacion {
  const reglas: Record<EstadoOT, { antes: boolean; durante: boolean; despues: boolean }> = {
    'Pendiente':  { antes: true,  durante: false, despues: false },
    'En proceso': { antes: true,  durante: true,  despues: false },
    'Cerrada':    { antes: true,  durante: true,  despues: true  },
    'No aplica':  { antes: false, durante: false, despues: false },
  };

  const r = reglas[estadoDestino];
  const errores: string[] = [];

  const antesOk   = !r.antes   || fotosAntes.length >= 1;
  const duranteOk = !r.durante || fotosDurante.length >= 1;
  const despuesOk = !r.despues || fotosDespues.length >= 1;

  if (!antesOk)   errores.push('Se requiere al menos 1 foto ANTES');
  if (!duranteOk) errores.push('Se requiere al menos 1 foto DURANTE');
  if (!despuesOk) errores.push('Se requiere al menos 1 foto DESPUÉS');

  return {
    valido: errores.length === 0,
    errores,
    antesOk, duranteOk, despuesOk,
    antesRequerida: r.antes,
    duranteRequerida: r.durante,
    despuesRequerida: r.despues,
  };
}

// Transiciones válidas entre estados
export function esTransicionValida(
  estadoActual: EstadoOT,
  estadoDestino: EstadoOT
): { valida: boolean; razon?: string } {
  if (estadoActual === estadoDestino) return { valida: true };
  // Toda transición hacia 'No aplica' siempre permitida
  if (estadoDestino === 'No aplica') return { valida: true };
  // Desde 'No aplica' se aplican las reglas del destino (validación de fotos)
  return { valida: true };
}