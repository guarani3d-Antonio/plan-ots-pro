// Bloques menores al límite habitual de PostgREST. Verificar la sesión también
// después de cada respuesta evita publicar resultados de una cuenta anterior.
export async function leerPaginas<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
  vigente: () => void = () => {},
  progress: (count: number) => void = () => {},
  size = 500,
): Promise<T[]> {
  const result: T[] = [];
  let expected: number | undefined;
  for (let from = 0; ;) {
    vigente();
    const { data, error, count } = await fetchPage(from, from + size - 1);
    vigente();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('El servidor no devolvió la lista solicitada.');
    if (typeof count === 'number') expected = count;
    result.push(...data); progress(result.length);
    if (expected !== undefined ? result.length >= expected : data.length < size) return result;
    if (!data.length) throw new Error('La lista cambió durante la carga. Actualizá para consultar el conjunto completo.');
    // PostgREST puede imponer un cupo inferior al bloque solicitado.
    from += data.length;
  }
}
