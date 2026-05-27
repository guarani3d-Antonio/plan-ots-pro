with open('src/components/plano/VistaPlano.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

original = c  # para verificar cambios

# ─── 1. Imports ───────────────────────────────────────────────────────────────
OLD_IMPORT = "import InformePanel from '../informes/InformePanel';"
NEW_IMPORT = """import InformePanel from '../informes/InformePanel';
import { ModalVersiones } from './ModalVersiones';
import type { Version } from '../../services/versionesService';
import { guardarVersion, restaurarVersion } from '../../services/versionesService';"""

if 'ModalVersiones' not in c:
    c = c.replace(OLD_IMPORT, NEW_IMPORT, 1)
    print('  [1] imports OK')
else:
    print('  [1] imports ya existen - SKIP')

# ─── 2. Estado modalVersionesAbierto ──────────────────────────────────────────
OLD_STATE = "  const [mostrarInforme, setMostrarInforme] = useState(false);"
NEW_STATE = """  const [mostrarInforme, setMostrarInforme]           = useState(false);
  const [modalVersionesAbierto, setModalVersionesAbierto] = useState(false);"""

if 'modalVersionesAbierto' not in c:
    c = c.replace(OLD_STATE, NEW_STATE, 1)
    print('  [2] estado OK')
else:
    print('  [2] estado ya existe - SKIP')

# ─── 3. Reemplazar onClick del botón Versión ──────────────────────────────────
OLD_CLICK = "              onClick={acciones.abrirGuardarVersion}"
NEW_CLICK = "              onClick={() => setModalVersionesAbierto(true)}"

if OLD_CLICK in c:
    c = c.replace(OLD_CLICK, NEW_CLICK, 1)
    print('  [3] onClick OK')
else:
    print('  [3] onClick no encontrado - REVISAR')

# ─── 4. handleRestaurar function (antes de "const ordenActualizada") ──────────
ANCHOR_FN = "  const ordenActualizada = ordenSeleccionada"
HANDLE_RESTAURAR = """  // ── Restaurar versión ──────────────────────────────────────────────────────
  async function handleRestaurar(v: Version) {
    if (!proyecto) return;
    const confirmar = window.confirm(
      `\u00bfRestaurar el proyecto al estado de "${v.nombre}"?\\n\\nSe guardar\u00e1 un backup del estado actual antes de restaurar.`
    );
    if (!confirmar) return;

    // 1. Backup del estado actual
    const fecha = new Date().toLocaleDateString('es-PY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const snap = ordenes.map(o => ({
      id:          o.id          ?? '',
      ot:          o.ot          ?? '',
      ubicacion:   o.ubicacion   ?? '',
      rubro:       o.rubro       ?? '',
      estado:      o.estado,
      responsable: o.responsable ?? '',
      prioridad:   o.prioridad   ?? 'Media',
      pos_x:       o.pos_x       ?? 0,
      pos_y:       o.pos_y       ?? 0,
      comentarios: o.comentarios ?? '',
      campos:      o.campos      ?? {},
    }));
    await guardarVersion(proyecto.id, `Backup pre-restauraci\u00f3n \u2014 ${fecha}`, null, snap);

    // 2. Aplicar snapshot en Supabase
    const ok = await restaurarVersion(v, proyecto.id);

    if (ok) {
      // 3. Recargar ordenes desde Supabase
      await cargarOrdenes(proyecto.id);
      setModalVersionesAbierto(false);
    } else {
      window.alert('Error al restaurar. Por favor intent\u00e1 de nuevo.');
    }
  }

  const ordenActualizada = ordenSeleccionada"""

if 'handleRestaurar' not in c:
    if ANCHOR_FN in c:
        c = c.replace(ANCHOR_FN, HANDLE_RESTAURAR, 1)
        print('  [4] handleRestaurar OK')
    else:
        print('  [4] anchor no encontrado - REVISAR')
else:
    print('  [4] handleRestaurar ya existe - SKIP')

# ─── 5. Render modal (antes de {mostrarInforme &&) ────────────────────────────
OLD_INFORME = "      {mostrarInforme && ("
NEW_INFORME = """      {modalVersionesAbierto && proyecto && (
        <ModalVersiones
          proyectoId={proyecto.id}
          ordenes={ordenes}
          onCerrar={() => setModalVersionesAbierto(false)}
          onComparar={() => { setModalVersionesAbierto(false); acciones.abrirComparador(); }}
          onRestaurar={(v) => void handleRestaurar(v)}
        />
      )}
      {mostrarInforme && ("""

if 'ModalVersiones' in c and OLD_INFORME in c and 'modalVersionesAbierto && proyecto' not in c:
    c = c.replace(OLD_INFORME, NEW_INFORME, 1)
    print('  [5] render modal OK')
elif 'modalVersionesAbierto && proyecto' in c:
    print('  [5] render ya existe - SKIP')
else:
    print('  [5] anchor mostrarInforme no encontrado - REVISAR')

# Verificar cambios
if c != original:
    with open('src/components/plano/VistaPlano.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print(f'\nVistaPlano.tsx actualizado: {c.count(chr(10))} lineas')
else:
    print('\nSin cambios aplicados')

# Verificaciones finales
checks = ['ModalVersiones', 'modalVersionesAbierto', 'handleRestaurar', 'restaurarVersion', 'guardarVersion']
for ch in checks:
    print(f'  {ch}: {"OK" if ch in c else "FALTA"}')
