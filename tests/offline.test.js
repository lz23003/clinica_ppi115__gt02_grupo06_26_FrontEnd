import { afterEach, beforeEach, describe, it } from 'node:test';
import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import {
  countQueuedRequests,
  enqueueOfflineRequest,
  flushOfflineQueue,
  readOfflineQueue,
  removeQueuedRequest,
} from '../src/offline-queue.js';
import { fetchPublicAppointmentSearch } from '../src/offline-strategies.js';

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

const createIndexedDbStub = () => {
  const records = new Map();
  let storeCreated = false;
  const database = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: sinon.spy(() => {
      storeCreated = true;
    }),
    close: sinon.spy(),
    transaction: sinon.stub(),
  };

  database.transaction.callsFake(() => {
    const transaction = { oncomplete: null, onerror: null, onabort: null };
    transaction.objectStore = () => ({
      add(item) {
        records.set(item.id, item);
        queueMicrotask(() => transaction.oncomplete?.());
      },
      getAll() {
        const request = { result: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          request.result = [...records.values()];
          request.onsuccess?.();
        });
        return request;
      },
      count() {
        const request = { result: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          request.result = records.size;
          request.onsuccess?.();
        });
        return request;
      },
      delete(id) {
        records.delete(id);
        queueMicrotask(() => transaction.oncomplete?.());
      },
    });
    return transaction;
  });

  const open = sinon.stub().callsFake(() => {
    const request = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  });
  return { indexedDB: { open }, database, records };
};

describe('offline support', () => {
  let sandbox;
  let indexedDbHarness;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    indexedDbHarness = createIndexedDbStub();
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      writable: true,
      value: indexedDbHarness.indexedDB,
    });
  });

  afterEach(() => {
    sandbox.restore();
    if (originalIndexedDb) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    } else {
      delete globalThis.indexedDB;
    }
  });

  it('stores pending requests in IndexedDB and removes them after successful synchronization', async () => {
    const queued = await enqueueOfflineRequest({
      url: 'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/1',
      method: 'PUT',
      headers: { Authorization: 'Bearer test-token' },
      body: '{"observaciones":"{}"}',
    });

    expect(queued.id).to.be.a('string');
    expect((await readOfflineQueue()).map(({ id }) => id)).to.deep.equal([queued.id]);

    const fetcher = sandbox.stub().resolves({ ok: true, status: 200 });
    const result = await flushOfflineQueue(fetcher);

    expect(fetcher.calledOnce).to.equal(true);
    expect(fetcher.firstCall.args[0]).to.equal(queued.url);
    expect(result).to.deep.equal({ sent: 1, pending: 0, failures: [] });
    expect(indexedDbHarness.records.size).to.equal(0);
  });

  it('returns a friendly online-required response for a failed public appointment search', async () => {
    const fetcher = sandbox.stub().rejects(new TypeError('Network unavailable'));
    const cachedFallback = new Response(JSON.stringify({
      message: 'Se necesita conexión a internet para buscar citas públicas.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const fallbackLoader = sandbox.stub().resolves(cachedFallback);
    const request = new Request(
      'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
      { method: 'POST', body: JSON.stringify({ tipoDocumento: 'DUI' }) },
    );

    const response = await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader);
    const body = await response.json();

    expect(response.status).to.equal(503);
    expect(body.message).to.include('Se necesita conexión a internet');
    expect(fallbackLoader.calledOnce).to.equal(true);
    expect(fetcher.calledOnce).to.equal(true);
  });

  it('keeps failed or rejected requests queued and reports each sync failure', async () => {
    const queued = await Promise.all(['conflict', 'offline'].map((id) => enqueueOfflineRequest({
      url: `http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/${id}`,
      method: 'PUT',
      headers: {},
      body: '{}',
    })));
    const fetcher = sandbox.stub();
    fetcher.onFirstCall().resolves({ ok: false, status: 409 });
    fetcher.onSecondCall().rejects(new Error('Network unavailable'));

    try {
      const result = await flushOfflineQueue(fetcher);

      expect(result.sent).to.equal(0);
      expect(result.pending).to.equal(2);
      expect(result.failures).to.deep.equal([
        { id: queued[0].id, status: 409 },
        { id: queued[1].id, error: 'Network unavailable' },
      ]);
      expect(await countQueuedRequests()).to.equal(2);
    } finally {
      await Promise.all(queued.map(({ id }) => removeQueuedRequest(id)));
    }
  });

  it('passes online appointment searches through and falls back when cached data is invalid', async () => {
    const request = new Request(
      'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
      { method: 'POST', body: JSON.stringify({ tipoDocumento: 'DUI' }) },
    );
    const onlineResponse = new Response('[]', { status: 200 });
    const onlineFetcher = sandbox.stub().resolves(onlineResponse);
    const unusedFallback = sandbox.stub();
    const onlineResult = await fetchPublicAppointmentSearch(request, onlineFetcher, unusedFallback);

    expect(onlineResult).to.equal(onlineResponse);
    expect(onlineFetcher.calledOnce).to.equal(true);
    expect(unusedFallback.called).to.equal(false);

    const offlineFetcher = sandbox.stub().rejects(new TypeError('Network unavailable'));
    const invalidFallback = sandbox.stub().resolves('not a Response');
    const response = await fetchPublicAppointmentSearch(request, offlineFetcher, invalidFallback);

    expect(response.status).to.equal(503);
    expect((await response.json()).code).to.equal('PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION');
  });

  it('returns the built-in offline response if loading the cached fallback throws', async () => {
    const warning = sandbox.stub(console, 'warn');
    const request = new Request(
      'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
      { method: 'POST', body: '{}' },
    );
    const fetcher = sandbox.stub().rejects(new TypeError('Network unavailable'));
    const fallbackLoader = sandbox.stub().rejects(new Error('Cache unavailable'));

    const response = await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader);

    expect(response.status).to.equal(503);
    expect(warning.calledOnce).to.equal(true);
  });
});
