export class UiButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Creamos la estructura base
    this.shadowRoot.innerHTML = `
      <button part="button" type="button"><slot></slot></button>
    `;
    this._btn = this.shadowRoot.querySelector('button');
    
    // Cargamos el CSS externo de forma asíncrona
    this._cargarEstilos();

    this._btn.addEventListener('click', (e) => {
      if (!this.hasAttribute('disabled')) {
        this.dispatchEvent(new CustomEvent('ui-click', { bubbles: true, composed: true }));
      }
    });
  }

   async _cargarEstilos() {
    try {
      const url = new URL('../../styles/components/ui-button.css', import.meta.url);
      const response = await fetch(url);
      const cssText = await response.text();
      
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn("No se pudo cargar el CSS del botón", error);
    }
  }

  static get observedAttributes() { return ['disabled', 'title']; }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'disabled') this._btn.disabled = newVal !== null;
    if (name === 'title') this._btn.title = newVal ?? '';
  }

  get disabled() { return this._btn.disabled; }
  set disabled(value) {
    if (value) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }
  focus() { this._btn.focus(); }
}
customElements.define('ui-button', UiButton);