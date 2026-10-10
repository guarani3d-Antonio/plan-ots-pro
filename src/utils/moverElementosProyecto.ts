export interface CarpetaMovimiento { id: string; tenant_id: string; padre_id: string | null; profundidad: number }
export type ElementoMovimiento = {
  tipo: 'proyecto' | 'carpeta'; id: string; tenant_id: string; nombre: string; origen: string | null;
};

export function restriccionesCarpeta(carpetas: CarpetaMovimiento[], id: string) {
  const prohibidos = new Set<string>([id]);
  let nivel = [id];
  let altura = 1;
  while (nivel.length) {
    const hijos = carpetas.filter(c => c.padre_id && nivel.includes(c.padre_id) && !prohibidos.has(c.id));
    if (!hijos.length) break;
    hijos.forEach(c => prohibidos.add(c.id));
    nivel = hijos.map(c => c.id);
    altura++;
  }
  return { prohibidos, altura };
}

/** La base vuelve a validar permisos y estructura antes de guardar. */
export function errorDestinoMovimiento(elemento: ElementoMovimiento, destinoId: string | null, carpetas: CarpetaMovimiento[]): string | null {
  if (!elemento.tenant_id) return 'El elemento debe estar vinculado a una empresa.';
  if (elemento.origen === destinoId) return 'El elemento ya está en esta carpeta.';
  const destino = destinoId ? carpetas.find(c => c.id === destinoId) : null;
  if (destinoId && !destino) return 'La carpeta de destino ya no está disponible.';
  if (destino && destino.tenant_id !== elemento.tenant_id) return 'El destino debe pertenecer a la misma empresa.';
  if (elemento.tipo === 'carpeta') {
    const { prohibidos, altura } = restriccionesCarpeta(carpetas, elemento.id);
    if (destinoId && prohibidos.has(destinoId)) return 'No se puede mover una carpeta dentro de sí misma o de sus subcarpetas.';
    if ((destino?.profundidad ?? 0) + altura > 5) return 'El movimiento superaría los cinco niveles de carpetas.';
  }
  return null;
}
