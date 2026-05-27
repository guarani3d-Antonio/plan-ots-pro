# S35-C: Pre-selección de versión en ComparadorVersiones

# ── 1. ComparadorVersiones.tsx ────────────────────────────────
with open('src/components/plano/ComparadorVersiones.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    '  onCerrar: () => void;\n}',
    '  onCerrar: () => void;\n  versionPreselId?: string;\n}', 1)

c = c.replace(
    '  onCerrar,\n}: Props)',
    '  onCerrar,\n  versionPreselId,\n}: Props)', 1)

old_ue = '''      if (!error && data && data.length > 0) {
        setVersiones(data as Version[]);
        if (data.length >= 2) {
          setIdB(data[0].id);
          setIdA(data[1].id);
        } else {
          setIdA(data[0].id);
        }
      }
      setCargando(false);'''
new_ue = '''      if (!error && data && data.length > 0) {
        setVersiones(data as Version[]);
        if (versionPreselId) {
          setIdA(versionPreselId);
          const otra = data.find(v => v.id !== versionPreselId);
          setIdB(otra ? otra.id : data[0].id);
        } else if (data.length >= 2) {
          setIdB(data[0].id);
          setIdA(data[1].id);
        } else {
          setIdA(data[0].id);
        }
      }
      setCargando(false);'''
c = c.replace(old_ue, new_ue, 1)
with open('src/components/plano/ComparadorVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [1] ComparadorVersiones.tsx OK')

# ── 2. useAccionesProyecto.tsx ────────────────────────────────
with open('src/hooks/useAccionesProyecto.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('abrirComparador:     () => void;',
    'abrirComparador: (versionId?: string) => void;', 1)
c = c.replace(
    '  const [comparadorAbierto, setComparadorAbierto] = useState(false);',
    '  const [comparadorAbierto, setComparadorAbierto] = useState(false);\n  const [versionPreselId, setVersionPreselId]     = useState<string | null>(null);', 1)
c = c.replace(
    '  const abrirComparador = () => setComparadorAbierto(true);',
    '  const abrirComparador = (versionId?: string) => {\n    setVersionPreselId(versionId ?? null);\n    setComparadorAbierto(true);\n  };', 1)
c = c.replace(
    '          onCerrar={() => setComparadorAbierto(false)}',
    '          versionPreselId={versionPreselId ?? undefined}\n          onCerrar={() => { setComparadorAbierto(false); setVersionPreselId(null); }}', 1)
with open('src/hooks/useAccionesProyecto.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [2] useAccionesProyecto.tsx OK')

# ── 3. ModalVersiones.tsx ────────────────────────────────────
with open('src/components/plano/ModalVersiones.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('  onComparar: () => void;', '  onComparar: (versionId: string) => void;', 1)
c = c.replace(
    'onClick={() => { onComparar(); onCerrar(); }}',
    'onClick={() => { onComparar(v.id); onCerrar(); }}', 1)
with open('src/components/plano/ModalVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [3] ModalVersiones.tsx OK')

# ── 4. VistaPlano.tsx ────────────────────────────────────────
with open('src/components/plano/VistaPlano.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    'onComparar={() => { setModalVersionesAbierto(false); acciones.abrirComparador(); }}',
    'onComparar={(versionId) => { setModalVersionesAbierto(false); acciones.abrirComparador(versionId); }}', 1)
with open('src/components/plano/VistaPlano.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [4] VistaPlano.tsx OK')

print('Done')
