begin;

create or replace function public.plan_eventos_pagina(p_orden uuid default null,p_antes timestamptz default null,p_id uuid default null)
 returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 with pagina as (
 select e.*,exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid()) as leida
 from public.plan_ot_eventos e
 where ((p_orden is null and not e.legado) or e.orden_id=p_orden)
 and (p_antes is null or (e.created_at,e.id)<(p_antes,p_id))
 order by e.created_at desc,e.id desc limit 51
 ) select jsonb_build_object('eventos',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from
 (select * from pagina order by created_at desc,id desc limit 50) x),'[]'::jsonb),
 'hayMas',(select count(*)>50 from pagina),
 'sinLeer',(select count(*) from public.plan_ot_eventos e where not e.legado and not exists(select 1 from public.plan_eventos_lecturas l where l.evento_id=e.id and l.user_id=auth.uid())));
 $$;

drop function if exists public.plan_configurar_notificaciones(uuid,text,text[]);
drop function if exists public.plan_notificaciones_config(uuid);
drop table if exists public.plan_notificaciones_rol;
notify pgrst, 'reload schema';
commit;
