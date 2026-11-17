import { ConsultaService } from '../../control/consulta-service.js';
import { SessionStore } from '../../state/session-store.js';
import { ApiClient } from '../../control/api-client.js';

export class ViewDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.consultaService = new ConsultaService();
    this.api = new ApiClient();

    this.consultasOriginales = [];
    this.detalles = new Map();
    this.rolesDisponibles = [];

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; padding:24px; max-width:1200px; margin:0 auto; background:var(--color-bg); min-height:100vh; font-family:var(--font-family); }
        header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
        h1 { color:var(--color-primary); margin:0; font-size:1.5rem; }
        .user-info { display:flex; align-items:center; gap:15px; font-size:.9rem; color:var(--color-text); }
        .btn-logout { background:var(--color-danger); color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold; }
        .context-panel { background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; padding:16px; margin-bottom:24px; box-shadow:var(--shadow-sm); }
        .context-panel h3 { margin:0 0 10px; font-size:1rem; color:var(--color-primary); border-bottom:1px solid var(--color-border); padding-bottom:8px; }
        .ctx-row { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end; }
        .ctx-row > div { flex:1; min-width:180px; display:flex; flex-direction:column; }
        .ctx-row label { font-size:.8rem; font-weight:bold; margin-bottom:4px; }
        .search-panel { background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; padding:16px; margin-bottom:24px; display:flex; gap:16px; flex-wrap:wrap; }
        .search-input, .search-select { flex:1; min-width:180px; padding:10px; border:1px solid var(--color-border); border-radius:6px; }
        .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap:16px; }
        .card { background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; overflow:hidden; box-shadow:var(--shadow-sm); display:flex; flex-direction:column; }
        .card-header { display:flex; gap:12px; padding:16px; border-bottom:1px solid var(--color-border); }
        .avatar { width:50px; height:50px; border-radius:50%; background:#ddd; display:flex; align-items:center; justify-content:center; font-size:1.2rem; font-weight:bold; color:#555; flex-shrink:0; }
        .card-info h4 { margin:0 0 4px; color:var(--color-primary); font-size:1rem; }
        .card-info p { margin:0; font-size:.8rem; color:var(--color-text-muted); }
        .card-body { padding:12px 16px; font-size:.85rem; flex-grow:1; }
        .proc-title { font-weight:bold; color:var(--color-primary); margin:8px 0 4px; font-size:.9rem; }
        .paso-row { display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-left:3px solid var(--color-border); margin:4px 0; font-size:.8rem; }
        .paso-row.done { border-left-color:var(--color-success); }
        .paso-row.pending { border-left-color:#f6c48c; }
        .paso-row .name { font-weight:600; }
        .paso-row .meta { color:var(--color-text-muted); font-size:.72rem; }
        .btn-ver { background:none; border:1px solid var(--color-border); border-radius:4px; padding:2px 8px; cursor:pointer; font-size:.72rem; }
        .card-footer { padding:12px 16px; background:#f9f9f9; border-top:1px solid var(--color-border); }
        .btn-atender { width:100%; padding:10px; background:var(--color-secondary); color:var(--color-primary); border:1px solid var(--color-border); border-radius:6px; cursor:pointer; font-weight:bold; }
        .btn-atender:hover:not(:disabled) { background:var(--color-primary); color:#fff; }
        .btn-atender:disabled { background:#ccc; color:#666; cursor:not-allowed; }
        .empty { text-align:center; padding:30px; color:var(--color-text-muted); }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
        .modal { background:#fff; border-radius:8px; padding:20px; max-width:500px; width:90%; max-height:80vh; overflow:auto; }
        .modal h3 { margin-top:0; color:var(--color-primary); }
        .modal pre { white-space:pre-wrap; word-wrap:break-word; background:#f4f4f4; padding:10px; border-radius:4px; font-size:.85rem; }
      </style>

      <header>
        <h1>Dashboard del Empleado</h1>
        <div class="user-info">
          <span id="nombre-usuario">Cargando...</span>
          <button class="btn-logout" id="btn-logout">Cerrar Sesión</button>
        </div>
      </header>

      <div class="context-panel">
        <h3>Selección de Contexto</h3>
        <div class="ctx-row">
          <div><label>Clínica</label><select id="select-clinica" class="search-select"></select></div>
          <div><label>Rol</label><select id="select-rol" class="search-select"></select></div>
          <div style="flex:0 0 auto;"><button class="btn-atender" id="btn-cargar" style="padding:10px 20px;">Cargar Consultas</button></div>
        </div>
      </div>

      <div class="search-panel">
        <input type="text" id="filtro-texto" class="search-input" placeholder="Buscar Paciente...">
        <select id="filtro-fecha" class="search-select">
          <option value="hoy">Rango de Fechas: Hoy</option>
          <option value="pasado">Rango de Fechas: Pasado</option>
          <option value="futuro">Rango de Fechas: Futuro</option>
          <option value="todos">Todas las fechas</option>
        </select>
      </div>

      <h2>Consultas</h2>
      <div class="grid" id="lista-consultas"><p class="empty">Cargando consultas...</p></div>
    `;
  }

  connectedCallback() {
    this._renderSessionInfo();

    this.shadowRoot.getElementById('btn-logout').addEventListener('click', () => {
      SessionStore.clear();
      window.location.hash = '#/login';
    });
    this.shadowRoot.getElementById('filtro-texto').addEventListener('input', () => this._aplicarFiltros());
    this.shadowRoot.getElementById('filtro-fecha').addEventListener('change', () => this._aplicarFiltros());
    this.shadowRoot.getElementById('select-rol').addEventListener('change', () => this._cargarConsultas());
    this.shadowRoot.getElementById('select-clinica').addEventListener('change', () => {
      this._filtrarRolesPorClinica();
      this._cargarConsultas();
    });
    this.shadowRoot.getElementById('btn-cargar').addEventListener('click', () => this._cargarConsultas());
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
    selectClinica.innerHTML = '';
    clinicasUnicas.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.idClinica;
      opt.textContent = c.nombre;
      selectClinica.appendChild(opt);
    });

    this._filtrarRolesPorClinica();
    this._cargarConsultas();
  }

  _filtrarRolesPorClinica() {
    const idClinica = this.shadowRoot.getElementById('select-clinica').value;
    const selectRol = this.shadowRoot.getElementById('select-rol');
    selectRol.innerHTML = '';
    
    const rolesDeClinica = this.rolesDisponibles.filter(r => 
      r.idClinica && r.idClinica.idClinica === idClinica
    );

    rolesDeClinica.forEach(r => {
      if (r.idRol) {
        const opt = document.createElement('option');
        opt.value = r.idRol.idRol;
        opt.textContent = r.idRol.nombre;
        selectRol.appendChild(opt);
      }
    });
  }

  async _cargarConsultas() {
    const contenedor = this.shadowRoot.getElementById('lista-consultas');
    const idClinica = this.shadowRoot.getElementById('select-clinica').value;
    const idRol = this.shadowRoot.getElementById('select-rol').value;
    if (!idClinica) return;

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
          const d = await this.api.get(`/consultas/${c.idConsulta}/detalle-completo`);
          this.detalles.set(c.idConsulta, d);
        } catch (e) { console.warn('Detalle falló para', c.idConsulta, e); }
      }));

      this.consultasOriginales = consultas;
      this._aplicarFiltros();
    } catch (error) {
      contenedor.innerHTML = `<p class="empty" style="color:var(--color-danger)">Error: ${error.message}</p>`;
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

    const fechaFinObj = this._parseFecha(c.fechaFin);
    let yaAtendida = false;

    if (fechaFinObj !== null) {
      if (detalle && detalle.procedimientos && detalle.procedimientos.length > 0) {
        const ultimoProc = detalle.procedimientos[detalle.procedimientos.length - 1];
        if (ultimoProc.pasos && ultimoProc.pasos.length > 0) {
          const ultimoPaso = ultimoProc.pasos[ultimoProc.pasos.length - 1];
          yaAtendida = (ultimoPaso.estado === 'FINALIZADO');
        } else {
          yaAtendida = true;
        }
      } else {
        yaAtendida = true;
      }
    }

    const card = document.createElement('div');
    card.className = 'card';
    if (yaAtendida) card.style.borderTop = '4px solid var(--color-success)';

    let pasosHtml = '';
    if (detalle?.procedimientos?.length) {
      detalle.procedimientos.forEach(proc => {
        pasosHtml += `<div class="proc-title">📋 ${proc.nombreProcedimiento || 'Procedimiento'}</div>`;
        (proc.pasos || []).forEach(p => {
          const done = p.estado === 'FINALIZADO';
          const cls = done ? 'done' : (p.estado === 'PENDIENTE' || p.estado === 'CREADO' ? 'pending' : '');
          const quien = p.realizadoPor
            ? `${p.realizadoPor.nombres} ${p.realizadoPor.apellidos}`.trim()
            : 'Sin asignar';
          const fechaPasoObj = this._parseFecha(p.fechaInicio);
          const fechaPaso = fechaPasoObj
            ? fechaPasoObj.toLocaleString('es-SV', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
            : '';
          pasosHtml += `
            <div class="paso-row ${cls}">
              <div>
                <div class="name">${done ? '✔' : '○'} ${p.nombrePaso || 'Paso'}</div>
                <div class="meta">${quien}${fechaPaso ? ' · ' + fechaPaso : ''}</div>
              </div>
              ${p.valor ? `<button class="btn-ver" data-paso="${p.idConsultaProcedimientoPaso}">Ver</button>` : ''}
            </div>`;
        });
      });
    } else {
      pasosHtml = '<p class="empty" style="padding:6px 0;">Sin procedimientos registrados.</p>';
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="avatar">${iniciales}</div>
        <div class="card-info">
          <h4>${paciente} ${yaAtendida ? '✅' : ''}</h4>
          <p>${fecha} ${hora}</p>
          <p>${detalle?.clinica?.nombre ?? c.idPersonaRol?.idClinica?.nombre ?? ''}</p>
        </div>
      </div>
      <div class="card-body">${pasosHtml}</div>
      <div class="card-footer">
        <button class="btn-atender" data-id="${c.idConsulta}" ${yaAtendida ? 'disabled' : ''}>
          ${yaAtendida ? 'Consulta Atendida' : 'Atender Consulta'}
        </button>
      </div>
    `;

    card.querySelectorAll('.btn-ver').forEach(btn => {
      btn.addEventListener('click', () => {
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
      btnAtender.addEventListener('click', () => {
        localStorage.setItem('consulta_activa', c.idConsulta);
        window.location.hash = '#/consulta';
      });
    }

    return card;
  }

  _mostrarModalPaso(valorRaw) {
    let contenidoHtml = '<p>Sin notas registradas.</p>';

    if (valorRaw) {
      const partes = valorRaw.split('|');
      let notas = partes[0] ? partes[0].replace('NOTAS:', '').trim() : '';
      let diagnostico = partes[1] ? partes[1].replace('DIAGNÓSTICO:', '').trim() : '';
      let plan = partes[2] ? partes[2].replace('PLAN:', '').trim() : '';

      contenidoHtml = '';
      if (notas) {
        contenidoHtml += `<div style="margin-bottom:10px;"><strong>📝 Notas:</strong><br>${this._escapeHtml(notas)}</div>`;
      }
      if (diagnostico) {
        contenidoHtml += `<div style="margin-bottom:10px;"><strong>🩺 Diagnóstico:</strong><br>${this._escapeHtml(diagnostico)}</div>`;
      }
      if (plan) {
        contenidoHtml += `<div><strong>💊 Plan:</strong><br>${this._escapeHtml(plan)}</div>`;
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Registro del Paso</h3>
        <div style="background:#f4f4f4; padding:12px; border-radius:6px; font-size:0.9rem; line-height:1.5;">
          ${contenidoHtml}
        </div>
        <button style="margin-top:15px; padding:8px 16px; cursor:pointer; width:100%; border:none; background:var(--color-primary); color:white; border-radius:4px;">Cerrar</button>
      </div>
    `;
    overlay.querySelector('button').addEventListener('click', () => overlay.remove());
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

  _escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
}
customElements.define('view-dashboard', ViewDashboard);