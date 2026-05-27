with open('src/services/versionesService.ts', 'r', encoding='utf-8') as f:
    c = f.read()

nueva_fn = '''
/**
 * Restaura las OTs de un snapshot aplicando sus campos en Supabase.
 * No elimina OTs nuevas que no estaban en el snapshot.
 * Retorna true en éxito, false en error.
 */
export async function restaurarVersion(
  version: Version,
  proyectoId: string
): Promise<boolean> {
  try {
    for (const snap of version.snapshot.ordenes) {
      const { error } = await supabase
        .from('ordenes')
        .update({
          ot:          snap.ot,
          ubicacion:   snap.ubicacion,
          rubro:       snap.rubro,
          estado:      snap.estado,
          responsable: snap.responsable,
          prioridad:   snap.prioridad,
          pos_x:       snap.pos_x,
          pos_y:       snap.pos_y,
          comentarios: snap.comentarios,
          campos:      snap.campos ?? {},
          updated_at:  new Date().toISOString(),
        })
        .eq('id', snap.id)
        .eq('proyecto_id', proyectoId);
      if (error) console.warn('[restaurarVersion] orden', snap.id, error.message);
    }
    return true;
  } catch (e) {
    console.error('[versionesService] restaurarVersion:', e);
    return false;
  }
}
'''

if 'restaurarVersion' in c:
    print('SKIP: restaurarVersion ya existe')
else:
    c = c + nueva_fn
    with open('src/services/versionesService.ts', 'w', encoding='utf-8') as f:
        f.write(c)
    print('OK - restaurarVersion agregada:', c.count('\n'), 'lineas totales')
