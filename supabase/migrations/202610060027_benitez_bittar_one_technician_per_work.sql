begin;

-- Piloto Benítez Bittar: un único técnico delegado por obra principal.
-- La reserva fallida se elimina por la Edge Function; la enviada conserva
-- su cupo y trazabilidad. No cambia la política de otras empresas.
create unique index if not exists plan_bbc_una_invitacion_por_obra
  on public.plan_invitaciones_equipo(proyecto_id)
  where tenant_id = '9159153b-eac0-49df-80d5-649ced2c7887'::uuid;

commit;
