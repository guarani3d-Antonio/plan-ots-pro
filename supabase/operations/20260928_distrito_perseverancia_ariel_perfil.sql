-- Completa el nombre de la cuenta ya invitada sin reemplazar otros metadatos.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('nombre', 'Ariel', 'apellidos', 'Jara')
where lower(email) = 'ajara@benitezbittar.com.py'
  and id = 'e30e3355-ebad-4b7c-84fd-f2ef810e1cc4';

select email, raw_user_meta_data->>'nombre' as nombre,
  raw_user_meta_data->>'apellidos' as apellidos
from auth.users
where id = 'e30e3355-ebad-4b7c-84fd-f2ef810e1cc4';
