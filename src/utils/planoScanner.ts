export interface ScannerOptions {
  maxDimension?: number;
  blackPoint?: number;   // default: 30  — punto negro de entrada
  whitePoint?: number;   // default: 215 — punto blanco de entrada
}

export function esPDFFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

export function esPDFUrl(url: string): boolean {
  return url.toLowerCase().includes('.pdf');
}

export async function procesarPlanoCanvas(
  file: File,
  opts: ScannerOptions = {}
): Promise<Blob> {
  const {
    maxDimension = 2400,
    blackPoint   = 30,
    whitePoint   = 215,
  } = opts;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDimension || h > maxDimension) {
        const ratio = Math.min(maxDimension / w, maxDimension / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }

      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const range = whitePoint - blackPoint;

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale via luminance (ITU-R BT.601)
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // Levels stretch: [blackPoint, whitePoint] → [0, 255]
        // Preserva detalle, no destruye mid-tones como el threshold binario
        const val = Math.max(0, Math.min(255, Math.round((luma - blackPoint) / range * 255)));

        data[i]     = val;
        data[i + 1] = val;
        data[i + 2] = val;
        // alpha untouched
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob() returned null'));
        },
        'image/png'
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load image for canvas processing'));
    };

    img.src = objectUrl;
  });
}