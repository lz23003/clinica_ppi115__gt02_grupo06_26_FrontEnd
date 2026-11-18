import { ApiClient } from '../../control/api-client.js';
import { TipoDocumentoService } from '../../control/tipo-documento-service.js';
import { OfflineError } from '../../control/offline-error.js';
import { connectivity } from '../../state/connectivity.js';

import '../components/ui-button.js';
import '../components/ui-input.js';
import '../components/ui-select.js';

export class ViewCitas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.api = new ApiClient();
    this.tipoDocService = new TipoDocumentoService();
    
    this.shadowRoot.innerHTML = `
      <div class="header">
        <h1>ClinicaSV - Búsqueda de Citas</h1>
      </div>

      <div class="card">
        <h3 class="form-title">Asistente de Búsqueda de Citas</h3>
        <div class="form-grid">
          
          <ui-select id="tipo-doc" label="Tipo de Documento"></ui-select>
          
          <ui-input id="num-doc" label="Número de Documento" placeholder="Ingresa tu documento..."></ui-input>
          
          <ui-select id="clinica" label="Clínica">
            <!-- Se llenará con las clínicas -->
          </ui-select>

          <div>
            <label class="date-label">Rango de Fechas</label>
            <div class="date-range">
              <div>
                <input type="date" id="fecha-desde" class="date-input">
                <span class="date-hint">Desde</span>
              </div>
              <div>
                <input type="date" id="fecha-hasta" class="date-input">
                <span class="date-hint">Hasta</span>
              </div>
            </div>
            <p id="error-rango-fechas" class="date-error" role="alert" hidden></p>
          </div>

        </div>
        
        <div class="form-actions">
          <ui-button id="btn-buscar" class="button-search">BUSCAR CITAS</ui-button>
          <ui-button id="btn-volver-login" class="button-login">Ir a Login</ui-button>
        </div>
      </div>

      <div class="grid-resultados" id="resultados"></div>
    `;
    this._cargarEstilos();
  }

  async _cargarEstilos() {
    try {
      const url = new URL('../../styles/views/view-citas.css', import.meta.url);
      const response = await fetch(url);
      const cssText = await response.text();
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) { console.warn(error); }
  }

  connectedCallback() {
    this._cargarTiposDocumento();
    this._cargarClinicas();

    this.shadowRoot.getElementById('btn-volver-login').addEventListener('ui-click', () => {
      window.location.hash = '#/login';
    });

    this.shadowRoot.getElementById('btn-buscar').addEventListener('ui-click', () => {
      this._buscarCitas();
    });

    ['fecha-desde', 'fecha-hasta'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('input', () => {
        this._limpiarErrorRangoFechas();
      });
    });
  }

  async _cargarTiposDocumento() {
    try {
      const tipos = await this.tipoDocService.listarActivos();
      const select = this.shadowRoot.getElementById('tipo-doc');
      const opciones = tipos.map(t => ({ value: t.idTipoDocumento, label: t.nombre }));
      select.setOptions(opciones);
    } catch (error) {
      console.error("Error al cargar tipos:", error);
      if (error instanceof OfflineError || !connectivity.isOnline()) {
        this._toast('warning', error.message);
      }
    }
  }

  async _cargarClinicas() {
    try {
      // Llamamos al nuevo endpoint que solo devuelve las activas
      const clinicas = await this.api.get('/clinicas/activas');
      const select = this.shadowRoot.getElementById('clinica');
      const opciones = clinicas.map(c => ({ value: c.idClinica, label: c.nombre }));
      select.setOptions(opciones);
    } catch (error) {
      console.error("Error al cargar clínicas:", error);
      if (error instanceof OfflineError || !connectivity.isOnline()) {
        this._toast('warning', error.message);
      }
    }
  }

  async _buscarCitas() {
    const tipoDoc = this.shadowRoot.getElementById('tipo-doc').value;
    const numDoc = this.shadowRoot.getElementById('num-doc').value.trim();
    const idClinica = this.shadowRoot.getElementById('clinica').value;
    const fechaDesde = this.shadowRoot.getElementById('fecha-desde').value;
    const fechaHasta = this.shadowRoot.getElementById('fecha-hasta').value;
    
    const contenedor = this.shadowRoot.getElementById('resultados');

    if (!this._validarRangoFechas(fechaDesde, fechaHasta)) return;
    
    if (!tipoDoc || !numDoc) {
      window.dispatchEvent(new CustomEvent('ui-toast', {
        detail: {
          type: 'warning',
          message: 'Selecciona el tipo de documento e ingresa el número para buscar tus citas.'
        }
      }));
      return;
    }

    this._mostrarEstado('Buscando tus citas', 'Estamos consultando la información. Un momento, por favor.', 'loading');

    try {
      // 1. Buscamos a la persona por documento
      const personas = await this.api.get(`/personas/buscar?tipoDocumento=${tipoDoc}&valorDocumento=${encodeURIComponent(numDoc)}`);
      const persona = Array.isArray(personas) ? personas[0] : personas;
      
      if (!persona || !persona.idPersona) {
        this._mostrarEstado(
          'No encontramos ese documento',
          'Verifica el tipo y número de documento e inténtalo nuevamente.',
          'empty'
        );
        return;
      }

      // 2. Traemos todas las consultas y filtramos
      const consultas = await this.api.get('/consultas/all');
      
      let citasPaciente = consultas.filter(c => 
        c.idPersonaRol && c.idPersonaRol.idPersona && c.idPersonaRol.idPersona.idPersona === persona.idPersona
      );

      // Filtro por Clínica
      if (idClinica) {
        citasPaciente = citasPaciente.filter(c => 
          c.idPersonaRol.idClinica && c.idPersonaRol.idClinica.idClinica === idClinica
        );
      }

      // Filtro por Fechas (comparando strings de fecha YYYY-MM-DD)
      if (fechaDesde) {
        citasPaciente = citasPaciente.filter(c => c.fechaInicio && c.fechaInicio.split('T')[0] >= fechaDesde);
      }
      if (fechaHasta) {
        citasPaciente = citasPaciente.filter(c => c.fechaInicio && c.fechaInicio.split('T')[0] <= fechaHasta);
      }

      if (citasPaciente.length === 0) {
        this._mostrarEstado(
          'No hay citas para mostrar',
          'No encontramos citas que coincidan con el documento, la clínica y el rango de fechas seleccionados.',
          'empty'
        );
        return;
      }

      // 3. Renderizamos las tarjetas
      contenedor.innerHTML = '';
      for (const c of citasPaciente) {
        // Formatear fecha y hora
        const fechaObj = c.fechaInicio ? new Date(c.fechaInicio.replace('[UTC]', '')) : null;
        const fecha = fechaObj ? fechaObj.toLocaleDateString() : 'Sin fecha';
        const hora = fechaObj ? fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        
                const clinica = c.idPersonaRol?.idClinica ? c.idPersonaRol.idClinica.nombre : 'Clínica Desconocida';

        //  HU1: Obtener procedimientos reales del backend
        let procedimientosTexto = 'No hay procedimientos registrados.';
        try {
          const detalle = await this.api.get(`/consultas/${c.idConsulta}/detalle-completo`);
          if (detalle && detalle.procedimientos && detalle.procedimientos.length > 0) {
            procedimientosTexto = detalle.procedimientos.map(p => `• ${p.nombreProcedimiento || 'Procedimiento'}`).join('<br>');
          }
        } catch (err) {
          console.warn('No se pudo cargar el detalle:', err);
          if (err instanceof OfflineError || !connectivity.isOnline()) {
            this._toast('warning', err.message);
          }
          procedimientosTexto = 'No se pudo cargar el detalle de los procedimientos.';
        }

        const card = document.createElement('div');
        card.className = 'cita-card';
        card.innerHTML = `
          <div class="card-header">
            <span>  ${fecha}</span>
            <span>  ${hora}</span>
          </div>
          <p><strong>  Clínica:</strong> ${clinica}</p>
          <p><strong>  Procedimientos:</strong><br>${procedimientosTexto}</p>
          <button class="btn-ticket">Descargar Ticket PDF</button>
        `;
        
        const button = card.querySelector('.btn-ticket');
        button.addEventListener('click', async () => {
          if (!connectivity.isOnline()) {
            this._toast('warning', 'El ticket PDF se genera en el servidor y requiere conexión.');
            return;
          }

          button.disabled = true;
          button.textContent = 'Generando...';
          let url;

          try {
            const blob = await this.api.get(`/consultas/${c.idConsulta}/ticket`, {
              headers: { Accept: '*/*' },
              responseType: 'blob'
            });
            url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ticket_${c.idConsulta.substring(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (error) {
            const message = error instanceof OfflineError
              ? 'El ticket PDF se genera en el servidor y requiere conexión.'
              : this._mensajeAmigable(error, 'ticket');
            this._toast('danger', message);
          } finally {
            if (url) window.URL.revokeObjectURL(url);
            button.disabled = false;
            button.textContent = 'Descargar Ticket PDF';
          }
        });

        contenedor.appendChild(card);
      }

    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) {
        this._toast('warning', error.message);
      }
      this._mostrarEstado(
        'No pudimos cargar tus citas',
        this._mensajeAmigable(error),
        'error'
      );
    }
  }

  _mostrarEstado(titulo, mensaje, tipo) {
    const contenedor = this.shadowRoot.getElementById('resultados');
    const estado = document.createElement('div');
    estado.className = `result-message result-message--${tipo}`;
    estado.setAttribute('role', tipo === 'error' ? 'alert' : 'status');

    const encabezado = document.createElement('h3');
    encabezado.textContent = titulo;
    const detalle = document.createElement('p');
    detalle.textContent = mensaje;
    estado.append(encabezado, detalle);
    contenedor.replaceChildren(estado);
  }

  _validarRangoFechas(fechaDesde, fechaHasta) {
    const inputDesde = this.shadowRoot.getElementById('fecha-desde');
    const inputHasta = this.shadowRoot.getElementById('fecha-hasta');
    const error = this.shadowRoot.getElementById('error-rango-fechas');

    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      const mensaje = 'La fecha “Desde” no puede ser posterior a la fecha “Hasta”.';
      inputDesde.setAttribute('aria-invalid', 'true');
      inputHasta.setAttribute('aria-invalid', 'true');
      error.textContent = mensaje;
      error.hidden = false;
      inputHasta.focus();
      return false;
    }

    this._limpiarErrorRangoFechas();
    return true;
  }

  _limpiarErrorRangoFechas() {
    const error = this.shadowRoot.getElementById('error-rango-fechas');
    error.hidden = true;
    error.textContent = '';
    this.shadowRoot.getElementById('fecha-desde').removeAttribute('aria-invalid');
    this.shadowRoot.getElementById('fecha-hasta').removeAttribute('aria-invalid');
  }

  _mensajeAmigable(error, contexto = 'busqueda') {
    const mensaje = String(error?.message ?? '').toLowerCase();
    if (mensaje.includes('conexión') || mensaje.includes('conexion') || mensaje.includes('offline')) {
      return 'No hay conexión con el servicio. Revisa tu conexión a internet e inténtalo de nuevo.';
    }
    if (mensaje.includes('tardó demasiado') || mensaje.includes('timeout')) {
      return 'La solicitud está tardando más de lo esperado. Inténtalo nuevamente en unos momentos.';
    }
    if (mensaje.includes('406') || mensaje.includes('not acceptable') || mensaje.includes('no aceptable')) {
      return contexto === 'ticket'
        ? 'El servidor no pudo generar el ticket en este momento. Inténtalo nuevamente más tarde.'
        : 'El servidor no pudo procesar la búsqueda. Inténtalo nuevamente más tarde.';
    }
    return contexto === 'ticket'
      ? 'No pudimos generar el ticket. Verifica tu conexión e inténtalo de nuevo.'
      : 'Ocurrió un problema al consultar las citas. Verifica tu conexión e inténtalo de nuevo.';
  }

  _toast(type, message) {
    window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type, message } }));
  }
}
customElements.define('view-citas', ViewCitas);