import { findRoute, normalizeRoutePath, routes } from './routes.js';
import { apiService } from '../api.service.js';

class GalenoRouter extends HTMLElement {
  #outlet;
  #currentPath;
  #pendingConsultation = null;
  #navigationSequence = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('../../styles.css', import.meta.url);

    this.#outlet = document.createElement('section');
    this.#outlet.className = 'route-outlet';
    this.#outlet.setAttribute('aria-live', 'off');
    root.append(stylesheet, this.#outlet);
  }

  connectedCallback() {
    window.addEventListener('hashchange', this.#onLocationChange);
    this.addEventListener('atender-consulta', this.#onAttendConsultation);
    this.addEventListener('consulta-finalizada', this.#onConsultationFinished);
    this.addEventListener('cerrar-sesion', this.#onLogout);
    if (!window.location.hash) window.location.hash = '#/citas';
    else void this.#renderRoute();
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.#onLocationChange);
    this.removeEventListener('atender-consulta', this.#onAttendConsultation);
    this.removeEventListener('consulta-finalizada', this.#onConsultationFinished);
    this.removeEventListener('cerrar-sesion', this.#onLogout);
  }

  #onLocationChange = () => {
    void this.#renderRoute();
  };

  #onAttendConsultation = (event) => {
    const consultation = event.detail?.consulta;
    const consultationId = event.detail?.consultaId || consultation?.id;
    if (!consultationId) return;
    this.#pendingConsultation = consultation || null;
    window.location.hash = `#/consultas/${encodeURIComponent(consultationId)}`;
  };

  #onConsultationFinished = () => {
    window.location.hash = '#/empleados/dashboard';
  };

  #onLogout = () => {
    apiService.logout();
    this.#currentPath = null;
    window.location.hash = '#/empleados/login';
  };

  async #renderRoute() {
    const path = normalizeRoutePath(window.location.hash);
    if (path === this.#currentPath) return;
    this.#currentPath = path;
    const navigationSequence = ++this.#navigationSequence;
    const match = findRoute(path, routes);
    if (match.route.requiresAuth && !apiService.isAuthenticated()) {
      this.#currentPath = null;
      window.location.hash = '#/empleados/login';
      return;
    }

    try {
      await match.route.load();
      if (navigationSequence !== this.#navigationSequence) return;
      const page = document.createElement(match.route.element);
      page.setAttribute('data-route', path);
      for (const [name, value] of Object.entries(match.params)) {
        page.setAttribute(`route-${name}`, value);
      }
      if (match.route.element === 'galeno-consulta-activa') {
        page.consulta = this.#pendingConsultation;
        this.#pendingConsultation = null;
      }
      this.#outlet.replaceChildren(page);
      document.title = `${match.route.title} · GalenoSV`;
      this.dispatchEvent(new CustomEvent('route-change', {
        bubbles: true,
        composed: true,
        detail: { path, title: match.route.title },
      }));
    } catch (error) {
      if (navigationSequence !== this.#navigationSequence) return;
      this.#currentPath = null;
      console.error(`No se pudo cargar la ruta ${path}.`, error);
      this.#outlet.replaceChildren(this.#makeErrorPage());
      document.title = 'Error de navegación · GalenoSV';
    }
  }

  #makeErrorPage() {
    const message = document.createElement('p');
    message.className = 'route-error';
    message.setAttribute('role', 'alert');
    message.textContent = 'No se pudo abrir esta sección. Verifica tu conexión e inténtalo de nuevo.';
    return message;
  }
}

if (!customElements.get('galeno-router')) {
  customElements.define('galeno-router', GalenoRouter);
}

export { GalenoRouter };
