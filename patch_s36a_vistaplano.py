with open('src/components/plano/VistaPlano.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Agregar estado esNuevaOT
c = c.replace(
    '  const [modoForzadoFotos, setModoForzadoFotos] = useState(false);',
    '  const [modoForzadoFotos, setModoForzadoFotos] = useState(false);\n  const [esNuevaOT, setEsNuevaOT] = useState(false);',
    1
)

# 2. Marcar como nueva OT al crear desde click
c = c.replace(
    '    const nueva = await crearOrdenEnPosicion(proyecto.id, posX, posY);\n    setOrdenSeleccionada(nueva);',
    '    const nueva = await crearOrdenEnPosicion(proyecto.id, posX, posY);\n    setOrdenSeleccionada(nueva);\n    setEsNuevaOT(true);',
    1
)

# 3. Reset al seleccionar OT existente
c = c.replace(
    '  const handleSeleccionar = useCallback((orden: OrdenLocal) => {\n    setOrdenSeleccionada(orden);\n  }, []);',
    '  const handleSeleccionar = useCallback((orden: OrdenLocal) => {\n    setOrdenSeleccionada(orden);\n    setEsNuevaOT(false);\n  }, []);',
    1
)

# 4. Pasar prop esNueva y resetear en onCerrar
c = c.replace(
    '          onCerrar={() => {\n            setOrdenSeleccionada(null);\n            setModoForzadoFotos(false);\n          }}',
    '          esNueva={esNuevaOT}\n          onCerrar={() => {\n            setOrdenSeleccionada(null);\n            setModoForzadoFotos(false);\n            setEsNuevaOT(false);\n          }}',
    1
)

with open('src/components/plano/VistaPlano.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("VistaPlano patch OK —", c.count('\n'), "líneas")