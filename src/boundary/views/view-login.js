import { TipoDocumentoService } from '../../control/tipo-documento-service.js';
import { AuthService } from '../../control/auth-service.js';
import { SessionStore } from '../../state/session-store.js';

import '../components/ui-button.js';
import '../components/ui-input.js';
import '../components/ui-select.js';


export class ViewLogin extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.authService = new AuthService();
    this.tipoDocService = new TipoDocumentoService();
    
    this.shadowRoot.innerHTML = `
    
      <div class="card">
        <div class="logo-container">
          <img src="./src/assets/logo.png" alt="ClinicaSV Logo" />
        </div>
        <h1>ClinicaSV</h1>
        <p class="subtitle">Portal de Empleados</p>
        
        <div id="error-msg" class="error"></div>

        <div class="form-group">
          <ui-select id="tipo-doc" label="Tipo de Documento"></ui-select>
          <ui-input id="num-doc" label="Número de Documento" placeholder="Ingresa tu número..."></ui-input>
          <ui-button id="btn-login">INICIAR SESIÓN</ui-button>
           <div style="text-align: center; margin-top: 16px;">
            <a href="#/citas" style="color: #1e5fa8; font-size: 0.9rem; text-decoration: none;">¿Eres paciente? Busca tus citas aquí</a>
          </div>
        </div>
      </div>
    `;

    this._cargarEstilos();
  }

     async _cargarEstilos() {
    try {
      const url = new URL('../../styles/views/view-login.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error("No se encontró el CSS");
      const cssText = await response.text();
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn("No se pudo cargar el CSS del login", error);
    }
  }

  connectedCallback() {
    this._btn = this.shadowRoot.getElementById('btn-login');
    this._selectDoc = this.shadowRoot.getElementById('tipo-doc');
    this._inputDoc = this.shadowRoot.getElementById('num-doc');
    this._errorMsg = this.shadowRoot.getElementById('error-msg');

    // Escuchar el clic del botón directamente
    this._btn.addEventListener('ui-click', () => {
      this._handleLogin();
    });

    this._cargarTiposDocumento();
  }

  async _cargarTiposDocumento() {
    try {
      await customElements.whenDefined('ui-select');
      const tipos = await this.tipoDocService.listarActivos();
      if (tipos.length === 0) {
        this._errorMsg.textContent = 'No hay tipos de documento activos disponibles.';
        this._errorMsg.style.display = 'block';
        return;
      }

      const opciones = tipos.map(t => ({
        value: t.idTipoDocumento,
        label: t.nombre
      }));
      this.shadowRoot.getElementById('tipo-doc').setOptions(opciones);
    } catch (error) {
      console.error("Error al cargar tipos:", error);
      this._errorMsg.textContent = 'No se pudieron cargar los tipos de documento. Intenta recargar la página.';
      this._errorMsg.style.display = 'block';
      window.dispatchEvent(new CustomEvent('ui-toast', {
        detail: { type: 'danger', message: 'Error al cargar tipos de documento: ' + error.message }
      }));
    }
  }

  async _handleLogin() {
  
    
    this._errorMsg.style.display = 'none';
    const tipoDoc = this._selectDoc.value;
    const numDoc = this._inputDoc.value.trim();

    if (!tipoDoc || !numDoc) {
      this._errorMsg.textContent = "Por favor, completa todos los campos.";
      this._errorMsg.style.display = 'block';
      return;
    }

    this._btn.setAttribute('disabled', 'true');
    this._btn.textContent = 'Validando...';

    try {
      console.log("Buscando en:", tipoDoc, numDoc);
      const { persona, roles } = await this.authService.login(tipoDoc, numDoc);
      
      SessionStore.setSession(persona, roles);
      window.location.hash = '#/dashboard';
      
    } catch (error) {
      console.error("Error de Login:", error);
      this._errorMsg.textContent = error.message;
      this._errorMsg.style.display = 'block';
    } finally {
      this._btn.removeAttribute('disabled');
      this._btn.textContent = 'INICIAR SESIÓN';
    }
  }
}
customElements.define('view-login', ViewLogin);