import re

with open('src/components/plano/PanelOT.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Agregar esNueva a la interfaz Props
c = c.replace(
    'interface PanelOTProps {\n  orden: OrdenLocal | null;\n  onCerrar: () => void;\n  modoForzadoFotos?: boolean;\n}',
    'interface PanelOTProps {\n  orden: OrdenLocal | null;\n  onCerrar: () => void;\n  modoForzadoFotos?: boolean;\n  esNueva?: boolean;\n}',
    1
)

# 2. Agregar esNueva al destructuring
c = c.replace(
    'export function PanelOT({ orden: ordenProp, onCerrar, modoForzadoFotos = false }: PanelOTProps) {',
    'export function PanelOT({ orden: ordenProp, onCerrar, modoForzadoFotos = false, esNueva = false }: PanelOTProps) {',
    1
)

# 3. Insertar handleCancelarNueva antes de handleCancelarUbicacion
c = c.replace(
    '  const handleCancelarUbicacion = async () => {',
    '  const handleCancelarNueva = () => {\n    if (!ordenFresca) { onCerrar(); return; }\n    eliminarOrden(ordenFresca.id);\n    onCerrar();\n  };\n\n  const handleCancelarUbicacion = async () => {',
    1
)

# 4. Agregar rama esNueva en el footer (regex para no depender de espacios exactos)
c = re.sub(
    r'(\) : \()\s*\n(\s*)(<button className=\{styles\.deleteBtn\} onClick=\{handleEliminar\}>)',
    r') : esNueva ? (\n\2<button className={styles.cancelUbicacionBtn} onClick={handleCancelarNueva} type="button">Cancelar</button>\n              ) : (\n\2\3',
    c,
    count=1
)

with open('src/components/plano/PanelOT.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("PanelOT patch OK —", c.count('\n'), "líneas")