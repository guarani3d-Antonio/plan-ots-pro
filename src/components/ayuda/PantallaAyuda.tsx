import { useState } from 'react';
import styles from './PantallaAyuda.module.css';

interface PantallaAyudaProps {
  /** Opcional: botón de volver. Si la Vista vive dentro del Sidebar, no es necesario. */
  onVolver?: () => void;
}

interface Paso {
  texto: string;
  nota?: string;
}

interface ModuloAyuda {
  id: string;
  icono: string;
  titulo: string;
  resumen: string;
  pasos: Paso[];
  proximamente?: boolean;
}

const MODULOS: ModuloAyuda[] = [
  {
    id: 'crear-proyecto',
    icono: '📁',
    titulo: 'Crear un proyecto',
    resumen: 'Cada proyecto agrupa las OTs de una obra sobre su plano referencial.',
    pasos: [
      { texto: 'En el selector de proyectos, hacé clic en "+ Nuevo proyecto".' },
      { texto: 'Completá nombre, cliente y los rubros que aplican a la obra.' },
      {
        texto: 'Subí el plano referencial (PDF o imagen).',
        nota: 'Las imágenes deben ser mínimo 1800×1200 px. Los PDF no tienen restricción de dimensión.',
      },
      { texto: 'Guardá. El proyecto queda disponible offline y se sincroniza al reconectar.' },
    ],
  },
  {
    id: 'subir-plano',
    icono: '🗺️',
    titulo: 'Subir y navegar el plano',
    resumen: 'El plano es el lienzo donde vas a ubicar las órdenes de trabajo.',
    pasos: [
      { texto: 'Dentro del proyecto, el plano se renderiza automáticamente en la Vista Plano.' },
      { texto: 'Zoom con la rueda del mouse (centrado en el cursor). Pan arrastrando con el dedo o el mouse.' },
      { texto: 'Botón de ajuste para encuadrar el plano completo en pantalla.' },
      {
        texto: 'Para reemplazar un plano por una versión nueva, usá el flujo de reemplazo por puntos de anclaje.',
        nota: 'Las coordenadas de las OTs se re-mapean automáticamente con la transformación afín.',
      },
    ],
  },
  {
    id: 'crear-ot',
    icono: '📌',
    titulo: 'Crear una OT (manual y CSV)',
    resumen: 'Dos formas de cargar órdenes: clic directo en el plano o importación masiva.',
    pasos: [
      {
        texto: 'Manual: hacé clic en el punto del plano donde está la incidencia → se abre el panel de OT.',
        nota: 'El código de OT debe ser único. La app no permite dos OTs con el mismo código.',
      },
      { texto: 'Completá los campos del panel: estado, prioridad, rubro, responsable, fechas, descripción.' },
      {
        texto: 'CSV: usá "Importar" en la barra superior y seguí el wizard de 3 pasos (cargar → mapear columnas → confirmar).',
        nota: 'Las OTs importadas quedan "sin ubicar". Arrastralas desde la lista izquierda al plano para posicionarlas.',
      },
    ],
  },
  {
    id: 'estados-fotos',
    icono: '📷',
    titulo: 'Estados y fotos obligatorias',
    resumen: 'Cada estado exige un mínimo de fotos antes de poder avanzar.',
    pasos: [
      { texto: 'Pendiente → requiere al menos 1 foto ANTES.' },
      { texto: 'En proceso → requiere al menos 1 foto ANTES + 1 DURANTE.' },
      { texto: 'Cerrada → requiere ANTES + DURANTE + DESPUÉS (1 mínimo de cada una).' },
      {
        texto: 'No aplica → conserva las fotos existentes, sin nuevas exigencias.',
        nota: 'No podés eliminar la única foto que cumple la obligatoriedad del estado actual. Bajá primero el estado.',
      },
    ],
  },
  {
    id: 'informes',
    icono: '📄',
    titulo: 'Generar informes',
    resumen: 'Cinco tipos de informe con vista previa antes de imprimir.',
    pasos: [
      { texto: 'Abrí una OT → pestaña "Informes" → elegí el tipo (Ficha de visita, Relevamiento, Avance, Acta de conformidad, etc.).' },
      { texto: 'Revisá la vista previa y completá los comentarios finales editables.' },
      {
        texto: 'Generá el PDF. Incluye logo Guaraní 3D, KPIs y las fotos según el tipo de informe.',
        nota: 'El acta de conformidad incluye encuesta de satisfacción y firmantes.',
      },
    ],
  },
  {
    id: 'exportar',
    icono: '📤',
    titulo: 'Exportar (.otproj / CSV)',
    resumen: 'Llevá el proyecto o sus datos a otro dispositivo o sistema.',
    pasos: [
      {
        texto: '.otproj: exporta metadatos + URLs (no embebe fotos ni videos). Pesa de 50 KB a unos pocos MB.',
        nota: 'Al importarlo en otro dispositivo, los archivos multimedia se descargan bajo demanda al abrir cada OT.',
      },
      { texto: 'CSV: exporta todas las OTs con sus campos y las rutas de las fotos.' },
      { texto: 'Ambas opciones están en la barra superior de la Vista Plano y en la Vista Grilla.' },
    ],
  },
  {
    id: 'vista-3d',
    icono: '🧊',
    titulo: 'Vista 3D',
    resumen: 'Navegación tridimensional del plano. En desarrollo.',
    proximamente: true,
    pasos: [
      { texto: 'El visor 3D permitirá recorrer el modelo de la obra y ubicar OTs en el espacio.' },
      { texto: 'Funcionalidad en validación — disponible en una próxima versión.' },
    ],
  },
];

export default function PantallaAyuda({ onVolver }: PantallaAyudaProps) {
  const [activo, setActivo] = useState<string>(MODULOS[0].id);
  const modulo = MODULOS.find((m) => m.id === activo) ?? MODULOS[0];

  return (
    <div className={styles.contenedor}>
      {/* Rail izquierdo: lista de módulos */}
      <aside className={styles.rail}>
        <div className={styles.railHeader}>
          {onVolver && (
            <button type="button" className={styles.btnVolver} onClick={onVolver}>
              ← Volver
            </button>
          )}
          <h2 className={styles.railTitulo}>¿Cómo usar Plan-OTs?</h2>
          <p className={styles.railSub}>Guía rápida por módulos</p>
        </div>

        <nav className={styles.railNav}>
          {MODULOS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.railItem} ${activo === m.id ? styles.railItemActivo : ''}`}
              onClick={() => setActivo(m.id)}
            >
              <span className={styles.railIcono}>{m.icono}</span>
              <span className={styles.railLabel}>{m.titulo}</span>
              {m.proximamente && <span className={styles.badgeProx}>Pronto</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Panel derecho: contenido del módulo */}
      <section className={styles.contenido}>
        <div className={styles.contenidoHeader}>
          <span className={styles.contenidoIcono}>{modulo.icono}</span>
          <div>
            <h1 className={styles.contenidoTitulo}>
              {modulo.titulo}
              {modulo.proximamente && <span className={styles.badgeProxGrande}>Próximamente</span>}
            </h1>
            <p className={styles.contenidoResumen}>{modulo.resumen}</p>
          </div>
        </div>

        <ol className={styles.pasos}>
          {modulo.pasos.map((paso, i) => (
            <li key={i} className={styles.paso}>
              <span className={styles.pasoNum}>{i + 1}</span>
              <div className={styles.pasoCuerpo}>
                <p className={styles.pasoTexto}>{paso.texto}</p>
                {paso.nota && <p className={styles.pasoNota}>💡 {paso.nota}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}