import { enqueueOfflineRequest, flushOfflineQueue } from './src/offline-queue.js';
import { fetchPublicAppointmentSearch } from './src/offline-strategies.js';

const CACHE_NAME = 'galenosv-shell-v13';
const OFFLINE_FALLBACK_CACHE = 'galenosv-offline-v1';
const PRIVATE_API_CACHE_PREFIX = 'galenosv-private-api-';
const BACKEND_ORIGIN = 'http://localhost:9080';
const BACKEND_API_PREFIX = '/Odontologia_SV-1.0-SNAPSHOT/api/v1/';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './global.css',
  './manifest.json',
  './assets/galeno.svg',
  './assets/galeno-192.svg',
  './assets/galeno-512.svg',
  './src/app.js',
  './src/api.js',
  './src/api.service.js',
  './src/pwa.js',
  './src/offline-strategies.js',
  './src/offline-queue.js',
  './src/core/router.js',
  './src/core/routes.js',
  './src/pages/galeno-placeholder.js',
  './src/components/login.component.js',
  './src/components/citas.component.js',
  './src/components/cita-card.component.js',
  './src/components/dashboard.component.js',
  './src/components/consulta.component.js',
  './src/persona-app.js',
  './src/personas-worker.js',
];
const APP_SHELL_URLS = APP_SHELL.map((path) => new URL(path, self.registration.scope).href);
const PUBLIC_APPOINTMENT_OFFLINE_KEY = new URL('./__offline__/public-appointment-search', self.registration.scope).href;
const CACHEABLE_API_PATH = /\/api\/v1\/(?:clinicas\/(?:all|activas)|roles\/all|examenes\/(?:all|activos))\/?$/;
const OFFLINE_QUEUEABLE_PATH = /\/api\/v1\/consultas\/[^/]+\/?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
    caches.open(OFFLINE_FALLBACK_CACHE).then((cache) => cache.put(
      PUBLIC_APPOINTMENT_OFFLINE_KEY,
      new Response(JSON.stringify({
        message: 'Se necesita conexión a internet para buscar citas públicas. Inténtalo nuevamente cuando estés en línea.',
        code: 'PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    )),
    self.skipWaiting?.(),
  ]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith('galenosv-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'SYNC_OFFLINE_QUEUE') {
    event.waitUntil(syncOfflineQueue());
    return;
  }
  if (event.data?.type === 'CLEAR_PRIVATE_API_CACHE') {
    event.waitUntil(clearPrivateApiCaches());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'galenosv-outbox') event.waitUntil(syncOfflineQueue());
});

const syncOfflineQueue = async () => {
  const result = await flushOfflineQueue();
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'OFFLINE_SYNC_COMPLETE', result }));
  return result;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin === BACKEND_ORIGIN && url.pathname.startsWith(BACKEND_API_PREFIX)) {
    const apiPath = url.pathname.slice(BACKEND_API_PREFIX.length);
    if (request.method === 'GET' && isCacheableBackendGet(apiPath)) {
      event.respondWith(networkFirstBackendApi(request, apiPath));
      return;
    }
    if (request.method === 'POST' && /^citas\/busqueda\/?$/.test(apiPath)) {
      event.respondWith(fetchPublicAppointmentSearch(request, fetch, async () => {
        const cache = await caches.open(OFFLINE_FALLBACK_CACHE);
        return cache.match(PUBLIC_APPOINTMENT_OFFLINE_KEY);
      }));
      return;
    }
    if (request.method === 'PUT' && /^consultas\/[^/]+\/?$/.test(apiPath)) {
      event.respondWith(fetchOrQueueConsultationUpdate(request));
      return;
    }
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.method === 'GET' && CACHEABLE_API_PATH.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.method === 'PUT' && OFFLINE_QUEUEABLE_PATH.test(url.pathname)) {
    event.respondWith(fetchOrQueueConsultationUpdate(request));
    return;
  }

  if (request.method !== 'GET' || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (
        (await caches.match(new URL('./index.html', self.registration.scope).href))
        || Response.error()
      )),
    );
    return;
  }

  event.respondWith(cacheFirst(request));
});

function isCacheableBackendGet(path) {
  return /^(?:clinicas\/(?:all|activas)|roles\/all|examenes\/(?:all|activos))\/?$/.test(path)
    || /^consultas(?:\/[^/]+)?\/?$/.test(path);
}

async function getApiCacheName(request, apiPath) {
  if (/^(?:clinicas\/(?:all|activas)|roles\/all|examenes\/(?:all|activos))\/?$/.test(apiPath)) return CACHE_NAME;
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(authorization),
  );
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${PRIVATE_API_CACHE_PREFIX}${key}`;
}

async function networkFirstBackendApi(request, apiPath) {
  const cacheName = await getApiCacheName(request, apiPath);
  if (!cacheName) return fetch(request);

  try {
    const response = await fetch(request.clone());
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      } catch (cacheError) {
        console.warn('No se pudo guardar la respuesta REST en caché.', cacheError);
      }
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function clearPrivateApiCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(PRIVATE_API_CACHE_PREFIX))
    .map((name) => caches.delete(name)));
}

async function fetchOrQueueConsultationUpdate(request) {
  try {
    return await fetch(request.clone());
  } catch (error) {
    const body = await request.clone().text();
    const headers = Object.fromEntries(request.headers.entries());
    await enqueueOfflineRequest({
      url: request.url,
      method: request.method,
      headers,
      body,
    });
    try {
      await self.registration.sync?.register('galenosv-outbox');
    } catch (syncError) {
      console.warn('Background Sync no está disponible; el guardado queda pendiente en el dispositivo.', syncError);
    }
    return new Response(JSON.stringify({
      queued: true,
      message: 'Guardado localmente; se sincronizará al recuperar la conexión.',
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    void update.catch((error) => console.warn('No se pudo actualizar la caché de catálogos.', error));
    return cached;
  }
  return update;
}
