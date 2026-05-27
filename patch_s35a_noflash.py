with open('src/components/plano/ModalVersiones.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Cambiar cargar() para aceptar showLoading param
OLD_CARGAR = """  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await listarVersiones(proyectoId);
    setVersiones(data);
    setCargando(false);
  }, [proyectoId]);

  useEffect(() => { void cargar(); }, [cargar]);"""

NEW_CARGAR = """  const cargar = useCallback(async (showLoading = true) => {
    if (showLoading) setCargando(true);
    const data = await listarVersiones(proyectoId);
    setVersiones(data);
    setCargando(false);
  }, [proyectoId]);

  // Si tenemos datos iniciales, refrescamos en background sin spinner (sin flash)
  useEffect(() => { void cargar(versionesInicial.length === 0); }, [cargar]);"""

if 'showLoading' not in c:
    c = c.replace(OLD_CARGAR, NEW_CARGAR, 1)
    print('OK - cargar() con silent refresh')
else:
    print('SKIP - ya aplicado')

with open('src/components/plano/ModalVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

# Verificar
print('showLoading en archivo:', 'showLoading' in open('src/components/plano/ModalVersiones.tsx', encoding='utf-8').read())
