import type { AssistantStatus } from './assistantService';

export function assistantConnection(status: AssistantStatus | null, failed = false) {
  if (failed) return { active: false, verified: false, label: 'No se pudo comprobar la API', detail: 'Actualizá el estado. No se hacen consultas pagas al comprobarlo.' };
  if (!status) return { active: false, verified: false, label: 'Revisando API…', detail: 'Los comandos de navegación funcionan sin consumir tokens.' };
  if (!status.ready) return { active: false, verified: false, label: 'Servicio de IA no disponible', detail: 'Los comandos de navegación siguen disponibles.' };
  if (!status.connected) return { active: false, verified: false, label: 'Sin API configurada', detail: 'Conectá tu API personal en Mi asistente.' };
  const provider = status.provider === 'openai' ? 'OpenAI' : status.provider === 'anthropic' ? 'Anthropic (Claude)' : 'API';
  const verified = status.verification?.verifiedAt;
  if (verified && Number.isFinite(Date.parse(verified)) && status.verification?.lastAttemptState === 'completed') {
    return { active: true, verified: true, label: `${provider} · API verificada`, detail: `Última consulta correcta: ${new Date(verified).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })}.` };
  }
  if (status.verification?.lastAttemptState === 'uncertain') return { active: false, verified: false, label: `${provider} · última consulta sin confirmar`, detail: 'Revisá el mensaje de error; no se reintenta automáticamente.' };
  return { active: true, verified: false, label: `${provider} configurada · pendiente de verificar`, detail: 'Tu API está guardada cifrada y el servicio está habilitado. Falta comprobar una respuesta del proveedor, con tu confirmación previa del costo.' };
}
