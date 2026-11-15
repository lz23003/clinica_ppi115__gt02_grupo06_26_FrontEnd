import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import { resetApiTransport } from '../src/api.service.js';

const jsonResponse = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const encode = (value) => btoa(JSON.stringify(value))
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(Boolean(predicate()), 'condition did not become true before timeout').to.equal(true);
};

const installTemplate = () => {
  if (document.querySelector('#galeno-app-template')) return;
  const template = document.createElement('template');
  template.id = 'galeno-app-template';
  template.innerHTML = `
    <button id="install-app" hidden></button>
    <button id="update-app" hidden></button>
    <span id="connection-status"></span>
    <span id="app-announcement"></span>
  `;
  document.body.append(template);
};

describe('galeno-app shell', () => {
  let sandbox;
  let app;
  let fetchStub;
  let serviceWorkerDescriptor;
  let onlineDescriptor;
  let serviceWorker;

  beforeEach(async () => {
    installTemplate();
    if (!customElements.get('galeno-app')) {
      await import(`../src/app.js?test=${Date.now()}`);
    }

    resetApiTransport();
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub(window, 'fetch');
    serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    const waitingWorker = { postMessage: sandbox.spy() };
    const controller = { postMessage: sandbox.spy() };
    const registration = {
      waiting: waitingWorker,
      active: { postMessage: sandbox.spy() },
      installing: null,
      addEventListener: sandbox.spy(),
    };
    const serviceWorkerListeners = new Map();
    serviceWorker = {
      controller,
      waitingWorker,
      registration,
      register: sandbox.stub().resolves(registration),
      addEventListener: sandbox.stub().callsFake((type, listener) => {
        serviceWorkerListeners.set(type, listener);
      }),
      removeEventListener: sandbox.spy(),
      getRegistration: sandbox.stub().resolves(registration),
      ready: Promise.resolve(registration),
      listeners: serviceWorkerListeners,
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

    app = document.createElement('galeno-app');
  });

  afterEach(() => {
    app?.remove();
    sandbox.restore();
    resetApiTransport();
    if (serviceWorkerDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
    } else {
      delete navigator.serviceWorker;
    }
    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      delete navigator.onLine;
    }
    localStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.employee');
  });

  it('updates connection, installation, and service-worker update UI from browser events', async () => {
    document.body.append(app);
    await waitFor(() => serviceWorker.register.calledOnce);
    const root = app.shadowRoot;

    expect(root.querySelector('#connection-status').textContent).to.equal('Conectado');
    expect(root.querySelector('#update-app').hidden).to.equal(false);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    expect(root.querySelector('#connection-status').textContent).to.include('Sin conexión');

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    serviceWorker.registration.sync = { register: sandbox.spy() };
    window.dispatchEvent(new Event('online'));
    await waitFor(() => serviceWorker.registration.active.postMessage.calledWith({
      type: 'SYNC_OFFLINE_QUEUE',
    }));

    const prompt = sandbox.spy();
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(installEvent, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(installEvent);
    expect(installEvent.defaultPrevented).to.equal(true);
    expect(root.querySelector('#install-app').hidden).to.equal(false);
    root.querySelector('#install-app').click();
    await waitFor(() => root.querySelector('#install-app').hidden);
    expect(prompt.calledOnce).to.equal(true);

    window.dispatchEvent(new Event('appinstalled'));
    expect(root.querySelector('#app-announcement').textContent)
      .to.equal('GalenoSV se instaló correctamente.');
    root.querySelector('#update-app').click();
    expect(serviceWorker.waitingWorker.postMessage.calledWith({ type: 'SKIP_WAITING' })).to.equal(true);

    serviceWorker.listeners.get('message')({ data: { type: 'UNKNOWN' } });
    serviceWorker.listeners.get('message')({
      data: { type: 'OFFLINE_SYNC_COMPLETE', result: { sent: 2 } },
    });
    expect(root.querySelector('#app-announcement').textContent)
      .to.equal('Se sincronizaron 2 cambios pendientes.');
    serviceWorker.listeners.get('message')({
      data: { type: 'OFFLINE_SYNC_COMPLETE', result: { sent: 0 } },
    });
    expect(root.querySelector('#app-announcement').textContent)
      .to.equal('Se comprobó la cola de sincronización.');
  });

  it('handles login success and exposes global API errors to the live announcement', async () => {
    document.body.append(app);
    await waitFor(() => serviceWorker.register.calledOnce);
    const tokenPayload = encode({ sub: 'employee-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${tokenPayload}.signature`;
    fetchStub.resolves(jsonResponse({
      identityValidated: true,
      accessToken: token,
      employee: {
        id: 'employee-1',
        assignments: [{ idClinica: 'clinic-1', idRol: 'role-1' }],
      },
    }));

    const login = {
      localName: 'galeno-login',
      busy: false,
      setStatus: sandbox.spy(),
    };
    const event = new CustomEvent('login-submit', { detail: {
      tipoDocumento: 'DUI',
      numeroDocumento: '00000000-0',
    } });
    event.composedPath = () => [login, app, document, window];
    app.dispatchEvent(event);

    await waitFor(() => login.setStatus.calledTwice);
    expect(login.busy).to.equal(false);
    expect(window.location.hash).to.equal('#/empleados/dashboard');
    expect(login.setStatus.secondCall.args[0]).to.include('Identidad validada');

    document.dispatchEvent(new CustomEvent('galeno-api-error', {
      detail: { message: 'No tienes autorización.' },
    }));
    expect(app.shadowRoot.querySelector('#app-announcement').textContent)
      .to.equal('No tienes autorización.');
  });

  it('announces service-worker registration failures without crashing the shell', async () => {
    serviceWorker.register.rejects(new Error('registration failed'));
    document.body.append(app);
    await waitFor(() => app.shadowRoot.querySelector('#app-announcement').textContent
      === 'No se pudo activar el modo offline.');
  });

  it('handles a login rejection and an event without a login component', async () => {
    document.body.append(app);
    await waitFor(() => serviceWorker.register.calledOnce);
    fetchStub.resolves(jsonResponse({ identityValidated: false }));
    const login = { localName: 'galeno-login', busy: false, setStatus: sandbox.spy() };
    const loginEvent = new CustomEvent('login-submit', { detail: {
      tipoDocumento: 'DUI',
      numeroDocumento: '00000000-0',
    } });
    loginEvent.composedPath = () => [login, app, document, window];
    app.dispatchEvent(loginEvent);

    await waitFor(() => login.setStatus.calledTwice && login.busy === false);
    expect(login.setStatus.secondCall.args[1]).to.equal(true);

    const invalidEvent = new CustomEvent('login-submit');
    invalidEvent.composedPath = () => [app, document, window];
    app.dispatchEvent(invalidEvent);
    expect(app.shadowRoot.querySelector('#app-announcement').textContent)
      .to.equal('No se pudo identificar el formulario de acceso.');
  });
});
