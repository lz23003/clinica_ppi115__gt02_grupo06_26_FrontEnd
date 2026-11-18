import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { connectivity } from '../../src/state/connectivity.js';

const { describe, it, beforeEach, afterEach } = globalThis;

describe('Estado de conectividad', () => {
  let originalWindow;
  let originalNavigator;

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget()
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });
  });

  afterEach(() => {
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

  it('considera el estado online cuando navigator.onLine no está disponible', () => {
    expect(connectivity.isOnline()).to.equal(true);
  });

  it('notifica los cambios de estado online y offline', () => {
    const callback = sinon.stub();
    connectivity.subscribe(callback);

    globalThis.window.dispatchEvent(new Event('offline'));
    globalThis.window.dispatchEvent(new Event('online'));

    expect(callback.calledTwice).to.equal(true);
    expect(callback.firstCall.args[0]).to.equal(false);
    expect(callback.secondCall.args[0]).to.equal(true);
  });

  it('deja de notificar después de cancelar la suscripción', () => {
    const callback = sinon.stub();
    const unsubscribe = connectivity.subscribe(callback);

    unsubscribe();
    globalThis.window.dispatchEvent(new Event('offline'));

    expect(callback.called).to.equal(false);
  });
});
