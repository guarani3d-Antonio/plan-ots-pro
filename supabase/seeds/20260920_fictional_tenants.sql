-- Aprovisionamiento determinista de las dos empresas ficticias.
-- Requiere: fases 1 y 2 aplicadas y las 11 cuentas Auth creadas por canal Admin.
-- No crea usuarios, contraseñas ni invitaciones. Aborta si falta o sobra un email.
-- Conserva los proyectos legados; no requiere ni ejecuta un reset.

begin;
set local lock_timeout='5s';
set local statement_timeout='90s';

do $$ begin
  if current_user<>'postgres' then raise exception 'Ejecutar seed mediante postgres'; end if;
  if not exists(select 1 from pg_proc where oid='public.plan_es_miembro_proyecto(uuid)'::regprocedure) then
    raise exception 'Falta la fase 2 multitenant';
  end if;
  if exists(select 1 from public.tenants) or exists(select 1 from public.proyectos where tenant_id is not null) then
    raise exception 'Seed detenido: ya existen empresas o proyectos gestionados.';
  end if;
end $$;

create temporary table plan_fixture_users(email text primary key,user_id uuid not null unique) on commit drop;
insert into plan_fixture_users(email,user_id)
select lower(email),id from auth.users where lower(email)=any(array[
  'creador@plan-ots.test',
  'admin@empresa1.plan-ots.test','supervisor@empresa1.plan-ots.test','tecnico1@empresa1.plan-ots.test','tecnico2@empresa1.plan-ots.test','lector@empresa1.plan-ots.test',
  'admin@empresa2.plan-ots.test','supervisor@empresa2.plan-ots.test','tecnico1@empresa2.plan-ots.test','tecnico2@empresa2.plan-ots.test','lector@empresa2.plan-ots.test'
]);
do $$ begin
  if (select count(*) from plan_fixture_users)<>11 then
    raise exception 'Se esperaban 11 cuentas Auth ficticias exactas; encontradas %',(select count(*) from plan_fixture_users);
  end if;
end $$;

insert into public.tenants(id,slug,nombre,created_by) values
('10000000-0000-4000-8000-000000000001','empresa-prueba-1','Empresa de prueba 1',(select user_id from plan_fixture_users where email='creador@plan-ots.test')),
('20000000-0000-4000-8000-000000000002','empresa-prueba-2','Empresa de prueba 2',(select user_id from plan_fixture_users where email='creador@plan-ots.test'));
insert into public.plataforma_administradores(user_id,created_by)
select user_id,user_id from plan_fixture_users where email='creador@plan-ots.test';

insert into public.tenant_miembros(tenant_id,user_id,rol,created_by)
select m.tenant_id,u.user_id,m.rol,(select user_id from plan_fixture_users where email='creador@plan-ots.test')
from (values
 ('10000000-0000-4000-8000-000000000001'::uuid,'admin@empresa1.plan-ots.test','administrador'),
 ('10000000-0000-4000-8000-000000000001'::uuid,'supervisor@empresa1.plan-ots.test','supervisor'),
 ('10000000-0000-4000-8000-000000000001'::uuid,'tecnico1@empresa1.plan-ots.test','tecnico'),
 ('10000000-0000-4000-8000-000000000001'::uuid,'tecnico2@empresa1.plan-ots.test','tecnico'),
 ('10000000-0000-4000-8000-000000000001'::uuid,'lector@empresa1.plan-ots.test','viewer'),
 ('20000000-0000-4000-8000-000000000002'::uuid,'admin@empresa2.plan-ots.test','administrador'),
 ('20000000-0000-4000-8000-000000000002'::uuid,'supervisor@empresa2.plan-ots.test','supervisor'),
 ('20000000-0000-4000-8000-000000000002'::uuid,'tecnico1@empresa2.plan-ots.test','tecnico'),
 ('20000000-0000-4000-8000-000000000002'::uuid,'tecnico2@empresa2.plan-ots.test','tecnico'),
 ('20000000-0000-4000-8000-000000000002'::uuid,'lector@empresa2.plan-ots.test','viewer')
) m(tenant_id,email,rol) join plan_fixture_users u using(email);

insert into public.proyectos(id,tenant_id,nombre,cliente,descripcion,plano_url,created_by) values
('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Obra de la empresa de prueba 1, número 1','Empresa de prueba 1','Fixture de aislamiento','/fixtures/plano-prueba.svg',(select user_id from plan_fixture_users where email='admin@empresa1.plan-ots.test')),
('11000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Obra de la empresa de prueba 1, número 2','Empresa de prueba 1','Fixture de aislamiento','/fixtures/plano-prueba.svg',(select user_id from plan_fixture_users where email='admin@empresa1.plan-ots.test')),
('22000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Obra de la empresa de prueba 2, número 1','Empresa de prueba 2','Fixture de aislamiento','/fixtures/plano-prueba.svg',(select user_id from plan_fixture_users where email='admin@empresa2.plan-ots.test')),
('22000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Obra de la empresa de prueba 2, número 2','Empresa de prueba 2','Fixture de aislamiento','/fixtures/plano-prueba.svg',(select user_id from plan_fixture_users where email='admin@empresa2.plan-ots.test'));

insert into public.proyecto_miembros(proyecto_id,user_id,rol,invitado_por)
select m.proyecto_id,u.user_id,m.rol,a.user_id
from (values
 ('11000000-0000-4000-8000-000000000001'::uuid,'supervisor@empresa1.plan-ots.test','supervisor','admin@empresa1.plan-ots.test'),
 ('11000000-0000-4000-8000-000000000002'::uuid,'supervisor@empresa1.plan-ots.test','supervisor','admin@empresa1.plan-ots.test'),
 ('11000000-0000-4000-8000-000000000001'::uuid,'tecnico1@empresa1.plan-ots.test','tecnico','admin@empresa1.plan-ots.test'),
 ('11000000-0000-4000-8000-000000000002'::uuid,'tecnico2@empresa1.plan-ots.test','tecnico','admin@empresa1.plan-ots.test'),
 ('11000000-0000-4000-8000-000000000001'::uuid,'lector@empresa1.plan-ots.test','viewer','admin@empresa1.plan-ots.test'),
 ('22000000-0000-4000-8000-000000000001'::uuid,'supervisor@empresa2.plan-ots.test','supervisor','admin@empresa2.plan-ots.test'),
 ('22000000-0000-4000-8000-000000000002'::uuid,'supervisor@empresa2.plan-ots.test','supervisor','admin@empresa2.plan-ots.test'),
 ('22000000-0000-4000-8000-000000000001'::uuid,'tecnico1@empresa2.plan-ots.test','tecnico','admin@empresa2.plan-ots.test'),
 ('22000000-0000-4000-8000-000000000002'::uuid,'tecnico2@empresa2.plan-ots.test','tecnico','admin@empresa2.plan-ots.test'),
 ('22000000-0000-4000-8000-000000000001'::uuid,'lector@empresa2.plan-ots.test','viewer','admin@empresa2.plan-ots.test')
) m(proyecto_id,email,rol,admin_email)
join plan_fixture_users u on u.email=m.email
join plan_fixture_users a on a.email=m.admin_email;

do $$ begin
  if (select count(*) from public.tenants)<>2 or (select count(*) from public.proyectos where tenant_id is not null)<>4
    or (select count(*) from public.tenant_miembros)<>10 or (select count(*) from public.proyecto_miembros where tenant_id is not null)<>14 then
    raise exception 'Conteos de fixtures inesperados';
  end if;
end $$;
commit;
