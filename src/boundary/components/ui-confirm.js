export class UiConfirm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="overlay" role="presentation">
        <section class="dialog" role="alertdialog" aria-modal="true"
          aria-labelledby="title" aria-describedby="message">
          <h2 id="title"></h2>
          <p id="message"></p>
          <div class="actions">
            <button type="button" class="cancel">Cancelar</button>
            <button type="button" class="accept">Finalizar consulta</button>
          </div>
        </section>
      </div>
    `;
    this._overlay = this.shadowRoot.querySelector('.overlay');
    this._title = this.shadowRoot.getElementById('title');
    this._message = this.shadowRoot.getElementById('message');
    this._resolve = null;

    this.shadowRoot.querySelector('.cancel').addEventListener('click', () => {
      this._finish(false);
    });
    this.shadowRoot.querySelector('.accept').addEventListener('click', () => {
      this._finish(true);
    });
    this._overlay.addEventListener('click', (event) => {
      if (event.target === this._overlay) this._finish(false);
    });
    this._handleKeydown = (event) => {
      if (event.key === 'Escape') this._finish(false);
    };

    this._loadStyles();
  }

  connectedCallback() {
    this.ownerDocument.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    this.ownerDocument.removeEventListener('keydown', this._handleKeydown);
    this._finish(false);
  }

  async _loadStyles() {
    try {
      const url = new URL('../../styles/components/ui-confirm.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se encontró el CSS de confirmación.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudo cargar el CSS de confirmación:', error);
    }
  }

  show(message, title = 'Confirmar acción') {
    if (this._resolve) {
      throw new Error('Ya hay una confirmación abierta en este componente.');
    }
    this._title.textContent = title;
    this._message.textContent = message;
    this._overlay.classList.add('open');
    this.shadowRoot.querySelector('.accept').focus();
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  _finish(confirmed) {
    if (!this._resolve) return;
    const resolve = this._resolve;
    this._resolve = null;
    this._overlay.classList.remove('open');
    resolve(confirmed);
  }
}

customElements.define('ui-confirm', UiConfirm);
