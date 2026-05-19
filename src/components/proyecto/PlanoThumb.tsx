import React, { useEffect, useState } from 'react';

interface Props {
  url: string;
}

const esPDF = (url: string) => url.toLowerCase().includes('.pdf');

const IMG_STYLE: React.CSSProperties = {
  width: '100%', height: '100%',
  objectFit: 'cover',
  filter: 'grayscale(1) contrast(1.5) brightness(1.05)',
  display: 'block',
};

export const PlanoThumb: React.FC<Props> = ({ url }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [estado, setEstado] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!url || !esPDF(url)) return;
    let cancelled = false;
    setEstado('loading');

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjsLib.getDocument({
          url,
          disableRange: true,
          disableStream: true,
        }).promise;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.6 });

        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) {
          setImgSrc(canvas.toDataURL('image/jpeg', 0.85));
          setEstado('done');
        }
      } catch {
        if (!cancelled) setEstado('error');
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;

  // ── Imagen normal ──────────────────────────────────
  if (!esPDF(url)) {
    return (
      <img
        src={url}
        alt="plano"
        style={IMG_STYLE}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  // ── PDF: cargando ──────────────────────────────────
  if (estado === 'loading') {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: '#F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{
          width: 18, height: 18,
          border: '2px solid #BFCFEF',
          borderTopColor: '#2462C9',
          borderRadius: '50%',
          animation: '_spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  // ── PDF: renderizado ───────────────────────────────
  if (estado === 'done' && imgSrc) {
    return <img src={imgSrc} alt="plano" style={IMG_STYLE} />;
  }

  // ── PDF: fallback ──────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#F1F5F9',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8, fontSize: 28,
    }}>
      <span>📄</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Plano PDF</span>
    </div>
  );
};