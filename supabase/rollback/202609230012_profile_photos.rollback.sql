begin;
drop policy if exists plan_profile_photos_read on storage.objects;
drop policy if exists plan_profile_photos_insert on storage.objects;
drop policy if exists plan_profile_photos_delete on storage.objects;
-- No se elimina el bucket ni sus imágenes: contienen datos de los usuarios.
commit;
