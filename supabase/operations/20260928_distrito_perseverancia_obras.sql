-- Ejecutar en el SQL Editor de Plan-ots-2, despues de las migraciones 019 y 020.
-- Idempotente: conserva cualquier obra ya creada con el mismo nombre y empresa.
begin;
do $$
declare
  v_creador uuid;
  v_empresa uuid;
  v_nombre text;
  v_descripcion text;
  v_obra uuid;
begin
  select u.id into v_creador
  from auth.users u join public.plataforma_administradores pa on pa.user_id=u.id and pa.activo
  where lower(u.email)='guarani3d@gmail.com';
  if v_creador is null then raise exception 'No se encontró la cuenta Creador autorizada'; end if;
  perform set_config('request.jwt.claim.sub',v_creador::text,true);

  if (select count(*) from public.tenants where nombre='Benítez Bittar Constructora') > 1 then
    raise exception 'Hay empresas duplicadas: revisar manualmente antes de continuar';
  end if;
  select id into v_empresa from public.tenants where nombre='Benítez Bittar Constructora';
  if v_empresa is null then
    v_empresa:=public.plan_admin_empresa('Benítez Bittar Constructora');
  elsif not exists (select 1 from public.tenants where id=v_empresa and activo) then
    raise exception 'La empresa existe pero está inactiva';
  end if;

  for v_nombre,v_descripcion in
    select * from (values
      ('Torre Marfil — Distrito Perseverancia','Torre corporativa'),
      ('Centro Comercial Distrito Perseverancia','Centro comercial'),
      ('Torre Güembé — Distrito Perseverancia','Torre residencial en altura'),
      ('Torre Las Palmas — Distrito Perseverancia','Torre residencial en altura')
    ) as obras(nombre,descripcion)
  loop
    if (select count(*) from public.proyectos where tenant_id=v_empresa and nombre=v_nombre and deleted_at is null) > 1 then
      raise exception 'Obra duplicada: %',v_nombre;
    end if;
    select id into v_obra from public.proyectos
      where tenant_id=v_empresa and nombre=v_nombre and deleted_at is null;
    if v_obra is null then
      select p.id into v_obra from public.plan_crear_proyecto(
        p_nombre=>v_nombre,
        p_plano_url=>'pending://plan-upload-required',
        p_cliente=>'Benítez Bittar Constructora',
        p_descripcion=>v_descripcion,
        p_tenant_id=>v_empresa
      ) p;
    end if;
  end loop;
end $$;
commit;

select t.nombre as empresa,p.nombre as obra,p.plano_url
from public.tenants t join public.proyectos p on p.tenant_id=t.id
where t.nombre='Benítez Bittar Constructora' and p.deleted_at is null
order by p.nombre;
