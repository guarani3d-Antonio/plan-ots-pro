import * as pdfjsLib from 'pdfjs-dist'

// Worker de pdfjs — mismo CDN que VistaPlano. La asignación es idempotente:
// si VistaPlano ya lo seteó, sobrescribirlo con el mismo valor no rompe nada.
// Lo seteamos acá también para no depender de que VistaPlano haya sido
// importado antes (p.ej. cuando se entra directo al SelectorProyectos).
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// Cache en memoria: url → dataURL PNG
const cache = new Map<string, string>()

export async function generarThumbnailPDF(
  url: string,
  ancho = 800   // resolución alta → se escala bien en la card
): Promise<string | null> {
  // Devolver desde caché si ya fue generado
  if (cache.has(url)) return cache.get(url)!

  try {
    const loadingTask = pdfjsLib.getDocument({
      url,
      disableRange: true,      // obligatorio para Supabase Storage
      disableStream: true,     // obligatorio para Supabase Storage
    })

    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)   // primera página

    // Calcular escala para obtener ~`ancho` px de ancho final
    const viewport = page.getViewport({ scale: 1 })
    const scale = ancho / viewport.width
    const scaledViewport = page.getViewport({ scale })

    // Crear canvas offscreen
    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height

    const ctx = canvas.getContext('2d')!

    // Fondo blanco para que los planos se vean bien
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
    }).promise

    // Exportar como PNG de alta calidad
    const dataUrl = canvas.toDataURL('image/png', 1.0)

    // Guardar en caché
    cache.set(url, dataUrl)

    // Limpiar recursos
    page.cleanup()
    pdf.cleanup?.()

    return dataUrl
  } catch (err) {
    console.warn('Error generando thumbnail PDF:', url, err)
    return null
  }
}

export function limpiarCacheThumbnails() {
  cache.clear()
}
