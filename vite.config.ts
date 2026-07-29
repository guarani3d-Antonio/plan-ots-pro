import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest.json lives in /public — we don't duplicate it here
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.ico'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ico}'],
        // Don't precache pdf.worker (too large, loaded on demand)
        globIgnores: ['**/pdf.worker*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB — cubre el
        // bundle actual (2.17MB) y el fondo obra_bg (2.78MB) hasta que se optimicen
        runtimeCaching: [
          {
            // Supabase Storage: planos y fotos → cache-first (archivos no cambian una vez subidos)
            urlPattern: /^https:\/\/iqgbyqyoovzvhhdjawnt\.supabase\.co\/storage\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
          {
            // Supabase REST API → network-first con fallback offline
            urlPattern: /^https:\/\/iqgbyqyoovzvhhdjawnt\.supabase\.co\/rest\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 horas
              },
            },
          },
          {
            // CDN de pdf.js worker → cache-first (versión fija)
            urlPattern: /cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-cdn',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Escuchar en todas las interfaces, no solo en loopback. Habilita tanto el
    // túnel como el acceso directo por LAN desde la tablet (http://<ip>:5173),
    // que es más rápido y no depende de que el túnel siga vivo.
    host: true,
    // Vite bloquea por default los hosts desconocidos como defensa contra DNS
    // rebinding. El punto inicial es la sintaxis oficial para "este dominio y
    // cualquier subdominio": localtunnel genera un subdominio nuevo en cada
    // reinicio, así que fijar uno solo no sirve.
    // Solo afecta al servidor de desarrollo — no toca el build de producción.
    allowedHosts: ['.loca.lt'],
  },
});