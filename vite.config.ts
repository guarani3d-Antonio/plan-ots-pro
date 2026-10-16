/// <reference lib="webworker" />
import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function appVersion(): Plugin {
  const id = (process.env.CF_PAGES_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim()).slice(0,7);
  const version = {schema:1, id, builtAt:Date.now()};
  return {name:'planots-app-version', transformIndexHtml:()=>[
    {tag:'meta',attrs:{name:'planots-build',content:id},injectTo:'head'},
    {tag:'meta',attrs:{name:'planots-built-at',content:String(version.builtAt)},injectTo:'head'},
  ], generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify(version)});}};
}

export default defineConfig({
  plugins: [
    react(),
    appVersion(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // manifest.json lives in /public — we don't duplicate it here
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.ico'],
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: null,
        importScripts: ['/storage-cache-cleanup.js'],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ico}'],
        // Don't precache pdf.worker (too large, loaded on demand)
        globIgnores: ['**/pdf.worker*', '**/registerSW.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB — lo exige
        // únicamente el bundle principal (2,07 MiB), que no está dividido en
        // chunks. El fondo obra_bg ya no pesa: pasó de PNG de 2,78 MB a JPEG
        // de ~345 KB y además .jpg no entra en globPatterns. Cuando el bundle
        // se parta en chunks, este límite puede volver al default (2 MiB).
        runtimeCaching: [
          {
            // HTML actual cuando hay conexión; la última página válida cuando no la hay.
            urlPattern: ({request,url}) => request.mode === 'navigate' && url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html'),
            handler: 'NetworkFirst',
            options: {
              cacheName:'planots-navigation-v1', networkTimeoutSeconds:6,
              cacheableResponse:{statuses:[200]},
              plugins:[{
                cacheKeyWillBeUsed: async ({request}) => {
                  const url=new URL(request.url);url.pathname='/';url.searchParams.delete('release');return url.href;
                },
                fetchDidSucceed: async ({request,response}) => {
                  if(!response.ok)throw new Error('Navegación sin respuesta válida.');
                  const key=new URL(request.url);key.pathname='/';key.searchParams.delete('release');
                  const previous=await (await caches.open('planots-navigation-v1')).match(key.href);
                  if(previous && response.ok){
                    const marker=/<meta\s+name="planots-built-at"\s+content="(\d+)"/;
                    const prior=Number((await previous.text()).match(marker)?.[1]||0);
                    const next=Number((await response.clone().text()).match(marker)?.[1]||0);
                    if(prior>next)throw new Error('Respuesta HTML anterior a la versión conservada.');
                  }
                  return response;
                },
                handlerDidError: async () => (await caches.match('/index.html',{ignoreSearch:true})) || Response.error(),
              }],
            },
          },
          {
            // Las respuestas privadas no se comparten ni sobreviven a una sesión en CacheStorage.
            urlPattern: /^https:\/\/iqgbyqyoovzvhhdjawnt\.supabase\.co\/(?:storage|rest)\/.*/,
            handler: 'NetworkOnly',
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
