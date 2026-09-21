// Retira exclusivamente las cachés privadas antiguas al activar esta versión.
// No borra IndexedDB ni operaciones pendientes del usuario.
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all(['supabase-storage', 'supabase-api'].map(name => caches.delete(name))));
});
