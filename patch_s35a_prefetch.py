# Patch 1: ModalVersiones.tsx — acepta versionesInicial como prop
with open('src/components/plano/ModalVersiones.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Agregar versionesInicial a la interface Props
OLD_PROPS = """interface Props {
  proyectoId: string;
  ordenes: OrdenLocal[];
  onCerrar: () => void;
  onComparar: () => void;
  onRestaurar: (v: Version) => void;
}"""

NEW_PROPS = """interface Props {
  proyectoId: string;
  ordenes: OrdenLocal[];
  onCerrar: () => void;
  onComparar: () => void;
  onRestaurar: (v: Version) => void;
  versionesInicial?: Version[];   // pre-cargadas desde VistaPlano — apertura instantánea
}"""

if 'versionesInicial' not in c:
    c = c.replace(OLD_PROPS, NEW_PROPS, 1)
    print('  [1] Props OK')
else:
    print('  [1] Props ya existe - SKIP')

# Agregar versionesInicial al destructure
OLD_DESTRUCTURE = """export function ModalVersiones({
  proyectoId,
  ordenes,
  onCerrar,
  onComparar,
  onRestaurar,
}: Props) {"""

NEW_DESTRUCTURE = """export function ModalVersiones({
  proyectoId,
  ordenes,
  onCerrar,
  onComparar,
  onRestaurar,
  versionesInicial = [],
}: Props) {"""

if 'versionesInicial = []' not in c:
    c = c.replace(OLD_DESTRUCTURE, NEW_DESTRUCTURE, 1)
    print('  [2] destructure OK')
else:
    print('  [2] destructure ya existe - SKIP')

# Usar versionesInicial como estado inicial — cargando false si ya hay datos
OLD_STATE = """  const [versiones, setVersiones]       = useState<Version[]>([]);
  const [cargando, setCargando]         = useState(true);"""

NEW_STATE = """  const [versiones, setVersiones]       = useState<Version[]>(versionesInicial);
  const [cargando, setCargando]         = useState(versionesInicial.length === 0);"""

if 'versionesInicial.length === 0' not in c:
    c = c.replace(OLD_STATE, NEW_STATE, 1)
    print('  [3] estado inicial OK')
else:
    print('  [3] estado ya existe - SKIP')

with open('src/components/plano/ModalVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  ModalVersiones.tsx actualizado\n')

# Patch 2: VistaPlano.tsx — pre-fetch versiones en background
with open('src/components/plano/VistaPlano.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Agregar listarVersiones al import existente de versionesService
OLD_IMPORT_SVC = "import { guardarVersion, restaurarVersion } from '../../services/versionesService';"
NEW_IMPORT_SVC = "import { guardarVersion, restaurarVersion, listarVersiones } from '../../services/versionesService';"

if 'listarVersiones' not in c:
    c = c.replace(OLD_IMPORT_SVC, NEW_IMPORT_SVC, 1)
    print('  [4] import listarVersiones OK')
else:
    print('  [4] listarVersiones ya importado - SKIP')

# Agregar estado versionesCached junto a modalVersionesAbierto
OLD_MODAL_STATE = "  const [modalVersionesAbierto, setModalVersionesAbierto] = useState(false);"
NEW_MODAL_STATE = """  const [modalVersionesAbierto, setModalVersionesAbierto] = useState(false);
  const [versionesCached, setVersionesCached]           = useState<import('../../services/versionesService').Version[]>([]);"""

if 'versionesCached' not in c:
    c = c.replace(OLD_MODAL_STATE, NEW_MODAL_STATE, 1)
    print('  [5] estado versionesCached OK')
else:
    print('  [5] versionesCached ya existe - SKIP')

# Agregar useEffect de pre-fetch después del useRealtimeOrdenes
OLD_REALTIME = "  useRealtimeOrdenes(proyecto?.id ?? null);"
NEW_REALTIME = """  useRealtimeOrdenes(proyecto?.id ?? null);

  // Pre-carga versiones en background — modal abre instantáneo
  useEffect(() => {
    if (!proyecto?.id) return;
    void listarVersiones(proyecto.id).then(v => setVersionesCached(v));
  }, [proyecto?.id]);"""

if 'Pre-carga versiones en background' not in c:
    c = c.replace(OLD_REALTIME, NEW_REALTIME, 1)
    print('  [6] useEffect prefetch OK')
else:
    print('  [6] prefetch ya existe - SKIP')

# Pasar versionesInicial al render del modal
OLD_MODAL_RENDER = """        <ModalVersiones
          proyectoId={proyecto.id}
          ordenes={ordenes}
          onCerrar={() => setModalVersionesAbierto(false)}
          onComparar={() => { setModalVersionesAbierto(false); acciones.abrirComparador(); }}
          onRestaurar={(v) => void handleRestaurar(v)}
        />"""

NEW_MODAL_RENDER = """        <ModalVersiones
          proyectoId={proyecto.id}
          ordenes={ordenes}
          versionesInicial={versionesCached}
          onCerrar={() => setModalVersionesAbierto(false)}
          onComparar={() => { setModalVersionesAbierto(false); acciones.abrirComparador(); }}
          onRestaurar={(v) => void handleRestaurar(v)}
        />"""

if 'versionesInicial={versionesCached}' not in c:
    c = c.replace(OLD_MODAL_RENDER, NEW_MODAL_RENDER, 1)
    print('  [7] prop versionesInicial OK')
else:
    print('  [7] prop ya existe - SKIP')

with open('src/components/plano/VistaPlano.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  VistaPlano.tsx actualizado')

# Checks
checks = ['versionesCached', 'listarVersiones', 'versionesInicial', 'Pre-carga versiones']
for ch in checks:
    found = ch in open('src/components/plano/VistaPlano.tsx', encoding='utf-8').read()
    print(f'  {ch}: {"OK" if found else "FALTA"}')
