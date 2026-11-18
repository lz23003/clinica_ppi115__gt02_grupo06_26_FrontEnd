/**
 * Service Worker — ClinicaSV PWA
 * Estrategias:
 *  - App shell (HTML, CSS, JS propios): cache-first
 *  - API REST (/api/v1/*): network-first con fallback a caché
 *  - Otros GET: network-first con fallback a caché
 *  - Non-GET (POST/PUT/DELETE): siempre red (sin caché)
 */


const VERSION = 'clinicasv-v1.1.0';
const SHELL_CACHE = `${VERSION}-shell`;
const API_CACHE = `${VERSION}-api`;
const ASSET_CACHE = `${VERSION}-assets`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/main.js',
  
  // --- Estilos Globales ---
  './src/styles/tokens.css',
  './src/styles/global.css',
  
  // --- Estilos de Componentes (Nuevos) ---
  './src/styles/components/ui-button.css',
  './src/styles/components/ui-input.css',
  './src/styles/components/ui-select.css',
  './src/styles/components/ui-confirm.css',
  './src/styles/components/ui-connection-status.css',
  './src/styles/components/ui-checkbox.css',
  './src/styles/components/ui-textarea.css',

  // --- Estilos de Vistas (Nuevos) ---
  './src/styles/views/view-login.css',
  './src/styles/views/view-citas.css',
  './src/styles/views/view-dashboard.css',
  './src/styles/views/view-consulta.css',
  
  // --- Assets ---
  './src/assets/logo.png',
  './src/assets/icon-192.png',
  './src/assets/icon-512.png',
  
  // --- Capa Entity ---
  './src/entity/base-entity.js',
  './src/entity/persona.js',
  './src/entity/clinica.js',
  './src/entity/persona-rol.js',
  './src/entity/tipo-documento.js',
  './src/entity/consulta.js',
  './src/entity/registro-paso.js',
  
  // --- Capa Control ---
  './src/control/api-client.js',
  './src/control/auth-service.js',
  './src/control/tipo-documento-service.js',
  './src/control/consulta-service.js',
  './src/control/examen-service.js',
  './src/control/paso-service.js',
  './src/control/offline-error.js',
  './src/control/permisos-consulta.js',
  './src/control/flujo-pasos.js',
  './src/control/escape-html.js',
  './src/control/filtros-examen.js',
  './src/control/cie10-catalogo.js',
  
  // --- Capa State ---
  './src/state/session-store.js',
  './src/state/connectivity.js',
  
  // --- Capa Boundary (Layout y Componentes) ---
  './src/boundary/layout/app-root.js',
  './src/boundary/components/ui-button.js',
  './src/boundary/components/ui-input.js',
  './src/boundary/components/ui-select.js',
  './src/boundary/components/ui-confirm.js',
  './src/boundary/components/ui-connection-status.js',
  './src/boundary/components/ui-checkbox.js',
  './src/boundary/components/ui-textarea.js',
  
  // --- Capa Boundary (Vistas) ---
  './src/boundary/views/view-login.js',
  './src/boundary/views/view-dashboard.js',
  './src/boundary/views/view-citas.js',
  './src/boundary/views/view-consulta.js'
];

// ---------- INSTALL ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.includes('/api/v1/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, ASSET_CACHE));
});

// ---------- ESTRATEGIAS ----------
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const fallback = await caches.match(new URL('./index.html', self.registration.scope));
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.warn('[SW] No se pudo guardar la respuesta de API en caché:', error);
      }
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', 'true');
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers
      });
    }
    return new Response(
      JSON.stringify({ error: 'offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});