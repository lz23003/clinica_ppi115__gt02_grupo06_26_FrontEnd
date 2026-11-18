export class UiTextarea extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <label id="label" for="control"></label>
      <textarea id="control"></textarea>
    `;
    this._label = this.shadowRoot.getElementById('label');
    this._control = this.shadowRoot.getElementById('control');
    this._control.addEventListener('input', () => {
      this.dispatchEvent(new CustomEvent('ui-input', {
        bubbles: true,
        composed: true,
        detail: { value: this.value }
      }));
    });
    this._loadStyles();
  }

  static get observedAttributes() {
    return ['label', 'rows', 'placeholder', 'value', 'disabled', 'id'];
  }

  attributeChangedCallback(name, oldValue, value) {
    if (name === 'label') this._label.textContent = value ?? '';
    if (name === 'rows') this._control.rows = Number(value) || 3;
    if (name === 'placeholder') this._control.placeholder = value ?? '';
    if (name === 'value' && this._control.value !== value) this._control.value = value ?? '';
    if (name === 'disabled') this._control.disabled = value !== null;
    if (name === 'id') {
      this._control.id = value ? `${value}-control` : 'control';
      this._label.htmlFor = this._control.id;
    }
  }

  async _loadStyles() {
    try {
      const response = await fetch(new URL('../../styles/components/ui-textarea.css', import.meta.url));
      if (!response.ok) throw new Error('No se encontró el CSS de ui-textarea.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudieron cargar los estilos de ui-textarea:', error);
    }
  }

  get value() { return this._control.value; }
  set value(value) { this._control.value = value ?? ''; }
  get disabled() { return this._control.disabled; }
  set disabled(value) { this._control.disabled = Boolean(value); }
  focus() { this._control.focus(); }
}

customElements.define('ui-textarea', UiTextarea);
