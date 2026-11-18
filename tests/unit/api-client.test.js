import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { ApiClient } from '../../src/control/api-client.js';
import { OfflineError } from '../../src/control/offline-error.js';

const { describe, it, beforeEach, afterEach } = globalThis;

describe('ApiClient en modo offline', () => {
  let originalWindow;
  let originalNavigator;

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const eventTarget = new EventTarget();
    eventTarget.CLINICASV_API_URL = 'http://test.com';
    eventTarget.location = { protocol: 'http:', hostname: 'localhost' };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: eventTarget
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false }
    });
    sinon.stub(globalThis, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      delete globalThis.window;
    }
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  });

  it('rechaza POST y PUT offline sin llamar a fetch', async () => {
    const api = new ApiClient();
    const results = await Promise.all([
      api.post('/consultas', { nota: 'pendiente' }).then(() => null, error => error),
      api.put('/consultas/1', { nota: 'pendiente' }).then(() => null, error => error)
    ]);

    expect(results).to.have.lengthOf(2);
    results.forEach(error => {
      expect(error).to.be.instanceOf(OfflineError);
      expect(error.message).to.equal(
        'Sin conexión. Necesitas conexión para guardar este cambio.'
      );
    });
    sinon.assert.notCalled(globalThis.fetch);
  });

  it('convierte el fallo de fetch GET a OfflineError cuando no hay red', async () => {
    globalThis.fetch.rejects(new TypeError('Failed to fetch'));
    const api = new ApiClient();
    const error = await api.get('/consultas/all').then(() => null, reason => reason);

    expect(error).to.be.instanceOf(OfflineError);
  });

  it('notifica cuando el service worker devuelve una respuesta desde caché', async () => {
    globalThis.fetch.resolves({
      ok: true,
      status: 200,
      headers: {
        get: (name) => name.toLowerCase() === 'x-from-cache' ? 'true' : 'application/json'
      },
      text: async () => '[]'
    });
    const notify = sinon.stub();
    globalThis.window.addEventListener('api-from-cache', notify);
    const api = new ApiClient();

    await api.get('/consultas/all');

    sinon.assert.calledOnce(notify);
  });
});
