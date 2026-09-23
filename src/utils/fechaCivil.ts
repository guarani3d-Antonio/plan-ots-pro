/** Fecha de calendario, sin conversión UTC. Los timestamps conservan su zona. */
export function fechaCivil(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function fechaLocalHoy(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

export function diasEntreFechasCiviles(inicio: string, fin: string): number {
  const a = inicio.slice(0, 10).split('-').map(Number);
  const b = fin.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

export function fechaParaMostrar(iso: string | null | undefined, opciones: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '—';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? fechaCivil(iso) : new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric', ...opciones,
  });
}
