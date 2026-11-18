import { connectivity } from '../../state/connectivity.js';

export class UiConnectionStatus extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="banner" role="status" aria-live="polite" hidden>
        <p class="connection-message"></p>
        <p class="cache-message" hidden>Algunos datos podrían estar desactualizados</p>
      </div>
    `;
    this._banner = this.shadowRoot.querySelector('.banner');
    this._connectionMessage = this.shadowRoot.querySelector('.connection-message');
    this._cacheMessage = this.shadowRoot.querySelector('.cache-message');
    this._online = connectivity.isOnline();
    this._cachedData = false;
    this._hideTimer = null;
    this._onCachedResponse = this._onCachedResponse.bind(this);
    this._loadStyles();
  }

  connectedCallback() {
    this._online = connectivity.isOnline();
    this._unsubscribe = connectivity.subscribe((online) => this._onConnectivityChange(online));
    globalThis.window?.addEventListener('api-from-cache', this._onCachedResponse);
    this._render();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    globalThis.window?.removeEventListener('api-from-cache', this._onCachedResponse);
    clearTimeout(this._hideTimer);
  }

  async _loadStyles() {
    try {
      const url = new URL('../../styles/components/ui-connection-status.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se encontró el CSS de conectividad.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudo cargar el estilo de conectividad:', error);
    }
  }

  _onConnectivityChange(online) {
    this._online = online;
    clearTimeout(this._hideTimer);

    if (online) {
      this._cachedData = false;
      this._hideTimer = setTimeout(() => {
        this._connectionMessage.textContent = '';
        this._render();
      }, 3000);
    }

    this._render(online);
  }

  _onCachedResponse() {
    this._cachedData = true;
    if (this._online) {
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._cachedData = false;
        this._render();
      }, 3000);
    }
    this._render();
  }

  _render(showRestored = false) {
    if (!this.isConnected) return;

    const showOffline = !this._online;
    const showCached = this._cachedData;
    const visible = showOffline || showCached || showRestored;

    this._banner.hidden = !visible;
    this._banner.classList.toggle('offline', showOffline);
    this._banner.classList.toggle('restored', showRestored);
    this._banner.classList.toggle('cached', showCached);
    this._connectionMessage.textContent = showOffline
      ? 'Sin conexión: mostrando datos guardados. Los cambios no se pueden guardar hasta recuperar la red.'
      : showRestored ? 'Conexión restablecida' : '';
    this._cacheMessage.hidden = !showCached;
  }
}

customElements.define('ui-connection-status', UiConnectionStatus);
