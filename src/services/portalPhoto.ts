const supported = ['image/jpeg', 'image/png', 'image/webp'];

/** Prepara la copia que se admitirá como evidencia; el límite del servidor no cambia. */
export async function prepararFotoPortal(file: File, maxBytes: number): Promise<File> {
  if (!file.size || file.size > 32 * 1024 * 1024) {
    throw new Error('Elegí una foto de hasta 32 MB para prepararla.');
  }
  // iOS puede entregar la captura sin MIME. Identificar el archivo evita rechazarla
  // por ese detalle, sin admitir contenido ajeno a una foto.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  const type = head[0] === 255 && head[1] === 216 && head[2] === 255 ? 'image/jpeg'
    : head[0] === 137 && ascii(1, 4) === 'PNG' ? 'image/png'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp' : '';
  const heic = ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(ascii(8, 12));
  if (!type && !heic) throw new Error('Elegí una foto JPG, PNG, WebP o HEIC.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo leer esta foto. Probá con JPG o elegila desde Galería.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La foto no se pudo leer. Probá nuevamente.');
    if (supported.includes(type) && file.size <= maxBytes && Math.max(image.naturalWidth, image.naturalHeight) <= 1920) {
      return type === file.type ? file : new File([file], file.name, {type, lastModified: file.lastModified});
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la foto. Probá nuevamente.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.76, 0.64]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`, {type: 'image/jpeg', lastModified: file.lastModified});
      }
    }
    throw new Error('No se pudo reducir la foto al límite de envío. Elegí otra foto.');
  } finally {
    image.onload = image.onerror = null;
    URL.revokeObjectURL(url);
  }
}
