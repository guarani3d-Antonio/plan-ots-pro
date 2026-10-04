import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/** Uses the already verified blob; no native PDF plugin or second server download. */
export function PdfVerificado({url}: {url: string}) {
  const container = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState('Preparando páginas del PDF…');
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let disposed = false;
    const observers: IntersectionObserver[] = [];
    const tasks = new Set<pdfjs.RenderTask>();
    const loading = pdfjs.getDocument({url, isEvalSupported: false, disableRange: true, disableStream: true});
    setEstado('Preparando páginas del PDF…');
    host.replaceChildren();
    void (async () => {
      try {
        const pdf = await loading.promise;
        for (let number = 1; number <= pdf.numPages; number++) {
          if (disposed) return;
          const page = await pdf.getPage(number);
          if (disposed) return;
          const base = page.getViewport({scale: 1});
          const canvas = document.createElement('canvas');
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Página ${number} de ${pdf.numPages} del PDF verificado`);
          canvas.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${base.width}/${base.height};margin-bottom:12px;background:white;border:1px solid #dce2ea;`;
          // Reserve the exact page proportion without allocating a full bitmap yet.
          canvas.width = 1; canvas.height = 1;
          host.append(canvas);
          const observer = new IntersectionObserver(entries => {
            if (disposed || !entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            const viewport = page.getViewport({scale: Math.min(1200, Math.max(600, host.clientWidth * Math.min(devicePixelRatio, 2))) / base.width});
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext('2d');
            if (!context) {setEstado('No se pudo mostrar una página. Descargá el PDF para revisarla.');return;}
            const task = page.render({canvasContext: context, viewport}); tasks.add(task);
            void task.promise.catch(() => {
              if (!disposed) setEstado('No se pudo mostrar una página. Descargá el PDF para revisarla.');
            }).finally(() => {tasks.delete(task);page.cleanup();});
          }, {rootMargin: '300px'});
          observers.push(observer); observer.observe(canvas);
        }
        if (!disposed) setEstado(`${pdf.numPages} página${pdf.numPages === 1 ? '' : 's'} · PDF verificado`);
      } catch {
        if (!disposed) setEstado('No se pudo mostrar el PDF. Podés descargar el archivo verificado.');
      }
    })();
    return () => {
      disposed = true;
      observers.forEach(observer => observer.disconnect());
      tasks.forEach(task => task.cancel());
      void loading.destroy().catch(() => undefined);
      host.replaceChildren();
    };
  }, [url]);
  return <div aria-label="Páginas del PDF verificado">
    <p role="status" style={{fontSize:12, margin:'8px 0', color:'var(--text-secondary)'}}>{estado}</p>
    <div ref={container} />
  </div>;
}
