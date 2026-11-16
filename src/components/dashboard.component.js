import { apiService } from '../api.service.js';

const dashboardCardTemplate = document.createElement('template');
dashboardCardTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 12px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    article { padding: 16px; border: 1px solid #e6ede8; border-radius: 12px; background: #fff; }
    .patient { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 11px; }
    .avatar { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 13px; background: #e7f2eb; color: #34745a; font-size: 13px; font-weight: 700; }
    h3 { margin: 0 0 4px; color: #25443a; font: 700 13px "Manrope", "Segoe UI", sans-serif; }
    .identity { margin: 0; color: #83918b; font-size: 10px; }
    .appointment { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 15px 0; padding: 12px 0; border-top: 1px solid #edf1ee; border-bottom: 1px solid #edf1ee; }
    .appointment span { display: block; margin-bottom: 4px; color: #98a39e; font-size: 9px; }
    .appointment strong { color: #53675e; font-size: 10px; font-weight: 600; }
    .history-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #697d73; font-size: 10px; font-weight: 700; }
    ol { display: grid; gap: 7px; margin: 0; padding: 0 0 0 13px; list-style: none; }
    li { position: relative; padding-left: 12px; border-left: 1px solid #dfe9e2; color: #718078; font-size: 10px; line-height: 1.4; }
    li::before { position: absolute; top: 3px; left: -4px; width: 7px; height: 7px; border-radius: 50%; background: #67a884; content: ""; }
    li.pending::before { background: #c8d3cc; }
    .step-name { color: #53675e; font-weight: 700; }
    .step-person { display: block; margin-top: 2px; color: #9aa59f; font-size: 9px; }
    .step-notes { display: block; margin-top: 3px; color: #718078; white-space: pre-wrap; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 13px; }
    button { min-height: 33px; padding: 0 11px; border: 1px solid #dce8df; border-radius: 7px; background: #fff; color: #17684f; font: inherit; font-size: 10px; font-weight: 700; }
    button:hover { background: #f3f8f4; }
    button.primary { border-color: #15745c; background: #15745c; color: #fff; }
    button.primary:hover { background: #105542; }
    button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    @media (max-width: 430px) { .appointment { gap: 5px; } .appointment strong { font-size: 9px; } .patient { grid-template-columns: 38px minmax(0, 1fr); } .avatar { width: 38px; height: 38px; } }
  </style>
  <article>
    <header class="patient">
      <span class="avatar" id="patient-avatar" aria-hidden="true"></span>
      <div><h3 id="patient-name"></h3><p class="identity" id="patient-identity"></p></div>
      <span class="patient-badge" id="visit-status"></span>
    </header>
    <section class="appointment" aria-label="Detalle de la consulta">
      <div><span>FECHA</span><strong id="visit-date"></strong></div>
      <div><span>HORA</span><strong id="visit-time"></strong></div>
      <div><span>TIPO</span><strong id="visit-type"></strong></div>
    </section>
    <section aria-labelledby="history-heading">
      <div class="history-heading" id="history-heading">Pasos previos</div>
      <ol id="step-history" hidden></ol>
    </section>
    <div class="actions">
      <button id="view-record" type="button" aria-expanded="false">Ver Registro</button>
      <button class="primary" id="attend-consultation" type="button">Atender Consulta</button>
    </div>
  </article>
`;

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Fecha pendiente'
    : new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium' }).format(date);
};

const localDateString = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatDateTime = (value) => {
  const dateValue = typeof value === 'string' ? value.replace(/\[[^\]]+\]$/, '') : value;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-SV', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/El_Salvador',
    }).format(date);
};

const getDateParts = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.replace(/\[[^\]]+\]$/, '');
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnly) {
    return { year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]) };
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
};

const getAge = (birthDate) => {
  const birth = getDateParts(birthDate);
  if (!birth) return 'Edad no disponible';
  const todayParts = getDateParts(localDateString());
  let age = todayParts.year - birth.year;
  const beforeBirthday = todayParts.month < birth.month
    || (todayParts.month === birth.month && todayParts.day < birth.day);
  if (beforeBirthday) age -= 1;
  return `${age} años`;
};

class DashboardConsultaCard extends HTMLElement {
  #consulta = null;
  #expanded = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(dashboardCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#view-record').addEventListener('click', () => {
      this.#expanded = !this.#expanded;
      this.#render();
      this.dispatchEvent(new CustomEvent('ver-registro', {
        bubbles: true,
        composed: true,
        detail: { consulta: this.#consulta, expanded: this.#expanded },
      }));
    });
    this.shadowRoot.querySelector('#attend-consultation').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('atender-consulta', {
        bubbles: true,
        composed: true,
        detail: { consulta: this.#consulta, consultaId: this.#consulta?.id },
      }));
    });
    this.#render();
  }

  set consulta(value) {
    this.#consulta = value;
    this.#render();
  }

  get consulta() {
    return this.#consulta;
  }

  #render() {
    if (!this.shadowRoot || !this.#consulta) return;
    const patient = this.#consulta.paciente;
    const fullName = `${patient.nombres} ${patient.apellidos}`.trim();
    this.shadowRoot.querySelector('#patient-avatar').textContent =
      `${patient.nombres?.[0] ?? ''}${patient.apellidos?.[0] ?? ''}`.toUpperCase();
    this.shadowRoot.querySelector('#patient-name').textContent = fullName;
    this.shadowRoot.querySelector('#patient-identity').textContent =
      `${getAge(patient.fechaNacimiento)} · ID ${patient.id}`;
    this.shadowRoot.querySelector('#visit-date').textContent = formatDate(this.#consulta.fecha);
    this.shadowRoot.querySelector('#visit-time').textContent = this.#consulta.hora;
    this.shadowRoot.querySelector('#visit-type').textContent = this.#consulta.tipo;
    const history = this.shadowRoot.querySelector('#step-history');
    const previousSteps = this.#consulta.pasosPrevios || [];
    this.shadowRoot.querySelector('#history-heading').textContent = 'Pasos previos';
    history.hidden = !this.#expanded;
    history.replaceChildren();

    previousSteps.forEach((step) => {
      const item = document.createElement('li');
      if (!step.completado) item.className = 'pending';
      const name = document.createElement('span');
      name.className = 'step-name';
      name.textContent = step.nombre;
      const completedBy = document.createElement('span');
      completedBy.className = 'step-person';
      completedBy.textContent = step.completado
        ? `Realizado por ${step.realizadoPor || 'Autor no registrado'}${step.guardadoEn ? ` · ${formatDateTime(step.guardadoEn)}` : ''}`
        : 'Pendiente';
      item.append(name, completedBy);
      if (step.notas) {
        const notes = document.createElement('span');
        notes.className = 'step-notes';
        notes.textContent = step.notas;
        item.append(notes);
      }
      history.append(item);
    });

    const recordButton = this.shadowRoot.querySelector('#view-record');
    recordButton.setAttribute('aria-expanded', String(this.#expanded));
    recordButton.textContent = this.#expanded ? 'Ocultar Registro' : 'Ver Registro';
  }
}

if (!customElements.get('dashboard-consulta-card')) {
  customElements.define('dashboard-consulta-card', DashboardConsultaCard);
}

const dashboardTemplate = document.createElement('template');
dashboardTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 14px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .eyebrow { margin: 0 0 8px; color: #729185; font-size: 10px; font-weight: 700; letter-spacing: 1.3px; }
    h1, h2 { margin: 0; color: #173a35; font-family: "Manrope", "Segoe UI", sans-serif; }
    h1 { margin-bottom: 5px; font-size: clamp(24px, 3vw, 30px); letter-spacing: -.8px; }
    h2 { font-size: 16px; }
    .dashboard-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    button.logout { flex: 0 0 auto; border: 1px solid #dce8df; background: #fff; color: #53675e; }
    .intro, .muted { margin: 0; color: #82918c; font-size: 11px; line-height: 1.6; }
    .context-panel, .consultations-panel { padding: clamp(18px, 3vw, 24px); border: 1px solid #e7ede9; border-radius: 13px; background: #fff; box-shadow: 0 12px 35px rgb(22 57 49 / 4%); }
    .context-panel { margin-top: 20px; }
    .context-grid { display: grid; grid-template-columns: 1fr 1fr auto; align-items: end; gap: 12px; margin-top: 16px; }
    label { display: grid; gap: 6px; color: #40574e; font-size: 10px; font-weight: 700; }
    select, input { width: 100%; min-height: 39px; padding: 0 10px; border: 1px solid #e3eae5; border-radius: 7px; background: #fff; color: #23453a; font: inherit; font-size: 11px; }
    select:focus-visible, input:focus-visible, button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    button { min-height: 39px; padding: 0 14px; border: 0; border-radius: 8px; background: #15745c; color: #fff; font: inherit; font-size: 10px; font-weight: 700; }
    button:hover:not(:disabled) { background: #105542; }
    button:disabled { cursor: wait; opacity: .65; }
    .consultations-panel { margin-top: 17px; }
    .list-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .filters { display: grid; grid-template-columns: minmax(180px, 1fr) repeat(2, minmax(140px, .7fr)); gap: 10px; margin-bottom: 14px; }
    .cards { display: grid; gap: 11px; }
    .empty-state { padding: 34px 15px; border: 1px dashed #dfe8e2; border-radius: 10px; color: #82918c; font-size: 11px; text-align: center; }
    .error { margin: 10px 0 0; color: #a83f3f; font-size: 11px; }
    @media (max-width: 700px) { .context-grid { grid-template-columns: 1fr 1fr; } .context-grid button { grid-column: 1 / -1; } }
    @media (max-width: 480px) { .context-grid, .filters { grid-template-columns: 1fr; } .list-heading { align-items: flex-start; flex-direction: column; } }
  </style>
  <section aria-labelledby="dashboard-title">
    <header class="dashboard-header">
      <div><p class="eyebrow">PORTAL DE EMPLEADOS</p>
        <h1 id="dashboard-title">Agenda clínica</h1>
      </div>
      <button class="logout" id="logout" type="button">Cerrar sesión</button>
    </header>
    <p class="intro">Selecciona tu contexto de trabajo para consultar y atender las citas.</p>
    <section class="context-panel" aria-labelledby="context-title">
      <p class="eyebrow">SELECCIÓN DE CONTEXTO</p>
      <h2 id="context-title">Clínica y rol</h2>
      <div class="context-grid">
        <label for="clinic-select">Seleccionar Clínica
          <select id="clinic-select">
            <option value="">Selecciona una clínica</option>
            </select>
        </label>
        <label for="role-select">Seleccionar Rol
          <select id="role-select">
            <option value="">Selecciona un rol</option>
            </select>
        </label>
        <button id="load-consultations" type="button">Cargar Consultas</button>
      </div>
      <p class="error" id="context-message" role="alert" hidden></p>
    </section>
    <section class="consultations-panel" aria-labelledby="consultations-title">
      <div class="list-heading">
        <div><p class="eyebrow">ATENCIÓN DEL DÍA</p><h2 id="consultations-title">Consultas del Día &amp; Búsqueda</h2></div>
        <p class="muted" id="consultation-count" aria-live="polite">Selecciona clínica y rol para cargar.</p>
      </div>
      <div class="filters">
        <label for="patient-search">Buscar paciente
          <input id="patient-search" type="search" placeholder="Nombre del paciente" autocomplete="off">
        </label>
        <label for="date-from">Desde
          <input id="date-from" type="date">
        </label>
        <label for="date-to">Hasta
          <input id="date-to" type="date">
        </label>
      </div>
      <div class="cards" id="consultation-list" aria-live="polite" aria-busy="false">
        <p class="empty-state">Selecciona el contexto y carga las consultas.</p>
      </div>
    </section>
  </section>
`;

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es');

class GalenoDashboard extends HTMLElement {
  #assignments = [];
  #state = new Proxy({
    consultas: [],
    loading: false,
    loaded: false,
    clinic: '',
    role: '',
    query: '',
    dateFrom: localDateString(),
    dateTo: localDateString(),
    error: '',
  }, {
    set: (target, property, value) => {
      Reflect.set(target, property, value);
      this.#renderState();
      return true;
    },
  });

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(dashboardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    const root = this.shadowRoot;
    this.#loadContextOptions();
    root.querySelector('#date-from').value = this.#state.dateFrom;
    root.querySelector('#date-to').value = this.#state.dateTo;
    root.querySelector('#date-from').max = this.#state.dateTo;
    root.querySelector('#date-to').min = this.#state.dateFrom;
    root.querySelector('#logout').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('cerrar-sesion', { bubbles: true, composed: true }));
    });
    root.querySelector('#clinic-select').addEventListener('change', ({ currentTarget }) => {
      this.#state.clinic = currentTarget.value;
      this.#state.role = '';
      root.querySelector('#role-select').disabled = !currentTarget.value;
      this.#replaceRoleOptions(currentTarget.value);
    });
    root.querySelector('#role-select').addEventListener('change', ({ currentTarget }) => {
      this.#state.role = currentTarget.value;
    });
    root.querySelector('#load-consultations').addEventListener('click', () => this.#loadConsultations());
    root.querySelector('#patient-search').addEventListener('input', ({ currentTarget }) => {
      this.#state.query = currentTarget.value;
    });
    root.querySelector('#date-from').addEventListener('change', ({ currentTarget }) => {
      this.#state.dateFrom = currentTarget.value;
      const dateTo = root.querySelector('#date-to');
      dateTo.min = currentTarget.value;
      if (currentTarget.value && dateTo.value && currentTarget.value > dateTo.value) {
        dateTo.value = currentTarget.value;
        this.#state.dateTo = dateTo.value;
      }
      if (this.#state.loaded) void this.#loadConsultations();
    });
    root.querySelector('#date-to').addEventListener('change', ({ currentTarget }) => {
      this.#state.dateTo = currentTarget.value;
      const dateFrom = root.querySelector('#date-from');
      dateFrom.max = currentTarget.value;
      if (currentTarget.value && dateFrom.value && currentTarget.value < dateFrom.value) {
        dateFrom.value = currentTarget.value;
        this.#state.dateFrom = dateFrom.value;
      }
      if (this.#state.loaded) void this.#loadConsultations();
    });
    root.querySelector('#consultation-list').addEventListener('atender-consulta', (event) => {
      this.dispatchEvent(new CustomEvent('atender-consulta', {
        bubbles: true,
        composed: true,
        detail: event.detail,
      }));
    });
    this.#renderState();
  }

  #loadContextOptions() {
    this.#assignments = apiService.getEmployeeAssignments()
      .filter((assignment) => assignment?.idClinica
        && assignment?.idRol
        && normalizeText(assignment.rol) !== 'paciente');
    if (this.#assignments.length === 0) {
      this.#state.error = 'No se encontraron asignaciones activas. Cierra sesión e inicia nuevamente.';
      return;
    }

    const clinics = new Map(this.#assignments.map((assignment) => [
      assignment.idClinica,
      { idClinica: assignment.idClinica, nombre: assignment.clinica },
    ]));
    this.#replaceOptions('#clinic-select', [...clinics.values()], 'idClinica', 'nombre', 'Selecciona una clínica');
    this.shadowRoot.querySelector('#role-select').disabled = true;
  }

  #replaceRoleOptions(clinicId) {
    const roles = new Map(this.#assignments
      .filter((assignment) => String(assignment.idClinica) === clinicId)
      .map((assignment) => [
        assignment.idRol,
        { idRol: assignment.idRol, nombre: assignment.rol },
      ]));
    this.#replaceOptions('#role-select', [...roles.values()], 'idRol', 'nombre', 'Selecciona un rol');
  }

  #replaceOptions(selector, records, valueKey, labelKey, placeholder) {
    const select = this.shadowRoot.querySelector(selector);
    select.replaceChildren(new Option(placeholder, ''));
    records.forEach((record) => {
      select.add(new Option(record[labelKey] || record.nombreRol || 'Sin nombre', record[valueKey]));
    });
  }

  async #loadConsultations() {
    if (!this.#state.clinic || !this.#state.role) {
      this.#state.error = 'Selecciona una clínica y un rol antes de cargar las consultas.';
      return;
    }
    if (this.#state.dateFrom && this.#state.dateTo && this.#state.dateFrom > this.#state.dateTo) {
      this.#state.error = 'La fecha inicial debe ser anterior o igual a la fecha final.';
      return;
    }
    const hasAssignment = this.#assignments.some((assignment) => (
      String(assignment.idClinica) === this.#state.clinic
      && String(assignment.idRol) === this.#state.role
    ));
    if (!hasAssignment) {
      this.#state.error = 'El rol seleccionado no está asignado a esta clínica.';
      return;
    }

    this.#state.error = '';
    this.#state.loading = true;
    this.dispatchEvent(new CustomEvent('consultas-cargar', {
      bubbles: true,
      composed: true,
      detail: { clinica: this.#state.clinic, rol: this.#state.role },
    }));

    try {
      this.#state.consultas = await apiService.obtenerConsultasDashboard(
        this.#state.clinic,
        this.#state.role,
        { desde: this.#state.dateFrom, hasta: this.#state.dateTo },
      );
      this.#state.loaded = true;
      this.dispatchEvent(new CustomEvent('consultas-loaded', {
        bubbles: true,
        composed: true,
        detail: { consultas: this.#state.consultas },
      }));
    } catch (error) {
      this.#state.error = error.message || 'No se pudieron cargar las consultas.';
    } finally {
      this.#state.loading = false;
    }
  }

  #getVisibleConsultas() {
    return this.#state.consultas.filter((consulta) => {
      const name = `${consulta.paciente.nombres} ${consulta.paciente.apellidos}`;
      const matchesName = normalizeText(name).includes(normalizeText(this.#state.query).trim());
      const matchesDate = (!this.#state.dateFrom || consulta.fecha >= this.#state.dateFrom)
        && (!this.#state.dateTo || consulta.fecha <= this.#state.dateTo);
      return matchesName && matchesDate;
    });
  }

  #renderState() {
    if (!this.shadowRoot) return;
    const root = this.shadowRoot;
    const list = root.querySelector('#consultation-list');
    const contextMessage = root.querySelector('#context-message');
    contextMessage.textContent = this.#state.error;
    contextMessage.hidden = !this.#state.error;
    root.querySelector('#load-consultations').disabled = this.#state.loading;
    root.querySelector('#load-consultations').textContent = this.#state.loading ? 'Cargando…' : 'Cargar Consultas';
    list.setAttribute('aria-busy', String(this.#state.loading));

    const visible = this.#getVisibleConsultas();
    root.querySelector('#consultation-count').textContent = this.#state.loading
      ? 'Consultando…'
      : this.#state.loaded
        ? `${visible.length} de ${this.#state.consultas.length} consultas`
        : 'Selecciona clínica y rol para cargar.';

    list.replaceChildren();
    if (this.#state.loading) {
      list.append(this.#makeEmptyState('Cargando consultas…'));
      return;
    }
    if (visible.length === 0) {
      const message = this.#state.loaded
        ? 'No hay consultas que coincidan con los filtros seleccionados.'
        : 'Selecciona el contexto y carga las consultas.';
      list.append(this.#makeEmptyState(message));
      return;
    }

    const cards = visible.map((consulta) => {
      const card = document.createElement('dashboard-consulta-card');
      card.consulta = consulta;
      return card;
    });
    list.append(...cards);
  }

  #makeEmptyState(message) {
    const element = document.createElement('p');
    element.className = 'empty-state';
    element.textContent = message;
    return element;
  }
}

if (!customElements.get('galeno-dashboard')) {
  customElements.define('galeno-dashboard', GalenoDashboard);
}
