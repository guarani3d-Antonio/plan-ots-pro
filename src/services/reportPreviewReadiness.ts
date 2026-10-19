type DependenciaVista = {
  clave: string;
  claveCargada: string | null;
  cargando?: boolean;
  error?: string | null;
};

type PreparacionVista =
  | { estado: 'cargando' | 'error'; mensaje: string }
  | { estado: 'lista'; mensaje: null };

/** Esperar las lecturas de la revisión no equivale a un fallo del renderizador. */
export function preparacionVistaInforme({ cargandoDatos, errorDatos, firmas, marca }: {
  cargandoDatos: boolean;
  errorDatos: string | null;
  firmas?: DependenciaVista;
  marca?: DependenciaVista;
}): PreparacionVista {
  if (cargandoDatos) return { estado: 'cargando', mensaje: 'Recuperando el informe guardado…' };
  if (errorDatos) return { estado: 'error', mensaje: errorDatos };
  if (firmas?.error) return { estado: 'error', mensaje: firmas.error };
  if (marca?.clave === marca?.claveCargada && marca?.error) return { estado: 'error', mensaje: marca.error };
  // La clave también cubre el primer render anterior a que arranque el efecto de lectura.
  if (firmas && (firmas.cargando || firmas.claveCargada !== firmas.clave)) {
    return { estado: 'cargando', mensaje: 'Consultando las firmas conservadas de esta versión…' };
  }
  if (marca && marca.claveCargada !== marca.clave) {
    return { estado: 'cargando', mensaje: 'Cargando el logo de la empresa…' };
  }
  return { estado: 'lista', mensaje: null };
}
