import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import { registerServiceWorker } from '../src/pwa.js';
import { readOfflineQueue, removeQueuedRequest } from '../src/offline-queue.js';

const captureWorkerEvents = async (sandbox) => {
  const listeners = new Map();
  const registrationDescriptor = Object.getOwnPropertyDescriptor(window, 'registration');
  Object.defineProperty(window, 'registration', {
    configurable: true,
    value: { scope: `${window.location.origin}/` },
  });
  sandbox.stub(window, 'addEventListener').callsFake((type, listener) => {
    listeners.set(type, listener);
  });
  await import(`../service-worker.js?coverage=${crypto.randomUUID()}`);
  return {
    listeners,
    restoreRegistration() {
      if (registrationDescriptor) {
        Object.defineProperty(window, 'registration', registrationDescriptor);
      } else {
        delete window.registration;
      }
    },
  };
};

describe('PWA Service Worker', () => {
  it('registers the module Service Worker with the requested scope', async () => {
    const registration = { active: {} };
    const container = { register: sinon.stub().resolves(registration) };
    const scriptUrl = new URL('../service-worker.js', import.meta.url);
    const options = { scope: './', type: 'module' };

    const result = await registerServiceWorker(container, scriptUrl, options);

    expect(result).to.equal(registration);
    expect(container.register.calledOnceWithExactly(scriptUrl, options)).to.equal(true);
  });

  it('caches the public-search offline message and serves it after a network failure', async () => {
    const sandbox = sinon.createSandbox();
    const listeners = new Map();
    const registrationDescriptor = Object.getOwnPropertyDescriptor(window, 'registration');
    const cachedResponse = new Response(JSON.stringify({
      message: 'Se necesita conexión a internet para buscar citas públicas.',
      code: 'PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const shellCache = { addAll: sandbox.stub().resolves() };
    const offlineCache = {
      match: sandbox.stub().resolves(cachedResponse),
      put: sandbox.stub().resolves(),
    };

    try {
      Object.defineProperty(window, 'registration', {
        configurable: true,
        value: { scope: `${window.location.origin}/` },
      });
      sandbox.stub(window, 'addEventListener').callsFake((type, listener) => {
        listeners.set(type, listener);
      });
      sandbox.stub(window.caches, 'open').callsFake((name) => Promise.resolve(
        name === 'galenosv-offline-v1' ? offlineCache : shellCache,
      ));
      sandbox.stub(window, 'fetch').rejects(new TypeError('Network unavailable'));

      await import(`../service-worker.js?test=${Date.now()}`);
      let installPromise;
      listeners.get('install')({ waitUntil: (promise) => { installPromise = promise; } });
      await installPromise;

      const request = new Request(
        'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
        { method: 'POST', body: JSON.stringify({ tipoDocumento: 'DUI' }) },
      );
      let responsePromise;
      listeners.get('fetch')({
        request,
        respondWith: (promise) => { responsePromise = promise; },
      });
      const response = await responsePromise;
      const body = await response.json();

      expect(shellCache.addAll.calledOnce).to.equal(true);
      expect(offlineCache.put.calledOnce).to.equal(true);
      expect(offlineCache.match.calledOnce).to.equal(true);
      expect(response.status).to.equal(503);
      expect(body.code).to.equal('PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION');
    } finally {
      sandbox.restore();
      if (registrationDescriptor) {
        Object.defineProperty(window, 'registration', registrationDescriptor);
      } else {
        delete window.registration;
      }
    }
  });

  it('cleans old shell caches, handles worker messages, and notifies clients after sync', async () => {
    const sandbox = sinon.createSandbox();
    const clientsDescriptor = Object.getOwnPropertyDescriptor(window, 'clients');
    const skipWaitingDescriptor = Object.getOwnPropertyDescriptor(window, 'skipWaiting');
    const clients = {
      claim: sandbox.stub().resolves(),
      matchAll: sandbox.stub().resolves([{ postMessage: sandbox.spy() }]),
    };
    const skipWaiting = sandbox.stub().resolves();
    const cacheNames = ['galenosv-shell-v7', 'galenosv-shell-v8', 'galenosv-private-api-user'];
    const deleteCache = sandbox.stub().resolves(true);
    const keys = sandbox.stub().resolves(cacheNames);

    try {
      Object.defineProperty(window, 'clients', { configurable: true, value: clients });
      Object.defineProperty(window, 'skipWaiting', { configurable: true, value: skipWaiting });
      const { listeners, restoreRegistration } = await captureWorkerEvents(sandbox);
      const cachesKeys = sandbox.stub(window.caches, 'keys').callsFake(keys);
      const cachesDelete = sandbox.stub(window.caches, 'delete').callsFake(deleteCache);

      let activation;
      listeners.get('activate')({ waitUntil: (promise) => { activation = promise; } });
      await activation;
      expect(cachesKeys.calledOnce).to.equal(true);
      expect(cachesDelete.calledOnceWithExactly('galenosv-shell-v7')).to.equal(true);
      expect(clients.claim.calledOnce).to.equal(true);

      listeners.get('message')({ data: { type: 'SKIP_WAITING' } });
      expect(skipWaiting.calledOnce).to.equal(true);

      let clearPromise;
      listeners.get('message')({
        data: { type: 'CLEAR_PRIVATE_API_CACHE' },
        waitUntil: (promise) => { clearPromise = promise; },
      });
      await clearPromise;
      expect(cachesDelete.calledWith('galenosv-private-api-user')).to.equal(true);
      expect(cachesDelete.calledWith('galenosv-shell-v8')).to.equal(false);

      let syncPromise;
      listeners.get('sync')({
        tag: 'galenosv-outbox',
        waitUntil: (promise) => { syncPromise = promise; },
      });
      await syncPromise;
      expect(clients.matchAll.calledOnce).to.equal(true);
      expect(clients.matchAll.firstCall.args[0]).to.deep.equal({
        type: 'window',
        includeUncontrolled: true,
      });
      expect(clients.matchAll.firstCall.returnValue).to.not.equal(undefined);
      restoreRegistration();
    } finally {
      sandbox.restore();
      if (clientsDescriptor) Object.defineProperty(window, 'clients', clientsDescriptor);
      else delete window.clients;
      if (skipWaitingDescriptor) Object.defineProperty(window, 'skipWaiting', skipWaitingDescriptor);
      else delete window.skipWaiting;
    }
  });

  it('uses network-first private API caching and cache-first shell fallback', async () => {
    const sandbox = sinon.createSandbox();
    const cachedPrivate = new Response(JSON.stringify({ cached: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const cachedAsset = new Response('cached asset', { status: 200 });
    const cachedIndex = new Response('<main>offline</main>', { status: 200 });
    const cache = {
      match: sandbox.stub().resolves(cachedPrivate),
      put: sandbox.stub().resolves(),
    };

    try {
      const { listeners, restoreRegistration } = await captureWorkerEvents(sandbox);
      sandbox.stub(window.caches, 'open').resolves(cache);
      sandbox.stub(window.caches, 'match').callsFake((request) => {
        const url = typeof request === 'string' ? request : request.url;
        if (url.endsWith('/cached.js') || url.endsWith('/roles/all')) {
          return Promise.resolve(new Response('cached asset', { status: 200 }));
        }
        if (url.endsWith('/index.html')) return Promise.resolve(cachedIndex);
        return Promise.resolve(null);
      });
      const fetchStub = sandbox.stub(window, 'fetch');

      fetchStub.onFirstCall().resolves(new Response(JSON.stringify([{ id: 'clinic-1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
      const clinicRequest = new Request(
        'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/clinicas/all',
      );
      let clinicPromise;
      listeners.get('fetch')({
        request: clinicRequest,
        respondWith: (promise) => { clinicPromise = promise; },
      });
      expect((await clinicPromise).ok).to.equal(true);
      expect(cache.put.calledOnce).to.equal(true);

      fetchStub.onSecondCall().rejects(new TypeError('Network unavailable'));
      const privateRequest = new Request(
        'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas',
        { headers: { Authorization: 'Bearer test-token' } },
      );
      let privatePromise;
      listeners.get('fetch')({
        request: privateRequest,
        respondWith: (promise) => { privatePromise = promise; },
      });
      expect(await (await privatePromise).json()).to.deep.equal({ cached: true });

      const cachedRequest = new Request(`${window.location.origin}/cached.js`);
      let cachedPromise;
      listeners.get('fetch')({
        request: cachedRequest,
        respondWith: (promise) => { cachedPromise = promise; },
      });
      expect(await (await cachedPromise).text()).to.equal('cached asset');

      const navigation = {
        url: `${window.location.origin}/dashboard`,
        method: 'GET',
        mode: 'navigate',
      };
      fetchStub.onCall(2).rejects(new TypeError('Network unavailable'));
      let navigationPromise;
      listeners.get('fetch')({
        request: navigation,
        respondWith: (promise) => { navigationPromise = promise; },
      });
      expect(await (await navigationPromise).text()).to.include('offline');

      fetchStub.onCall(3).resolves(new Response('new asset', { status: 200 }));
      let uncachedPromise;
      listeners.get('fetch')({
        request: new Request(`${window.location.origin}/uncached.js`),
        respondWith: (promise) => { uncachedPromise = promise; },
      });
      expect(await (await uncachedPromise).text()).to.equal('new asset');

      fetchStub.onCall(4).resolves(new Response('fresh catalog', { status: 200 }));
      let freshPromise;
      listeners.get('fetch')({
        request: new Request(`${window.location.origin}/api/v1/clinicas/all`),
        respondWith: (promise) => { freshPromise = promise; },
      });
      expect(await (await freshPromise).text()).to.equal('fresh catalog');

      const warning = sandbox.stub(console, 'warn');
      fetchStub.onCall(5).rejects(new TypeError('Network unavailable'));
      let stalePromise;
      listeners.get('fetch')({
        request: new Request(`${window.location.origin}/api/v1/roles/all`),
        respondWith: (promise) => { stalePromise = promise; },
      });
      expect(await (await stalePromise).text()).to.equal('cached asset');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(warning.calledOnce).to.equal(true);

      let ignoredResponse = false;
      listeners.get('fetch')({
        request: new Request('https://example.com/image.png'),
        respondWith: () => { ignoredResponse = true; },
      });
      expect(ignoredResponse).to.equal(false);
      restoreRegistration();
    } finally {
      sandbox.restore();
    }
  });

  it('queues an offline consultation PUT in IndexedDB and returns HTTP 202', async function () {
    this.timeout(10000);
    const sandbox = sinon.createSandbox();
    let restoreRegistration;
    try {
      const captured = await captureWorkerEvents(sandbox);
      restoreRegistration = captured.restoreRegistration;
      sandbox.stub(window, 'fetch').rejects(new TypeError('Network unavailable'));
      const request = new Request(
        'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/offline-sw-test',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ observaciones: 'attention notes' }),
        },
      );
      let responsePromise;
      captured.listeners.get('fetch')({
        request,
        respondWith: (promise) => { responsePromise = promise; },
      });

      const response = await responsePromise;
      const body = await response.json();
      const queued = (await readOfflineQueue()).find(({ url }) => url.endsWith('/consultas/offline-sw-test'));

      try {
        expect(response.status).to.equal(202);
        expect(body.queued).to.equal(true);
        expect(queued.method).to.equal('PUT');
        expect(queued.body).to.include('attention notes');
      } finally {
        if (queued) await removeQueuedRequest(queued.id);
      }
    } finally {
      restoreRegistration?.();
      sandbox.restore();
    }
  });
});
