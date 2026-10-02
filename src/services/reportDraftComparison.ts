// PostgreSQL jsonb reordena claves. Ese cambio no es una edición del usuario.
export function contenidoBorrador(valor: unknown): string {
  return JSON.stringify(valor, (_clave, dato) =>
    dato && typeof dato === 'object' && !Array.isArray(dato)
      ? Object.fromEntries(Object.keys(dato).sort().map(clave => [clave, dato[clave]]))
      : dato);
}

export function borradorModificado(guardado: string | null, actual: unknown): boolean {
  if (!guardado) return true;
  return contenidoBorrador(JSON.parse(guardado)) !== contenidoBorrador(actual);
}
