import './core/router.js';
import { apiService } from './api.service.js';
import { registerServiceWorker } from './pwa.js';

const template = document.querySelector('#galeno-app-template');

class GalenoApp extends HTMLElement {
  #installPrompt = null;
  #registration = null;
  #reloadForUpdate = false;

  constructor() {
    super();
    if (!template) throw new Error('No se encontró la plantilla de GalenoSV.');
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.#reloadForUpdate = Boolean(navigator.serviceWorker?.controller);
    this.shadowRoot.querySelector('#install-app').addEventListener('click', () => this.#install());
    this.shadowRoot.querySelector('#update-app').addEventListener('click', () => this.#activateUpdate());
    this.#updateConnectionStatus();
    window.addEventListener('online', this.#updateConnectionStatus);
    window.addEventListener('offline', this.#updateConnectionStatus);
    window.addEventListener('beforeinstallprompt', this.#onInstallPrompt);
    window.addEventListener('appinstalled', this.#onInstalled);
    navigator.serviceWorker?.addEventListener('controllerchange', this.#onControllerChange);
    navigator.serviceWorker?.addEventListener('message', this.#onServiceWorkerMessage);
    this.addEventListener('login-submit', this.#onLoginSubmit);
    window.addEventListener('online', this.#syncOfflineQueue);
    document.addEventListener('galeno-api-error', this.#onApiError);
    this.#registerServiceWorker();
  }

  disconnectedCallback() {
    window.removeEventListener('online', this.#updateConnectionStatus);
    window.removeEventListener('offline', this.#updateConnectionStatus);
    window.removeEventListener('beforeinstallprompt', this.#onInstallPrompt);
    window.removeEventListener('appinstalled', this.#onInstalled);
    navigator.serviceWorker?.removeEventListener('controllerchange', this.#onControllerChange);
    navigator.serviceWorker?.removeEventListener('message', this.#onServiceWorkerMessage);
    this.removeEventListener('login-submit', this.#onLoginSubmit);
    window.removeEventListener('online', this.#syncOfflineQueue);
    document.removeEventListener('galeno-api-error', this.#onApiError);
  }

  #updateConnectionStatus = () => {
    const status = this.shadowRoot?.querySelector('#connection-status');
    if (!status) return;
    status.textContent = navigator.onLine
      ? 'Conectado'
      : 'Sin conexión · modo offline';
    status.classList.toggle('offline', !navigator.onLine);
  };

  #onInstallPrompt = (event) => {
    event.preventDefault();
    this.#installPrompt = event;
    this.shadowRoot.querySelector('#install-app').hidden = false;
  };

  #onInstalled = () => {
    this.#installPrompt = null;
    this.shadowRoot.querySelector('#install-app').hidden = true;
    this.#announce('GalenoSV se instaló correctamente.');
  };

  #onControllerChange = () => {
    if (this.#reloadForUpdate) window.location.reload();
  };

  #onLoginSubmit = async (event) => {
    const login = event.composedPath().find((target) => target?.localName === 'galeno-login');
    if (!login) {
      this.#announce('No se pudo identificar el formulario de acceso.');
      return;
    }
    login.busy = true;
    login.setStatus('');
    try {
      await apiService.login(event.detail);
      login.setStatus('Identidad validada. Abriendo el portal…');
      window.location.hash = '#/empleados/dashboard';
    } catch (error) {
      login.setStatus(error.message || 'No se pudo validar la identidad.', true);
    } finally {
      login.busy = false;
    }
  };

  #onServiceWorkerMessage = (event) => {
    if (event.data?.type !== 'OFFLINE_SYNC_COMPLETE') return;
    document.dispatchEvent(new CustomEvent('galeno-offline-sync', { detail: event.data.result }));
    this.#announce(event.data.result?.sent
      ? `Se sincronizaron ${event.data.result.sent} cambios pendientes.`
      : 'Se comprobó la cola de sincronización.');
  };

  #onApiError = (event) => {
    this.#announce(event.detail?.message || 'Ocurrió un error al comunicarse con el backend.');
  };

  #syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration && 'sync' in registration) {
        registration.active?.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
        return;
      }
      const result = await apiService.sincronizarPendientesOffline();
      if (result.sent) this.#announce(`Se sincronizaron ${result.sent} cambios pendientes.`);
      if (result.failures.length) {
        console.warn('Hay cambios offline que no pudieron sincronizarse.', result.failures);
      }
    } catch (error) {
      console.error('No se pudo sincronizar la cola offline.', error);
    }
  };

  async #registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    try {
      this.#registration = await registerServiceWorker(
        navigator.serviceWorker,
        new URL('../service-worker.js', import.meta.url),
        { scope: './', type: 'module' },
      );
      if (this.#registration.waiting && navigator.serviceWorker.controller) {
        this.shadowRoot.querySelector('#update-app').hidden = false;
      }
      this.#registration.addEventListener('updatefound', () => {
        const worker = this.#registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            this.shadowRoot.querySelector('#update-app').hidden = false;
          }
        });
      });
    } catch (error) {
      console.error('No se pudo registrar el service worker.', error);
      this.#announce('No se pudo activar el modo offline.');
    }
  }

  async #install() {
    if (!this.#installPrompt) return;
    this.#installPrompt.prompt();
    await this.#installPrompt.userChoice;
    this.#installPrompt = null;
    this.shadowRoot.querySelector('#install-app').hidden = true;
  }

  #activateUpdate() {
    this.#reloadForUpdate = true;
    this.#registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  #announce(message) {
    this.shadowRoot.querySelector('#app-announcement').textContent = message;
  }
}

if (!customElements.get('galeno-app')) {
  customElements.define('galeno-app', GalenoApp);
}
