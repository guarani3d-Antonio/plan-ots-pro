begin;
drop function if exists public.plan_alta_cliente_obra(uuid,uuid,uuid,jsonb);
drop function if exists public.plan_clientes_gestion_obra(uuid);
-- Se conservan todos los clientes y ubicaciones creados.
commit;
