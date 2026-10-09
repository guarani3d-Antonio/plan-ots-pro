import { createClient } from 'npm:@supabase/supabase-js@2';

const origin = 'https://plan-ots-pro.pages.dev';
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validRoles = new Set(['administrador', 'supervisor', 'tecnico', 'viewer']);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (request.headers.get('origin') !== origin) return json({ error: 'Origen no permitido' }, 403);
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sesión requerida' }, 401);

  let body: { tenantId?: unknown; email?: unknown; rol?: unknown; proyectoId?: unknown; nombre?: unknown; apellidos?: unknown; equipo?:unknown; superiorId?:unknown; perfil?:unknown; obras?:unknown };
  try { body = await request.json(); }
  catch { return json({ error: 'Solicitud inválida' }, 400); }
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const rol = typeof body.rol === 'string' ? body.rol : '';
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const apellidos = typeof body.apellidos === 'string' ? body.apellidos.trim() : '';
  if (!uuid.test(tenantId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validRoles.has(rol))
    return json({ error: 'Empresa, correo o rol inválido' }, 400);
  if (nombre.length > 100 || apellidos.length > 100) return json({ error: 'Nombre demasiado largo' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Servicio sin configurar' }, 500);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: identityError } = await userClient.auth.getUser(authorization.slice(7));
  if (identityError || !identity.user) return json({ error: 'Sesión inválida' }, 401);
  const { data: isCreator, error: roleError } = await userClient.rpc('plan_es_creador');
  if (roleError) return json({ error: 'No se pudo comprobar el permiso' }, 403);
  if(body.equipo===true){
    const superior=typeof body.superiorId==='string'?body.superiorId:'';
    const perfil=typeof body.perfil==='string'?body.perfil:'';
    const obras=Array.isArray(body.obras)?body.obras:[];
    if(!uuid.test(superior)||!['tecnico','ayudante','lector'].includes(perfil)||obras.length<1||obras.length>1000||obras.some(v=>typeof v!=='string'||!uuid.test(v)))return json({error:'Revisá el superior, el perfil y las obras.'},400);
    const reserved=await userClient.rpc('plan_equipo_reservar',{p_tenant:tenantId,p_superior:superior,p_email:email,p_perfil:perfil,p_obras:obras});
    if(reserved.error||typeof reserved.data!=='string')return json({error:reserved.error?.message??'No se pudo reservar el cupo.'},403);
    const reservation=reserved.data;
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const invited=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${origin}/?activar=1`,data:{nombre,apellidos}});
    if(invited.error||!invited.data.user?.id){await admin.rpc('plan_equipo_cancelar',{p_reserva:reservation});return json({error:invited.error?.message??'No se pudo crear la cuenta.'},400)}
    const assigned=await admin.rpc('plan_equipo_confirmar',{p_reserva:reservation,p_usuario:invited.data.user.id});
    if(assigned.error)return json({error:'El correo fue enviado, pero la autorización cambió antes de asignar el acceso. La cuenta no recibió acceso. Revisá la invitación pendiente.'},409);
    return json({invited:true,email,tenantId,perfil});
  }
  if(!isCreator)return json({error:'Administrá las invitaciones desde Mi empresa → Usuarios.'},403);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tenant, error: tenantError } = await admin.from('tenants').select('id,activo').eq('id', tenantId).single();
  if (tenantError || !tenant?.activo) return json({ error: 'Empresa inexistente o inactiva' }, 400);

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/?activar=1`,
    data: { nombre, apellidos },
  });
  if (invited.error || !invited.data.user?.id) {
    return json({ error: invited.error?.message ?? 'Auth no devolvió la cuenta invitada' }, invited.error ? 400 : 502);
  }

  const membership = await userClient.rpc('plan_admin_miembro', {
    p_tenant: tenantId, p_email: email, p_rol: rol, p_activo: true,
  });
  if (membership.error) return json({ error: 'Invitación enviada, pero no se pudo asignar el rol. Reintentá con «Guardar cuenta y rol».' }, 502);
  return json({ invited: true, email, tenantId, rol });
});
