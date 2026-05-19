// src/components/informes/InformePanel.tsx
import { useState, useRef, useEffect } from 'react'
import { useProyectosStore } from '../../stores/proyectosStore'
import { ESTADO_COLOR, ESTADO_LABEL, ESTADOS_ORDEN } from '../../constants/estados'
import type { EstadoOT } from '../../constants/estados'
import { getCamposDeProyecto } from '../../services/camposService'
import {
  generarInformeHTML,
  exportarCSV,
  descargarHTML,
} from '../../services/informeService'
import type { InformeConfig, FirmanteConfig } from '../../services/informeService'
import styles from './InformePanel.module.css'

interface Props { onClose: () => void }

const CATS_FOTOS = ['ANTES', 'DURANTE', 'DESPUÉS'] as const
type CatFoto = typeof CATS_FOTOS[number]

export default function InformePanel({ onClose }: Props) {
  const proyecto = useProyectosStore(s => s.proyectoActivo)

  const [filtroEstados, setFiltroEstados]     = useState<EstadoOT[]>([...ESTADOS_ORDEN])
  const [incluirFotos, setIncluirFotos]       = useState(false)
  const [categoriasFotos, setCategoriasFotos] = useState<CatFoto[]>([...CATS_FOTOS])
  const [granularidad, setGranularidad]       = useState<'dias' | 'semanas' | 'meses'>('semanas')
  const [campoAvanceId, setCampoAvanceId]     = useState('')
  const [periodoLabel, setPeriodoLabel]       = useState('')
  const [firmantes, setFirmantes]             = useState<FirmanteConfig[]>([
    { nombre: '', cargo: '' },
    { nombre: '', cargo: '' },
  ])
  const [logoB64, setLogoB64]                 = useState<string | undefined>()
  const [camposNumericos, setCamposNumericos] = useState<{ id: string; nombre: string }[]>([])
  const [generando, setGenerando]             = useState(false)
  const [htmlGenerado, setHtmlGenerado]       = useState<string | null>(null)

  const iframeRef    = useRef<HTMLIFrameElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!proyecto) return
    const saved = localStorage.getItem(`plan-ots-logo-${proyecto.id}`)
    if (saved) setLogoB64(saved)
    getCamposDeProyecto(proyecto.id).then(campos =>
      setCamposNumericos(
        campos
          .filter(c => c.tipo === 'numero' || c.tipo === 'decimal')
          .map(c => ({ id: c.id, nombre: c.nombre }))
      )
    )
  }, [proyecto?.id])

  if (!proyecto) return null
  const proj = proyecto

  function toggleEstado(e: EstadoOT) {
    setFiltroEstados(prev =>
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]
    )
  }

  function toggleCategoria(cat: CatFoto) {
    setCategoriasFotos(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setLogoB64(b64)
      localStorage.setItem(`plan-ots-logo-${proj.id}`, b64)
    }
    reader.readAsDataURL(file)
  }

  function actualizarFirmante(i: number, campo: keyof FirmanteConfig, valor: string) {
    setFirmantes(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [campo]: valor }
      return next
    })
  }

  async function generar() {
    setGenerando(true)
    try {
      const config: InformeConfig = {
        proyectoId:            proj.id,
        proyectoNombre:        proj.nombre,
        proyectoCliente:       proj.cliente ?? '',
        periodoLabel:          periodoLabel || new Date().toLocaleDateString('es-PY', { month: 'long', year: 'numeric' }),
        logoB64,
        filtroEstados,
        incluirFotos,
        categoriasFotos:       incluirFotos ? categoriasFotos : [],
        campoAvanceId:         campoAvanceId || undefined,
        evolucionGranularidad: granularidad,
        firmantes:             firmantes.filter(f => f.nombre.trim()),
      }
      const html = await generarInformeHTML(config)
      setHtmlGenerado(html)
    } finally {
      setGenerando(false)
    }
  }

  function descargar() {
    if (!htmlGenerado) return
    const nombre = `informe-${proj.nombre.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`
    descargarHTML(htmlGenerado, nombre)
  }

  function imprimirPDF() {
    iframeRef.current?.contentWindow?.print()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>

        <div className={styles.header}>
          <h2 className={styles.titulo}>Generar informe — {proj.nombre}</h2>
          <button className={styles.btnCerrar} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>

          {/* Config 2 columnas */}
          <div className={styles.config}>
            <div className={styles.configGrid}>

              <div className={styles.colLeft}>
                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Logo de empresa</p>
                  <div className={styles.logoArea} onClick={() => logoInputRef.current?.click()}>
                    {logoB64
                      ? <img src={logoB64} className={styles.logoPreview} alt="Logo" />
                      : <span className={styles.logoPlaceholder}>Clic para subir PNG/JPG</span>
                    }
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*"
                    style={{ display: 'none' }} onChange={handleLogo} />
                  {logoB64 && (
                    <button className={styles.btnLink} onClick={() => {
                      setLogoB64(undefined)
                      localStorage.removeItem(`plan-ots-logo-${proj.id}`)
                    }}>Quitar logo</button>
                  )}
                </div>

                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Estados a incluir</p>
                  <div className={styles.chipGroup}>
                    {ESTADOS_ORDEN.map(e => (
                      <button key={e}
                        className={`${styles.chip} ${filtroEstados.includes(e) ? styles.chipActivo : ''}`}
                        style={filtroEstados.includes(e) ? { borderColor: ESTADO_COLOR[e], color: ESTADO_COLOR[e] } : {}}
                        onClick={() => toggleEstado(e)}>
                        {ESTADO_LABEL[e]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Fotos por OT</p>
                  <label className={styles.toggleRow}>
                    <input type="checkbox" checked={incluirFotos}
                      onChange={e => setIncluirFotos(e.target.checked)} />
                    Incluir fotos
                  </label>
                  {incluirFotos && (
                    <div className={styles.chipGroup}>
                      {CATS_FOTOS.map(cat => (
                        <button key={cat}
                          className={`${styles.chip} ${categoriasFotos.includes(cat) ? styles.chipActivo : ''}`}
                          onClick={() => toggleCategoria(cat)}>{cat}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.colRight}>
                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Período</p>
                  <input className={styles.input} placeholder="ej: enero – mayo 2026"
                    value={periodoLabel} onChange={e => setPeriodoLabel(e.target.value)} />
                </div>

                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Línea temporal</p>
                  <div className={styles.radioGroup}>
                    {(['dias', 'semanas', 'meses'] as const).map(g => (
                      <label key={g} className={styles.radioLabel}>
                        <input type="radio" name="gran" value={g}
                          checked={granularidad === g} onChange={() => setGranularidad(g)} />
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>

                {camposNumericos.length > 0 && (
                  <div className={styles.seccion}>
                    <p className={styles.secLabel}>Campo % avance</p>
                    <select className={styles.input} value={campoAvanceId}
                      onChange={e => setCampoAvanceId(e.target.value)}>
                      <option value="">— Sin barra —</option>
                      {camposNumericos.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.seccion}>
                  <p className={styles.secLabel}>Firmantes</p>
                  {firmantes.map((f, i) => (
                    <div key={i} className={styles.firmanteRow}>
                      <input className={styles.input} placeholder="Nombre"
                        value={f.nombre} onChange={e => actualizarFirmante(i, 'nombre', e.target.value)} />
                      <input className={styles.input} placeholder="Cargo"
                        value={f.cargo} onChange={e => actualizarFirmante(i, 'cargo', e.target.value)} />
                      {firmantes.length > 1 && (
                        <button className={styles.btnLink}
                          onClick={() => setFirmantes(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className={styles.btnLink}
                    onClick={() => setFirmantes(prev => [...prev, { nombre: '', cargo: '' }])}>
                    + Firmante
                  </button>
                </div>

                <div className={styles.acciones}>
                  <button className={styles.btnGenerar} onClick={generar}
                    disabled={generando || filtroEstados.length === 0}>
                    {generando ? 'Generando…' : '▶ Vista previa'}
                  </button>
                  <button className={styles.btnSecundario} onClick={() => exportarCSV(proj.id)}>
                    CSV
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Preview */}
          <div className={styles.preview}>
            {htmlGenerado ? (
              <>
                <div className={styles.previewToolbar}>
                  <span className={styles.previewLabel}>Vista previa</span>
                  <button className={styles.btnSecundario} onClick={descargar}>Descargar HTML</button>
                  <button className={styles.btnGenerar} onClick={imprimirPDF}>Imprimir / PDF</button>
                </div>
                <iframe ref={iframeRef} className={styles.iframe}
                  srcDoc={htmlGenerado} title="Vista previa del informe" />
              </>
            ) : (
              <div className={styles.previewEmpty}>
                <span>Configurá el informe<br />y presioná <strong>▶ Vista previa</strong></span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
