export type AssistantDestination = 'dashboard' | 'proyectos' | 'grilla' | 'creador' | 'responsables' | 'contratistas' | 'gantt' | 'calendario' | 'ayuda' | 'configuracion' | 'asistente';
export type AssistantCommand =
  | { kind: 'navigate'; destination: AssistantDestination }
  | { kind: 'filter'; estado?: string; rubro?: string; reset?: 'estado' | 'all' }
  | { kind: 'project'; action: 'create' | 'plan'; query: string }
  | { kind: 'unsupported'; text: string };

export const normalizeAssistantText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Only the user's own message can trigger a command. Model output is never
// interpreted as a command, SQL, HTML, a link to open, or a record mutation.
export function parseAssistantCommand(message: string): AssistantCommand | null {
  const text = normalizeAssistantText(message).replace(/^[¿¡]\s*/, '');
  if (/\b(borra|borrar|elimina|eliminar|suprime|suprimir|migrar|restaurar|enviar|publicar)\b/.test(text))
    return { kind: 'unsupported', text: 'No ejecuto borrados, recuperaciones, publicaciones ni envíos desde el diálogo. Esas acciones se revisan en su pantalla correspondiente.' };
  if (/^(?:ver|mostra|mostrar|volver a ver)\s+(?:todos?|todas?)(?:\s+(?:los\s+)?estados)?(?:\s+de\s+vuelta)?[.?!]*$/.test(text))
    return { kind: 'filter', reset: 'estado' };
  if (/^(?:quitar|limpiar|sacar)\s+(?:todos\s+)?(?:los\s+)?filtros[.?!]*$/.test(text))
    return { kind: 'filter', reset: 'all' };
  if (/\b(filtra|filtrar|mostra|mostrar|ver)\b/.test(text)) {
    const estado = /\bpendientes?\b/.test(text) ? 'Pendiente' : /\bcerrad[oa]s?\b/.test(text) ? 'Cerrada' : /\ben proceso\b/.test(text) ? 'En proceso' : /\bno aplica\b/.test(text) ? 'No aplica' : undefined;
    const match = text.match(/(?:rubro\s+|(?:pendientes?|cerrad[oa]s?|en proceso)\s+(?:de\s+)?)(.+)$/);
    const rubro = match?.[1]?.replace(/[.?!]+$/, '').trim();
    if (estado || rubro) return { kind: 'filter', estado, rubro };
    if (/\bfiltra|\bfiltrar/.test(text)) return { kind: 'unsupported', text: 'Puedo filtrar el dashboard por estado y rubro. Decime, por ejemplo, el estado y el nombre del rubro.' };
  }
  if (/\b(carga|cargar|subi|subir)\b.*\bplano\b/.test(text))
    return { kind: 'project', action: 'plan', query: message.replace(/^.*?\bplano\b\s*(?:en|de|para)?\s*/i, '').trim() };
  if (/\b(crea|crear|nuevo)\b.*\bproyecto\b|\bproyecto nuevo\b/.test(text))
    return { kind: 'project', action: 'create', query: '' };
  if (!/^(?:(?:por favor|podes|puedes|podrias|quiero|necesito)\s+)*(?:ir|anda|ve|vamos|abrir|abri|abre|lleva|llevar|llevame|llevarme|mostra|mostrar|volver|volve)\b/.test(text)) return null;
  const routes: [RegExp, AssistantDestination][] = [
    [/\b(dashboard|tablero)\b/, 'dashboard'], [/\bproyectos?\b/, 'proyectos'], [/\bgrilla\b/, 'grilla'],
    [/\badministracion\b/, 'creador'], [/\bresponsables?\b/, 'responsables'], [/\bcontratistas?\b/, 'contratistas'],
    [/\bgantt\b/, 'gantt'], [/\bcalendario\b/, 'calendario'], [/\bayuda\b/, 'ayuda'], [/\bconfiguracion\b/, 'configuracion'], [/\bmi asistente\b/, 'asistente'],
  ];
  const route = routes.find(([pattern]) => pattern.test(text));
  return route ? { kind: 'navigate', destination: route[1] } : null;
}
