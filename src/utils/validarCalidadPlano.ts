export async function validarCalidadPlano(file: File): Promise<{ valido: boolean; error?: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > 20 * 1024 * 1024)
      return { valido: false, error: 'El PDF supera el máximo de 20 MB.' };
    return { valido: true };
  }

  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!imageTypes.includes(file.type))
    return { valido: false, error: 'Formato no soportado. Usá PDF, PNG, JPG o WebP.' };
  if (file.size < 200 * 1024)
    return { valido: false, error: 'Imagen demasiado pequeña (< 200 KB). El plano puede verse pixelado.' };
  if (file.size > 20 * 1024 * 1024)
    return { valido: false, error: 'La imagen supera el máximo de 20 MB.' };

  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < 1800 || img.height < 1200) {
        resolve({ valido: false, error: `Resolución insuficiente: ${img.width}×${img.height}px. Mínimo requerido: 1800×1200px. Subí el plano en mayor calidad o usá PDF.` });
      } else resolve({ valido: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valido: false, error: 'No se pudo leer la imagen.' });
    };
    img.src = url;
  });
}
