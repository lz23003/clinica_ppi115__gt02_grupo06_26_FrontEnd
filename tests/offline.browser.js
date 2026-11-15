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

describe('IndexedDB offline queue', () => {
  it('stores and removes a pending request', async function () {
    this.timeout(10000);
    const request = await enqueueOfflineRequest({
      url: 'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/browser-test',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"observaciones":"{}"}',
    });

    try {
      const saved = (await readOfflineQueue()).find(({ id }) => id === request.id);
      expect(saved).to.include({
        url: request.url,
        method: 'PUT',
        body: request.body,
      });
    } finally {
      await removeQueuedRequest(request.id);
    }

    expect((await readOfflineQueue()).some(({ id }) => id === request.id)).to.equal(false);
  });

  it('uses the cached friendly response when public appointment search is offline', async () => {
    const fetcher = sinon.stub().rejects(new TypeError('Network unavailable'));
    const fallback = new Response(JSON.stringify({
      message: 'Se necesita conexión a internet para buscar citas públicas.',
      code: 'PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const fallbackLoader = sinon.stub().resolves(fallback);
    const request = new Request(
      'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
      { method: 'POST', body: JSON.stringify({ tipoDocumento: 'DUI' }) },
    );

    const response = await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader);

    expect(response.status).to.equal(503);
    expect((await response.json()).code).to.equal('PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION');
    expect(fallbackLoader.calledOnce).to.equal(true);
  });

  it('keeps unsent requests queued and returns both HTTP and network sync failures', async function () {
    this.timeout(10000);
    const queued = await Promise.all(['conflict', 'offline'].map((suffix) => enqueueOfflineRequest({
      url: `http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/browser-${suffix}`,
      method: 'PUT',
      headers: {},
      body: '{}',
    })));
    const fetcher = sinon.stub();
    fetcher.onFirstCall().resolves({ ok: false, status: 409 });
    fetcher.onSecondCall().rejects(new Error('Network unavailable'));

    try {
      const result = await flushOfflineQueue(fetcher);

      expect(result.sent).to.equal(0);
      expect(result.pending).to.equal(2);
      expect(result.failures).to.have.length(2);
      expect(result.failures.find(({ status }) => status === 409).id)
        .to.be.oneOf(queued.map(({ id }) => id));
      expect(result.failures.find(({ error }) => error === 'Network unavailable').id)
        .to.be.oneOf(queued.map(({ id }) => id));
      expect(await countQueuedRequests()).to.equal(2);
    } finally {
      await Promise.all(queued.map(({ id }) => removeQueuedRequest(id)));
    }
  });

  it('passes online searches through and falls back when cached data is unavailable', async () => {
    const request = new Request(
      'http://localhost:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/citas/busqueda',
      { method: 'POST', body: '{}' },
    );
    const onlineResponse = new Response('[]', { status: 200 });
    const fetcher = sinon.stub().resolves(onlineResponse);
    const fallbackLoader = sinon.stub();
    expect(await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader)).to.equal(onlineResponse);
    expect(fallbackLoader.called).to.equal(false);

    fetcher.rejects(new TypeError('Network unavailable'));
    fallbackLoader.resolves('not a Response');
    let response = await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader);
    expect(response.status).to.equal(503);
    expect((await response.json()).code).to.equal('PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION');

    const warning = sinon.stub(console, 'warn');
    try {
      fallbackLoader.rejects(new Error('Cache unavailable'));
      response = await fetchPublicAppointmentSearch(request, fetcher, fallbackLoader);
      expect(response.status).to.equal(503);
      expect(warning.calledOnce).to.equal(true);
    } finally {
      warning.restore();
    }
  });
});
