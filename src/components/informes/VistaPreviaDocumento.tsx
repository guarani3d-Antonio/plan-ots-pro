import { useEffect, useRef, useState } from 'react';
import { PdfVerificado } from './PdfVerificado';
import { prepararPaginacionInforme, contarPaginasInforme, mostrarPaginaInforme } from '../../services/reportPreviewPagination';
import styles from './VistaPreviaDocumento.module.css';

/** Browser fragmentation is only for the draft preview. Exported HTML and verified PDFs stay intact. */
export function VistaPreviaDocumento({ html, pdfUrl, ampliada, onAmpliar, soloLectura = false }: {
  html: string; pdfUrl: string | null; ampliada: boolean; onAmpliar: () => void; soloLectura?: boolean;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(0);
  const [ancho, setAncho] = useState(280);
  const [alto, setAlto] = useState(450);
  const [ajuste, setAjuste] = useState('pagina');
  const paginaRef = useRef(pagina);
  useEffect(() => { paginaRef.current = pagina; }, [pagina]);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let animation = 0;
    const medir = () => {
      const width = Math.max(1, host.clientWidth - 20);
      const height = Math.max(1, host.clientHeight - 20);
      setAncho(actual => actual === width ? actual : width);
      setAlto(actual => actual === height ? actual : height);
    };
    medir();
    // React layout writes must run after ResizeObserver delivery, not inside it.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(medir);
    });
    observer.observe(host);
    return () => { observer.disconnect(); cancelAnimationFrame(animation); };
  }, []);

  useEffect(() => {
    const frame = iframe.current;
    if (!frame || pdfUrl || !html) return;
    let disposed = false;
    let animation = 0;
    const medir = () => {
      if (disposed || !frame.contentDocument) return;
      const n = contarPaginasInforme(frame.contentDocument);
      setPaginas(n);
      const actual = Math.min(paginaRef.current, n);
      setPagina(actual);
      mostrarPaginaInforme(frame.contentDocument, actual);
    };
    const cargar = async () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      prepararPaginacionInforme(doc);
      await doc.fonts.ready;
      if (disposed) return;
      // The document has fixed A4 dimensions and changes only through srcDoc.
      // Observe neither its fragmented columns nor their transformed rectangles.
      animation = requestAnimationFrame(medir);
      doc.querySelectorAll('img').forEach(img => {
        if (!img.complete) img.addEventListener('load', medir, {once:true});
      });
    };
    frame.addEventListener('load', cargar);
    if (frame.contentDocument?.readyState === 'complete') void cargar();
    return () => { disposed = true; frame.removeEventListener('load', cargar); cancelAnimationFrame(animation); };
  }, [html, pdfUrl]);

  useEffect(() => {
    if (iframe.current?.contentDocument) mostrarPaginaInforme(iframe.current.contentDocument, pagina);
  }, [pagina]);

  const escala = Math.min(ancho / 794, ampliada && ajuste === 'ancho' ? 1 : alto / 1123, 1);
  return <div className={styles.preview}>
    <div className={styles.toolbar}>
      <button type="button" onClick={onAmpliar}>{ampliada ? (soloLectura ? 'Reducir vista' : '← Volver a los datos') : '⛶ Ampliar completa'}</button>
      {ampliada && <label>Ajuste <select value={ajuste} onChange={e=>setAjuste(e.target.value)}><option value="pagina">Página completa</option><option value="ancho">Ancho de página</option></select></label>}
    </div>
    <div className={styles.stage} ref={stage}>
      {pdfUrl ? <PdfVerificado key={pdfUrl} url={pdfUrl} pagina={pagina} onPaginas={setPaginas} ancho={794 * escala} alto={1123 * escala} /> :
        <div className={styles.sheet} style={{width:794*escala,height:1123*escala}}>
          <iframe ref={iframe} srcDoc={html} sandbox="allow-same-origin" scrolling="no" title={`Página ${pagina} del borrador`}
            style={{transform:`scale(${escala})`}} />
        </div>}
    </div>
    <nav className={styles.pages} aria-label="Páginas del informe">
      <button type="button" disabled={paginas === 0 || pagina <= 1} onClick={()=>setPagina(p=>p-1)}>‹ Anterior</button>
      <span aria-live="polite">{paginas ? `${pagina} / ${paginas}` : 'Preparando…'}</span>
      <button type="button" disabled={paginas === 0 || pagina >= paginas} onClick={()=>setPagina(p=>p+1)}>Siguiente ›</button>
    </nav>
    {!pdfUrl && <small className={styles.note}>Borrador · sin emisión ni aprobación</small>}
  </div>;
}
