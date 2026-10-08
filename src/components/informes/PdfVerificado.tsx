import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/** Renders one page of the already verified blob, without a second server download. */
export function PdfVerificado({url, pagina, onPaginas, ancho, alto, onReady}: {
  url:string; pagina:number; onPaginas:(n:number)=>void; ancho:number; alto:number;
  onReady?:()=>void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rendering = useRef<Promise<unknown>>(Promise.resolve());
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [estado, setEstado] = useState('Preparando PDF…');
  useEffect(() => {
    let disposed = false;
    onPaginas(0);
    const loading = pdfjs.getDocument({url, isEvalSupported:false, disableRange:true, disableStream:true});
    void loading.promise.then(documento => {
      if (disposed) return;
      setPdf(documento); onPaginas(documento.numPages);
    }).catch(() => { if (!disposed) { setEstado('No se pudo mostrar el PDF. Podés descargar el archivo verificado.'); onReady?.(); } });
    return () => { disposed = true; void loading.destroy().catch(() => undefined); };
  }, [url, onPaginas, onReady]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let disposed = false;
    let task:pdfjs.RenderTask | undefined;
    const target = canvas.current;
    target.style.visibility = 'hidden';
    void (async () => {
      try {
        await rendering.current.catch(() => undefined);
        if (disposed) return;
        setEstado('Preparando página…');
        const page = await pdf.getPage(Math.min(pagina, pdf.numPages));
        if (disposed) return;
        const base = page.getViewport({scale:1});
        const scale = Math.min(ancho/base.width, alto/base.height);
        const viewport = page.getViewport({scale:scale*Math.min(devicePixelRatio,2)});
        target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
        target.style.width = `${base.width*scale}px`; target.style.height = `${base.height*scale}px`;
        const context = target.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        task = page.render({canvasContext:context,viewport}); rendering.current = task.promise; await task.promise;
        if (!disposed) { target.style.visibility = 'visible'; setEstado(''); onReady?.(); }
      } catch { if (!disposed) { setEstado('No se pudo mostrar esta página. Descargá el PDF para revisarla.'); onReady?.(); } }
    })();
    return () => { disposed = true; task?.cancel(); };
  }, [pdf,pagina,ancho,alto,onReady]);
  return <div style={{position:'relative',flex:'none',maxWidth:'100%'}}>
    {estado && <p role="status" style={{fontSize:12,margin:8,color:'var(--text-secondary)'}}>{estado}</p>}
    <canvas ref={canvas} role="img" aria-label={`Página ${pagina} de ${pdf?.numPages ?? '…'} del PDF verificado`}
      style={{display:'block',background:'white',boxShadow:'0 2px 8px #17243a26'}} />
  </div>;
}
