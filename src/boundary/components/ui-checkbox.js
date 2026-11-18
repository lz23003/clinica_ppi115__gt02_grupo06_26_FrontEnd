export class UiCheckbox extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <label>
        <input type="checkbox">
        <span id="label"></span>
      </label>
    `;
    this._input = this.shadowRoot.querySelector('input');
    this._label = this.shadowRoot.getElementById('label');
    this._input.addEventListener('change', () => {
      this.dispatchEvent(new CustomEvent('ui-change', {
        bubbles: true,
        composed: true,
        detail: { checked: this.checked, value: this.value }
      }));
    });
    this._loadStyles();
  }

  static get observedAttributes() {
    return ['label', 'value', 'checked', 'disabled'];
  }

  attributeChangedCallback(name, oldValue, value) {
    if (name === 'label') this._label.textContent = value ?? '';
    if (name === 'value') this._input.value = value ?? '';
    if (name === 'checked') this._input.checked = value !== null;
    if (name === 'disabled') this._input.disabled = value !== null;
  }

  async _loadStyles() {
    try {
      const response = await fetch(new URL('../../styles/components/ui-checkbox.css', import.meta.url));
      if (!response.ok) throw new Error('No se encontró el CSS de ui-checkbox.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudieron cargar los estilos de ui-checkbox:', error);
    }
  }

  get value() { return this._input.value; }
  set value(value) { this._input.value = value ?? ''; }
  get checked() { return this._input.checked; }
  set checked(value) { this._input.checked = Boolean(value); }
  get disabled() { return this._input.disabled; }
  set disabled(value) { this._input.disabled = Boolean(value); }
}

customElements.define('ui-checkbox', UiCheckbox);
