with open('src/components/plano/PanelOT.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Agregar imports
old1 = "import EditorFoto, { type FotoMinima } from './EditorFoto';"
new1 = """import EditorFoto, { type FotoMinima } from './EditorFoto';
import ModalDescripcionFoto from './ModalDescripcionFoto';
import { describirFotoConIA } from '../../services/iaService';"""
c = c.replace(old1, new1, 1)

# 2. Reemplazar estados pendingFile/pendingCategoria por estados IA
old2 = """  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingCategoria, setPendingCategoria] = useState<'ANTES' | 'DURANTE' | 'DESPUES'>('ANTES');"""
new2 = """  const [modalDescIA, setModalDescIA] = useState<{ fotoId: string; fotoUrl: string } | null>(null);
  const [sugerenciaIA, setSugerenciaIA] = useState('');
  const [cargandoIA, setCargandoIA] = useState(false);"""
c = c.replace(old2, new2, 1)

# 3. Reemplazar los 3 handlers + firma de procesarSubidaFoto
old3 = """  const onArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>, categoria: 'ANTES' | 'DURANTE' | 'DESPUES') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingFile(file);
    setPendingCategoria(categoria);
  };

  const handleCancelarFoto = () => { setPendingFile(null); };

  const handleConfirmarFoto = (descripcion: string) => {
    const file = pendingFile;
    const categoria = pendingCategoria;
    if (!file) return;
    setPendingFile(null);
    void procesarSubidaFoto(file, categoria, descripcion);
  };

  const procesarSubidaFoto = async (file: File, categoria: 'ANTES' | 'DURANTE' | 'DESPUES', descripcion: string) => {"""
new3 = """  const onArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>, categoria: 'ANTES' | 'DURANTE' | 'DESPUES') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void procesarSubidaFoto(file, categoria);
  };

  const procesarSubidaFoto = async (file: File, categoria: 'ANTES' | 'DURANTE' | 'DESPUES') => {"""
c = c.replace(old3, new3, 1)

# 4. Reemplazar manejo de resultado de upload (quitar desc save, agregar trigger IA)
old4 = """      const foto = await subirYRegistrarFoto(file, ordenFresca.id, ordenFresca.proyecto_id, categoria);
      const desc = descripcion.trim();
      let fotoConDesc = foto;
      if (desc) {
        await supabase.from('fotos').update({ descripcion: desc }).eq('id', foto.id);
        fotoConDesc = { ...foto, descripcion: desc };
      }
      if (categoria === 'ANTES')   setFotosAntes(  prev => [...prev, fotoConDesc]);
      if (categoria === 'DURANTE') setFotosDurante(prev => [...prev, fotoConDesc]);
      if (categoria === 'DESPUES') setFotosDespues(prev => [...prev, fotoConDesc]);"""
new4 = """      const foto = await subirYRegistrarFoto(file, ordenFresca.id, ordenFresca.proyecto_id, categoria);
      if (categoria === 'ANTES')   setFotosAntes(  prev => [...prev, foto]);
      if (categoria === 'DURANTE') setFotosDurante(prev => [...prev, foto]);
      if (categoria === 'DESPUES') setFotosDespues(prev => [...prev, foto]);
      // S34-B: Modal descripcion IA
      setModalDescIA({ fotoId: foto.id, fotoUrl: foto.url });
      setSugerenciaIA('');
      setCargandoIA(true);
      describirFotoConIA(foto.url).then(desc => {
        setSugerenciaIA(desc);
        setCargandoIA(false);
      }).catch(() => setCargandoIA(false));"""
c = c.replace(old4, new4, 1)

# 5. Agregar handleGuardarDescripcionIA antes de handleEliminarFoto
old5 = "  const handleEliminarFoto = async (foto: FotoConId, categoria: CategoriaFoto) => {"
new5 = """  const handleGuardarDescripcionIA = async (descripcion: string) => {
    if (!modalDescIA) { setModalDescIA(null); return; }
    const { fotoId } = modalDescIA;
    setModalDescIA(null);
    if (!descripcion.trim()) return;
    await supabase.from('fotos').update({ descripcion: descripcion.trim() }).eq('id', fotoId);
    const actualizar = (arr: FotoConId[]) =>
      arr.map(f => f.id === fotoId ? { ...f, descripcion: descripcion.trim() } : f);
    setFotosAntes(prev => actualizar(prev));
    setFotosDurante(prev => actualizar(prev));
    setFotosDespues(prev => actualizar(prev));
  };

  const handleEliminarFoto = async (foto: FotoConId, categoria: CategoriaFoto) => {"""
c = c.replace(old5, new5, 1)

# 6. Reemplazar ModalFotoDetalle pendingFile por ModalDescripcionFoto
old6 = """      {pendingFile && (
        <ModalFotoDetalle file={pendingFile} categoria={pendingCategoria} onGuardar={handleConfirmarFoto} onCancelar={handleCancelarFoto} onEditarImagen={() => {}} />
      )}"""
new6 = """      {modalDescIA && (
        <ModalDescripcionFoto
          fotoUrl={modalDescIA.fotoUrl}
          sugerenciaIA={sugerenciaIA}
          cargandoIA={cargandoIA}
          onGuardar={handleGuardarDescripcionIA}
          onOmitir={() => setModalDescIA(null)}
        />
      )}"""
c = c.replace(old6, new6, 1)

with open('src/components/plano/PanelOT.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Patch PanelOT IA OK -", c.count('\n'), "lineas")