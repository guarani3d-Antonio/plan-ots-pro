import type { AssistantStatus } from './assistantService';

export function assistantConnection(status: AssistantStatus | null, failed = false) {
  if (failed) return { active: false, label: 'No se pudo comprobar la API', detail: 'Actualizá el estado. No se hacen consultas pagas al comprobarlo.' };
  if (!status) return { active: false, label: 'Revisando API…', detail: 'Los comandos de navegación funcionan sin consumir tokens.' };
  if (!status.ready) return { active: false, label: 'Servicio de IA no disponible', detail: 'Los comandos de navegación siguen disponibles.' };
  if (!status.connected) return { active: false, label: 'Sin API configurada', detail: 'Conectá tu API personal en Mi asistente.' };
  const verified = status.verification?.verifiedAt;
  if (verified && Number.isFinite(Date.parse(verified)) && status.verification?.lastAttemptState === 'completed') {
    return { active: true, label: 'API verificada', detail: `Última consulta correcta: ${new Date(verified).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })}.` };
  }
  return { active: false, label: 'API guardada · pendiente de verificar', detail: status.verification?.lastAttemptState === 'uncertain' ? 'La última consulta no pudo confirmarse. Revisá el mensaje de error; no se reintenta automáticamente.' : 'La verificación requiere una consulta exitosa, con tu confirmación previa del costo.' };
}
