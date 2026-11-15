import { afterEach, describe, it } from 'node:test';
import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import { registerServiceWorker } from '../src/pwa.js';

describe('Service Worker registration helper', () => {
  let sandbox;

  afterEach(() => sandbox?.restore());

  it('rejects with an explicit error when registration is unavailable', async () => {
    let thrown;
    try {
      await registerServiceWorker(null, '/service-worker.js');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.have.property('message', 'Este navegador no permite registrar Service Workers.');
  });

  it('rejects when the browser container does not expose a register function', async () => {
    let thrown;
    try {
      await registerServiceWorker({}, '/service-worker.js');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.have.property('message', 'Este navegador no permite registrar Service Workers.');
  });

  it('passes through registration failures for the caller to handle', async () => {
    sandbox = sinon.createSandbox();
    const error = new Error('registration denied');
    const container = { register: sandbox.stub().rejects(error) };
    let thrown;
    try {
      await registerServiceWorker(container, '/service-worker.js');
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).to.equal(error);
    expect(container.register.calledOnce).to.equal(true);
  });
});
