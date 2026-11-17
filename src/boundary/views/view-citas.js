import { ApiClient } from '../../control/api-client.js';
import { TipoDocumentoService } from '../../control/tipo-documento-service.js';

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
        <h3 style="margin-top:0; color:var(--color-primary);">Asistente de Búsqueda de Citas</h3>
        <div class="form-grid">
          
          <ui-select id="tipo-doc" label="Tipo de Documento"></ui-select>
          
          <ui-input id="num-doc" label="Número de Documento" placeholder="Ingresa tu documento..."></ui-input>
          
          <ui-select id="clinica" label="Clínica">
            <!-- Se llenará con las clínicas -->
          </ui-select>

          <div>
            <label style="display:block; font-size:0.8rem; font-weight:bold; margin-bottom:4px;">Rango de Fechas</label>
            <div class="date-range">
              <div>
                <input type="date" id="fecha-desde" style="width:100%; padding:8px; border:1px solid var(--color-border); border-radius:6px;">
                <span style="font-size:0.7rem; color:var(--color-text-muted);">Desde</span>
              </div>
              <div>
                <input type="date" id="fecha-hasta" style="width:100%; padding:8px; border:1px solid var(--color-border); border-radius:6px;">
                <span style="font-size:0.7rem; color:var(--color-text-muted);">Hasta</span>
              </div>
            </div>
          </div>

        </div>
        
        <div class="form-actions">
          <ui-button id="btn-buscar" style="width: 200px;">BUSCAR CITAS</ui-button>
          <ui-button id="btn-volver-login" style="width: 150px; background: var(--color-text-muted); margin-left: 10px;">Ir a Login</ui-button>
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
  }

  async _cargarTiposDocumento() {
    try {
      const tipos = await this.tipoDocService.listarActivos();
      const select = this.shadowRoot.getElementById('tipo-doc');
      const opciones = tipos.map(t => ({ value: t.idTipoDocumento, label: t.nombre }));
      select.setOptions(opciones);
    } catch (error) {
      console.error("Error al cargar tipos:", error);
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
    }
  }

  async _buscarCitas() {
    const tipoDoc = this.shadowRoot.getElementById('tipo-doc').value;
    const numDoc = this.shadowRoot.getElementById('num-doc').value.trim();
    const idClinica = this.shadowRoot.getElementById('clinica').value;
    const fechaDesde = this.shadowRoot.getElementById('fecha-desde').value;
    const fechaHasta = this.shadowRoot.getElementById('fecha-hasta').value;
    
    const contenedor = this.shadowRoot.getElementById('resultados');
    
    if (!tipoDoc || !numDoc) {
     window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type: 'warning', message: 'Por favor selecciona el tipo de documento y escribe el número.' } }));
      return;
    }

    contenedor.innerHTML = '<p>Buscando...</p>';

    try {
      // 1. Buscamos a la persona por documento
      const personas = await this.api.get(`/personas/buscar?tipoDocumento=${tipoDoc}&valorDocumento=${encodeURIComponent(numDoc)}`);
      const persona = Array.isArray(personas) ? personas[0] : personas;
      
      if (!persona || !persona.idPersona) {
        contenedor.innerHTML = '<p style="color:var(--color-danger)">No se encontraron citas para ese documento.</p>';
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
        contenedor.innerHTML = '<p>No se encontraron citas con esos filtros.</p>';
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
        let procedimientosTexto = 'Sin procedimientos';
        try {
          const detalle = await this.api.get(`/consultas/${c.idConsulta}/detalle-completo`);
          if (detalle && detalle.procedimientos && detalle.procedimientos.length > 0) {
            procedimientosTexto = detalle.procedimientos.map(p => `• ${p.nombreProcedimiento || 'Procedimiento'}`).join('<br>');
          }
        } catch (err) {
          console.warn('No se pudo cargar el detalle:', err);
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
        
        card.querySelector('.btn-ticket').addEventListener('click', async () => {
          try {
            const response = await fetch(`http://127.0.0.1:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1/consultas/${c.idConsulta}/ticket`);
            if (!response.ok) throw new Error("Error al generar el PDF");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ticket_${c.idConsulta.substring(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
          } catch (error) {
           window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type: 'danger', message: 'No se pudo descargar el ticket: ' + error.message } }));
          }
        });

        contenedor.appendChild(card);
      }

    } catch (error) {
      contenedor.innerHTML = `<p style="color:var(--color-danger)">Error: ${error.message}</p>`;
    }
  }
}
customElements.define('view-citas', ViewCitas);