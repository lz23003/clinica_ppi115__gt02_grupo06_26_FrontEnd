export class UiInput extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    this.shadowRoot.innerHTML = `
      <label id="lbl"></label>
      <input id="inp" type="text" />
    `;
    this._label = this.shadowRoot.getElementById('lbl');
    this._input = this.shadowRoot.getElementById('inp');

    this._input.addEventListener('input', (e) => {
      this.dispatchEvent(new CustomEvent('ui-input', { 
        bubbles: true, composed: true, detail: { value: e.target.value } 
      }));
    });

    this._cargarEstilos();
  }

   async _cargarEstilos() {
    try {
      const url = new URL('../../styles/components/ui-input.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error("No se encontró el CSS");
      const cssText = await response.text();
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn("No se pudo cargar el CSS del input", error);
    }
  }

  static get observedAttributes() { return ['label', 'type', 'placeholder', 'value']; }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'label') this._label.textContent = newVal;
    if (name === 'type') this._input.type = newVal;
    if (name === 'placeholder') this._input.placeholder = newVal;
    if (name === 'value') this._input.value = newVal;
  }

  get value() { return this._input.value; }
  set value(val) { this._input.value = val; }
}
customElements.define('ui-input', UiInput);