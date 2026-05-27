/**
 * iaService.ts
 * Servicio para análisis de fotos con IA (claude-haiku-4-5)
 * No-blocking: si falla, retorna string vacío sin romper el flujo
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const IA_MODEL = 'claude-haiku-4-5-20251001';

const PROMPT_DESCRIPCION = `Sos un asistente técnico especializado en facility services y mantenimiento de edificios. Analizá esta foto de una orden de trabajo y generá una descripción técnica objetiva y concisa. La descripción debe:
- Tener máximo 3 oraciones
- Describir el estado visual actual de la tarea o instalación fotografiada
- Usar terminología técnica de construcción y mantenimiento
- Ser objetiva y factual, sin interpretaciones subjetivas
Respondé SOLO con la descripción, sin introducción ni comentarios adicionales.`;

async function urlABase64(url: string): Promise<{ data: string; mediaType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo obtener la imagen: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      const mediaType = blob.type || 'image/jpeg';
      resolve({ data: base64, mediaType });
    };
    reader.onerror = () => reject(new Error('Error al leer imagen'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Analiza una foto y retorna descripción técnica generada por IA.
 * Retorna string vacío si la key no está configurada o si ocurre algún error.
 */
export async function describirFotoConIA(imageUrl: string): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'dummy' || apiKey.length < 20) {
    console.info('[iaService] API key no configurada — modo manual');
    return '';
  }

  try {
    const { data, mediaType } = await urlABase64(imageUrl);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: IA_MODEL,
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data,
                },
              },
              {
                type: 'text',
                text: PROMPT_DESCRIPCION,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn('[iaService] Error API:', response.status, errorBody);
      return '';
    }

    const result = await response.json();
    const texto = result.content?.[0]?.text?.trim() ?? '';
    console.info('[iaService] Descripción generada OK:', texto.substring(0, 60) + '...');
    return texto;

  } catch (err) {
    console.warn('[iaService] Error al describir foto — continuando sin IA:', err);
    return '';
  }
}