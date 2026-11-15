import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import '../src/core/router.js';
import '../src/pages/galeno-placeholder.js';
import { apiService } from '../src/api.service.js';
import { routes } from '../src/core/routes.js';

const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(Boolean(predicate()), 'condition did not become true before timeout').to.equal(true);
};

const encode = (value) => btoa(JSON.stringify(value))
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

describe('router guards and people-search worker', () => {
  afterEach(() => {
    document.querySelectorAll('galeno-router').forEach((router) => router.remove());
    localStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.employee');
    window.location.hash = '#/citas';
  });

  it('redirects an unauthenticated dashboard navigation to employee login', async () => {
    localStorage.setItem('galenosv.authToken', 'invalid-or-expired-token');
    window.location.hash = '#/empleados/dashboard';
    const router = document.createElement('galeno-router');
    document.body.append(router);

    await waitFor(() => window.location.hash === '#/empleados/login'
      && router.shadowRoot.querySelector('galeno-login'));

    expect(apiService.isAuthenticated()).to.equal(false);
    expect(localStorage.getItem('galenosv.authToken')).to.equal(null);
    expect(router.shadowRoot.querySelector('[data-route="/empleados/login"]')).not.to.equal(null);
  });

  it('allows a dashboard route with a non-expired backend JWT', async () => {
    const payload = encode({ sub: 'employee-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem('galenosv.authToken', `${encode({ alg: 'HS256', typ: 'JWT' })}.${payload}.signature`);
    sessionStorage.setItem('galenosv.employee', JSON.stringify({
      id: 'employee-1',
      assignments: [{ idClinica: 'clinic-1', idRol: 'role-1', clinica: 'Central', rol: 'Médico' }],
    }));
    window.location.hash = '#/empleados/dashboard';
    const router = document.createElement('galeno-router');
    document.body.append(router);

    await waitFor(() => router.shadowRoot.querySelector('galeno-dashboard'));

    expect(window.location.hash).to.equal('#/empleados/dashboard');
    expect(router.shadowRoot.querySelector('[data-route="/empleados/dashboard"]')).not.to.equal(null);
  });

  it('renders an accessible navigation error when a route module fails to load', async () => {
    const route = routes.find(({ path }) => path === '/personas');
    const originalLoad = route.load;
    const error = new Error('module unavailable');
    const logError = sinon.stub(console, 'error');
    route.load = () => Promise.reject(error);

    try {
      window.location.hash = '#/personas';
      const router = document.createElement('galeno-router');
      document.body.append(router);
      await waitFor(() => router.shadowRoot.querySelector('[role="alert"]'));

      expect(router.shadowRoot.querySelector('[role="alert"]').textContent)
        .to.include('No se pudo abrir esta sección');
      expect(document.title).to.equal('Error de navegación · GalenoSV');
      expect(logError.called).to.equal(true);
    } finally {
      route.load = originalLoad;
      logError.restore();
    }
  });

  it('normalizes accented names and sorts worker results by surname', async () => {
    const sandbox = sinon.createSandbox();
    const originalListeners = self.addEventListener;
    const messageListeners = new Map();
    const postMessage = sandbox.stub(self, 'postMessage');
    sandbox.stub(self, 'addEventListener').callsFake((type, listener) => {
      messageListeners.set(type, listener);
    });

    try {
      await import(`../src/personas-worker.js?test=${Date.now()}`);
      messageListeners.get('message')({
        data: {
          requestId: 42,
          query: '  ELENA ',
          personas: [
            { nombres: 'Elena', apellidos: 'Zúñiga' },
            { nombres: 'Elena', apellidos: 'Álvarez' },
            { nombres: 'Carlos', apellidos: 'Pérez' },
          ],
        },
      });

      expect(postMessage.calledOnce).to.equal(true);
      expect(postMessage.firstCall.args[0]).to.deep.equal({
        requestId: 42,
        results: [
          { nombres: 'Elena', apellidos: 'Álvarez' },
          { nombres: 'Elena', apellidos: 'Zúñiga' },
        ],
      });
    } finally {
      sandbox.restore();
      expect(self.addEventListener).to.equal(originalListeners);
    }
  });

  it('renders route-specific titles and descriptions in the placeholder page', () => {
    const cases = [
      ['/citas', 'Búsqueda de citas', 'HU1'],
      ['/empleados/login', 'Acceso de empleados', 'HU2'],
      ['/empleados/dashboard', 'Agenda del personal', 'HU3'],
      ['/consultas/consulta-1', 'Seguimiento de consulta', 'HU4'],
      ['/not-found', 'Página no encontrada', 'no existe'],
      ['/otra-seccion', 'GalenoSV', 'en preparación'],
    ];

    for (const [route, title, description] of cases) {
      const page = document.createElement('galeno-placeholder');
      page.setAttribute('data-route', route);
      document.body.append(page);
      expect(page.shadowRoot.querySelector('h1').textContent).to.equal(title);
      expect(page.shadowRoot.querySelector('.placeholder-description').textContent)
        .to.include(description);
      page.remove();
    }
  });
});
