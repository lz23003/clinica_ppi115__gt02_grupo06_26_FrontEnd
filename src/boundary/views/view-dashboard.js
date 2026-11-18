import { ConsultaService } from '../../control/consulta-service.js';
import { SessionStore } from '../../state/session-store.js';
import { RegistroPaso } from '../../entity/registro-paso.js';
import { OfflineError } from '../../control/offline-error.js';
import { connectivity } from '../../state/connectivity.js';
import { consultaYaAtendida } from '../../control/flujo-pasos.js';
import { escapeHtml } from '../../control/escape-html.js';

import '../components/ui-button.js';
import '../components/ui-select.js';

export class ViewDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.consultaService = new ConsultaService();

    this.consultasOriginales = [];
    this.detalles = new Map();
    this.rolesDisponibles = [];

    this.shadowRoot.innerHTML = `
      <header>
        <h1>Dashboard del Empleado</h1>
        <div class="user-info">
          <span id="nombre-usuario">Cargando...</span>
          <ui-button class="btn-logout" id="btn-logout">Cerrar Sesión</ui-button>
        </div>
      </header>

      <div class="context-panel">
        <h3>Selección de Contexto</h3>
        <div class="ctx-row">
          <ui-select class="search-select" id="select-clinica" label="Clínica"></ui-select>
          <ui-select class="search-select" id="select-rol" label="Rol"></ui-select>
          <ui-button class="btn-cargar" id="btn-cargar">Cargar Consultas</ui-button>
        </div>
      </div>

      <div class="search-panel">
        <input type="text" id="filtro-texto" class="search-input" placeholder="Buscar Paciente...">
        <ui-select class="search-select" id="filtro-fecha" label="Rango de Fechas"></ui-select>
      </div>

      <h2>Consultas</h2>
      <div class="grid" id="lista-consultas"><p class="empty">Cargando consultas...</p></div>
    `;
    this.shadowRoot.getElementById('filtro-fecha').setOptions([
      { value: 'hoy', label: 'Hoy' },
      { value: 'pasado', label: 'Pasado' },
      { value: 'futuro', label: 'Futuro' },
      { value: 'todos', label: 'Todas las fechas' }
    ], false);
    this._cargarEstilos();
  }

  async _cargarEstilos() {
    try {
      const url = new URL('../../styles/views/view-dashboard.css', import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('No se encontró el CSS del dashboard.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudo cargar el CSS del dashboard:', error);
    }
  }

  connectedCallback() {
    this._renderSessionInfo();

    this.shadowRoot.getElementById('btn-logout').addEventListener('ui-click', () => {
      SessionStore.clear();
      window.location.hash = '#/login';
    });
    this.shadowRoot.getElementById('filtro-texto').addEventListener('input', () => this._aplicarFiltros());
    this.shadowRoot.getElementById('filtro-fecha').addEventListener('ui-change', () => this._aplicarFiltros());
    this.shadowRoot.getElementById('select-rol').addEventListener('ui-change', () => {
      this._guardarContexto();
      this._cargarConsultas();
    });
    this.shadowRoot.getElementById('select-clinica').addEventListener('ui-change', () => {
      this._filtrarRolesPorClinica();
      this._guardarContexto();
      this._cargarConsultas();
    });
    this.shadowRoot.getElementById('btn-cargar').addEventListener('ui-click', () => this._cargarConsultas());
  }

  _renderSessionInfo() {
    const session = SessionStore.getSession();
    if (!session) { window.location.hash = '#/login'; return; }

    const nombreCompleto = `${session.persona?.nombres ?? ''} ${session.persona?.apellidos ?? ''}`.trim();
    this.shadowRoot.getElementById('nombre-usuario').textContent = nombreCompleto;
    this.rolesDisponibles = session.roles || [];

    const clinicasUnicas = new Map();
    this.rolesDisponibles.forEach(r => {
      if (r.idClinica && !clinicasUnicas.has(r.idClinica.idClinica)) {
        clinicasUnicas.set(r.idClinica.idClinica, r.idClinica);
      }
    });
    const selectClinica = this.shadowRoot.getElementById('select-clinica');
    selectClinica.setOptions(
      [...clinicasUnicas.values()].map(clinica => ({
        value: clinica.idClinica,
        label: clinica.nombre
      })),
      false
    );
    const contexto = SessionStore.getContext();
    if (contexto?.idClinica && clinicasUnicas.has(contexto.idClinica)) {
      selectClinica.value = contexto.idClinica;
    }

    this._filtrarRolesPorClinica();
    if (contexto?.idRol) {
      this.shadowRoot.getElementById('select-rol').value = contexto.idRol;
    }
    this._guardarContexto();
    this._cargarConsultas();
  }

  _filtrarRolesPorClinica() {
    const idClinica = this.shadowRoot.getElementById('select-clinica').value;
    const selectRol = this.shadowRoot.getElementById('select-rol');
    
    const rolesDeClinica = this.rolesDisponibles.filter(r => 
      r.idClinica && r.idClinica.idClinica === idClinica
    );
    selectRol.setOptions(
      rolesDeClinica.filter(role => role.idRol).map(role => ({
        value: role.idRol.idRol,
        label: role.idRol.nombre
      })),
      false
    );
    const contexto = SessionStore.getContext();
    if (contexto?.idClinica === idClinica
      && rolesDeClinica.some((role) => role.idRol?.idRol === contexto.idRol)) {
      selectRol.value = contexto.idRol;
    }
  }

  _guardarContexto() {
    const idClinica = this.shadowRoot.getElementById('select-clinica').value;
    const idRol = this.shadowRoot.getElementById('select-rol').value;
    const rol = this.rolesDisponibles.find((item) =>
      item.idClinica?.idClinica === idClinica && item.idRol?.idRol === idRol
    );
    if (idClinica && rol) {
      SessionStore.setContext({ idClinica, idRol, nombreRol: rol.idRol.nombre });
    }
  }

  async _cargarConsultas() {
    const contenedor = this.shadowRoot.getElementById('lista-consultas');
    const idClinica = this.shadowRoot.getElementById('select-clinica').value;
    const idRol = this.shadowRoot.getElementById('select-rol').value;
    if (!idClinica) return;
    this._guardarContexto();

    const session = SessionStore.getSession();
    const idPersona = session?.persona?.idPersona;

    contenedor.innerHTML = '<p class="empty">Cargando consultas...</p>';

    try {
      const consultas = await this.consultaService.obtenerConsultasDeClinica(idClinica, idRol, idPersona);

      if (!consultas || consultas.length === 0) {
        contenedor.innerHTML = '<p class="empty">No hay consultas asignadas a ti para este rol y clínica.</p>';
        this.consultasOriginales = [];
        return;
      }

      this.detalles.clear();
      await Promise.all(consultas.map(async c => {
        try {
          const d = await this.consultaService.obtenerDetalle(c.idConsulta);
          this.detalles.set(c.idConsulta, d);
        } catch (error) {
          console.warn('Detalle falló para', c.idConsulta, error);
          if (error instanceof OfflineError || !connectivity.isOnline()) {
            window.dispatchEvent(new CustomEvent('ui-toast', {
              detail: {
                type: 'warning',
                message: error instanceof OfflineError
                  ? error.message
                  : 'No hay conexión ni datos guardados para mostrar el detalle de algunas consultas.'
              }
            }));
          }
        }
      }));

      this.consultasOriginales = consultas;
      this._aplicarFiltros();
    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) {
        window.dispatchEvent(new CustomEvent('ui-toast', {
          detail: {
            type: 'warning',
            message: error instanceof OfflineError
              ? error.message
              : 'No hay conexión ni datos guardados para mostrar las consultas.'
          }
        }));
      }
      contenedor.innerHTML = `<p class="empty error">Error: ${escapeHtml(error.message)}</p>`;
    }
  }

  _aplicarFiltros() {
    const textoFiltro = this.shadowRoot.getElementById('filtro-texto').value.toLowerCase();
    const filtroFecha = this.shadowRoot.getElementById('filtro-fecha').value;
    const contenedor = this.shadowRoot.getElementById('lista-consultas');

    let filtradas = this.consultasOriginales;

    if (textoFiltro) {
      filtradas = filtradas.filter(c => {
        const n = c.idPersonaRol?.idPersona;
        const nombre = n ? `${n.nombres} ${n.apellidos}`.toLowerCase() : '';
        return nombre.includes(textoFiltro);
      });
    }

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    if (filtroFecha && filtroFecha !== 'todos') {
      filtradas = filtradas.filter(c => {
        if (!c.fechaInicio) return false;
        const f = new Date(c.fechaInicio); f.setHours(0,0,0,0);
        if (filtroFecha === 'hoy') return f.getTime() === hoy.getTime();
        if (filtroFecha === 'pasado') return f.getTime() < hoy.getTime();
        if (filtroFecha === 'futuro') return f.getTime() > hoy.getTime();
        return true;
      });
    }

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="empty">No se encontraron consultas con esos filtros.</p>';
      return;
    }

    contenedor.innerHTML = '';
    filtradas.forEach(c => contenedor.appendChild(this._renderCard(c)));
  }

  _renderCard(c) {
    const detalle = this.detalles.get(c.idConsulta);
    const paciente = detalle?.paciente
      ? `${detalle.paciente.nombres} ${detalle.paciente.apellidos}`
      : (c.idPersonaRol?.idPersona
          ? `${c.idPersonaRol.idPersona.nombres} ${c.idPersonaRol.idPersona.apellidos}`
          : 'Paciente Desconocido');

    const iniciales = paciente.substring(0, 2).toUpperCase();
    const fechaObj = this._parseFecha(c.fechaInicio);
    const fecha = fechaObj ? fechaObj.toLocaleDateString('es-SV', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';
    const hora = fechaObj ? fechaObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';

    const yaAtendida = consultaYaAtendida(detalle);

    const card = document.createElement('div');
    card.className = 'card';
    if (yaAtendida) card.style.borderTop = '4px solid var(--color-success)';

    let pasosHtml = '';
    if (detalle?.procedimientos?.length) {
      detalle.procedimientos.forEach(proc => {
        pasosHtml += `<div class="proc-title">📋 ${escapeHtml(proc.nombreProcedimiento || 'Procedimiento')}</div>`;
        (proc.pasos || []).forEach(p => {
          const done = p.estado === 'FINALIZADO';
          const cls = done ? 'done' : (p.estado === 'PENDIENTE' || p.estado === 'CREADO' ? 'pending' : '');
          const quien = p.realizadoPor
            ? escapeHtml(`${p.realizadoPor.nombres} ${p.realizadoPor.apellidos}`.trim())
            : 'Sin asignar';
          const fechaPasoObj = this._parseFecha(p.fechaInicio);
          const fechaPaso = fechaPasoObj
            ? fechaPasoObj.toLocaleString('es-SV', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
            : '';
          pasosHtml += `
            <div class="paso-row ${cls}">
              <div>
                <div class="name">${done ? '✔' : '○'} ${escapeHtml(p.nombrePaso || 'Paso')}</div>
                <div class="meta">${quien}${fechaPaso ? ` · ${escapeHtml(fechaPaso)}` : ''}</div>
              </div>
              ${p.valor ? `<ui-button class="btn-ver" data-paso="${escapeHtml(p.idConsultaProcedimientoPaso)}">Ver</ui-button>` : ''}
            </div>`;
        });
      });
    } else {
      pasosHtml = '<p class="empty empty-compact">Sin procedimientos registrados.</p>';
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="avatar">${escapeHtml(iniciales)}</div>
        <div class="card-info">
          <h4>${escapeHtml(paciente)} ${yaAtendida ? '✅' : ''}</h4>
          <p>${escapeHtml(fecha)} ${escapeHtml(hora)}</p>
          <p>${escapeHtml(detalle?.clinica?.nombre ?? c.idPersonaRol?.idClinica?.nombre ?? '')}</p>
        </div>
      </div>
      <div class="card-body">${pasosHtml}</div>
      <div class="card-footer">
        <ui-button class="btn-atender" data-id="${escapeHtml(c.idConsulta)}" ${yaAtendida ? 'disabled' : ''}>
          ${yaAtendida ? 'Consulta Atendida' : 'Atender Consulta'}
        </ui-button>
      </div>
    `;

    card.querySelectorAll('.btn-ver').forEach(btn => {
      btn.addEventListener('ui-click', () => {
        const idPaso = btn.getAttribute('data-paso');
        let valorRaw = '';
        if (detalle) {
          for (const proc of detalle.procedimientos) {
            const p = proc.pasos.find(x => x.idConsultaProcedimientoPaso === idPaso);
            if (p?.valor) { valorRaw = p.valor; break; }
          }
        }
        this._mostrarModalPaso(valorRaw);
      });
    });

    const btnAtender = card.querySelector('.btn-atender');
    if (!yaAtendida) {
      btnAtender.addEventListener('ui-click', () => {
        this._guardarContexto();
        SessionStore.setConsultaActiva(c.idConsulta);
        window.location.hash = '#/consulta';
      });
    }

    return card;
  }

  _mostrarModalPaso(valorRaw) {
    let contenidoHtml = '<p>Sin notas registradas.</p>';

    if (valorRaw) {
      const { notas, diagnostico, plan } = RegistroPaso.parsear(valorRaw);

      contenidoHtml = '';
      if (notas) {
        contenidoHtml += `<div class="registro-field"><strong>📝 Notas:</strong><br>${escapeHtml(notas)}</div>`;
      }
      if (diagnostico) {
        contenidoHtml += `<div class="registro-field"><strong>🩺 Diagnóstico:</strong><br>${escapeHtml(diagnostico)}</div>`;
      }
      if (plan) {
        contenidoHtml += `<div class="registro-field"><strong>💊 Plan:</strong><br>${escapeHtml(plan)}</div>`;
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Registro del Paso</h3>
        <div class="registro-content">
          ${contenidoHtml}
        </div>
        <ui-button class="modal-close">Cerrar</ui-button>
      </div>
    `;
    overlay.querySelector('.modal-close').addEventListener('ui-click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    this.shadowRoot.appendChild(overlay);
  }

  _parseFecha(valor) {
    if (!valor || valor === 'null' || valor === 'undefined') return null;
    let s = String(valor).replace('[UTC]', '').trim();
    s = s.replace(/(\.\d{3})\d+/, '$1');
    if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

}
customElements.define('view-dashboard', ViewDashboard);