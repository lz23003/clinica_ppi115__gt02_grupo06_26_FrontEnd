export class AppRoot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; min-height: 100vh; background: var(--color-bg); }
        .vista-container { height: 100vh; }
        .error { color: var(--color-danger); padding: 2rem; text-align: center; font-family: sans-serif; }
      </style>
      <div id="vista" class="vista-container"></div>
    `;
    this._container = this.shadowRoot.getElementById('vista');
    
    // Mapeo de rutas a archivos exactos (con .js)
        this._rutas = {
      '#/login': 'view-login.js',
      '#/dashboard': 'view-dashboard.js',
      '#/citas': 'view-citas.js', // <-- Asegúrate de que esté esta línea
      '#/consulta': 'view-consulta.js'
    };
  }

  connectedCallback() {
    this._navegar = this._navegar.bind(this);
    window.addEventListener('hashchange', this._navegar);
    
    if (!window.location.hash) {
      window.location.hash = '#/login';
    } else {
      this._navegar();
    }
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._navegar);
  }

  async _navegar() {
    const hash = window.location.hash || '#/login';
    const archivo = this._rutas[hash] || 'view-login.js';
    const tagName = archivo.replace('.js', '');
    
    this._container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">Cargando...</div>';

    try {
      // Importación dinámica con la extensión exacta
      await import(`../views/${archivo}`);
      this._container.innerHTML = ''; 
      const vista = document.createElement(tagName);
      this._container.appendChild(vista);
    } catch (err) {
      console.error(`Error al cargar vista ${archivo}:`, err);
      this._container.innerHTML = `
        <div class="error">
          <h2>Error al cargar la vista</h2>
          <p>No se pudo encontrar o cargar el archivo: <strong>${archivo}</strong></p>
          <p>Revisa la consola (F12) para más detalles.</p>
        </div>
      `;
    }
  }
}
customElements.define('app-root', AppRoot);