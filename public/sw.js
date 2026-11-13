// CAMBIAR EN CADA RELEASE: si el contenido estático cambia y el nombre del caché
// no cambia, los navegadores conservan el Service Worker viejo y la app nunca
// se actualiza en los equipos instalados. Mantener sincronizado con package.json.
const APP_VERSION = '0.2.0';
const CACHE_NAME = `kastral-offline-${APP_VERSION}`;

const CORE_ROUTES = [
  '/',
  '/manifest.webmanifest',
  '/como-funciona',
  '/privacidad',
  '/condiciones',
  '/contacto',
  '/assets/brand/image_8099a79d.png',
  '/assets/brand/image_a3e77aab.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/herramientas/convertir-imagen',
  '/herramientas/comprimir-imagen',
  '/herramientas/redimensionar-imagen',
  '/herramientas/comprimir-pdf',
  '/herramientas/combinar-pdf',
  '/herramientas/dividir-pdf',
  '/herramientas/extraer-paginas-pdf',
  '/herramientas/imagenes-a-pdf',
  '/herramientas/pdf-a-imagenes',
  '/herramientas/convertir-documento',
  '/herramientas/convertir-hoja-calculo',
  '/herramientas/convertir-audio',
  '/herramientas/convertir-video',
  '/herramientas/comprimir-video',
  '/herramientas/extraer-audio-video',
  '/herramientas/crear-zip',
  '/herramientas/extraer-zip',
  '/herramientas/girar-pdf',
  '/herramientas/marca-agua-pdf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const route of CORE_ROUTES) {
        try {
          await cache.add(route);
        } catch {
          // Ignorar rutas individuales que aún no estén pre-renderizadas
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // No interceptar endpoints de API ni hot-reload de desarrollo webpack
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('webpack-hmr') ||
    url.pathname.includes('_next/webpack')
  ) {
    return;
  }

  // Estrategia Network-First con respaldo 100% Offline en caché:
  // Evita colisiones de chunks de Webpack al actualizar y garantiza funcionamiento total sin Internet.
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'default')
        ) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        if (request.mode === 'navigate') {
          const rootCache = await caches.match('/');
          if (rootCache) return rootCache;
        }
        return new Response('Modo local sin conexión activo', { status: 503 });
      })
  );
});
