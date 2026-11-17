export class UiSelect extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    this.shadowRoot.innerHTML = `
      <label id="lbl"></label>
      <select id="sel"></select>
    `;
    this._label = this.shadowRoot.getElementById('lbl');
    this._select = this.shadowRoot.getElementById('sel');

    this._select.addEventListener('change', (e) => {
      this.dispatchEvent(new CustomEvent('ui-change', { 
        bubbles: true, composed: true, detail: { value: e.target.value } 
      }));
    });

    this._cargarEstilos();
  }

   async _cargarEstilos() {
    try {
      const url = new URL('../../styles/components/ui-select.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error("No se encontró el CSS");
      const cssText = await response.text();
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn("No se pudo cargar el CSS del select", error);
    }
  }

  static get observedAttributes() { return ['label']; }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'label') this._label.textContent = newVal;
  }

  setOptions(options) {
    this._select.innerHTML = '<option value="">-- Seleccione --</option>';
    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      this._select.appendChild(el);
    });
  }

  get value() { return this._select.value; }
}
customElements.define('ui-select', UiSelect);