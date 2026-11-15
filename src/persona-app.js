import { personaApi } from './api.js';

const dateOnly = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};
const localToday = () => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};
const displayDate = (value, includeTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-SV', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(date);
};
const initials = (persona) => `${persona.nombres?.trim()?.[0] ?? ''}${persona.apellidos?.trim()?.[0] ?? ''}` || 'P';
const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="./styles.css">
  <section class="personas-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">DIRECTORIO CLÍNICO</p>
        <h1>Personas</h1>
        <p class="page-subtitle">Administra la información de tus pacientes.</p>
      </div>
      <div class="spa-actions">
        <button class="button button-quiet button-small" id="notifications-button" type="button">Activar avisos</button>
        <button class="button button-primary" id="new-person-button" type="button">＋ Nueva persona</button>
      </div>
    </div>
    <section class="stat-grid" aria-label="Resumen">
      <article class="stat-card"><span class="stat-icon stat-icon-green" aria-hidden="true">♙</span>
        <div><p class="stat-label">Personas registradas</p><p class="stat-value" id="total-count">—</p></div>
      </article>
      <article class="stat-card"><span class="stat-icon stat-icon-blue" aria-hidden="true">⌕</span>
        <div><p class="stat-label">En esta página</p><p class="stat-value" id="page-count">—</p></div>
      </article>
    </section>
    <section class="card directory-card" aria-labelledby="directory-title">
      <div class="card-heading">
        <div><h2 id="directory-title">Directorio de personas</h2><p class="muted">Consulta y actualiza los registros de la clínica.</p></div>
        <label class="search-box"><span class="sr-only">Buscar en esta página</span>
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input id="search-input" type="search" placeholder="Buscar por nombre..." autocomplete="off">
        </label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">PERSONA</th><th scope="col">FECHA DE NACIMIENTO</th><th scope="col">REGISTRADA</th><th scope="col" class="actions-heading">ACCIONES</th></tr></thead>
          <tbody id="people-body"><tr><td class="table-state" colspan="4">Cargando personas…</td></tr></tbody>
        </table>
      </div>
      <div class="table-footer">
        <label class="page-size-label" for="page-size">Filas:
          <select id="page-size" aria-label="Filas por página"><option value="10">10</option><option value="25">25</option><option value="50" selected>50</option></select>
        </label>
        <div class="pagination"><span id="page-summary">—</span>
          <button class="button button-quiet button-square" id="previous-page" type="button" aria-label="Página anterior">‹</button>
          <button class="button button-quiet button-square" id="next-page" type="button" aria-label="Página siguiente">›</button>
        </div>
      </div>
    </section>
    <section class="card form-card" id="person-form-panel" hidden aria-labelledby="form-title">
      <div class="card-heading form-heading">
        <div><p class="eyebrow">FICHA DE PERSONA</p><h2 id="form-title">Nueva persona</h2><p class="muted">Completa los datos para guardar el registro.</p></div>
        <button class="button button-quiet button-square" id="close-form-button" type="button" aria-label="Cerrar formulario">×</button>
      </div>
      <form id="person-form" novalidate>
        <input id="person-id" type="hidden">
        <div class="form-grid">
          <label class="field"><span>Nombres <b>*</b></span><input id="first-name" name="nombres" type="text" maxlength="255" autocomplete="given-name" required><small>Escribe el nombre o nombres.</small></label>
          <label class="field"><span>Apellidos <b>*</b></span><input id="last-name" name="apellidos" type="text" maxlength="255" autocomplete="family-name" required><small>Escribe los apellidos.</small></label>
          <label class="field"><span>Fecha de nacimiento <b>*</b></span><input id="birth-date" name="fechaNacimiento" type="date" required><small>La fecha no puede ser posterior a hoy.</small></label>
        </div>
        <p class="form-message" id="form-message" role="alert" hidden></p>
        <div class="form-actions"><button class="button button-quiet" id="cancel-form-button" type="button">Cancelar</button><button class="button button-primary" id="save-person-button" type="submit">Guardar persona</button></div>
      </form>
    </section>
    <p class="status-message" id="status-message" role="status" aria-live="polite"></p>
  </section>
`;

class PersonaApp extends HTMLElement {
  #worker;
  #notificationRegistration;
  #searchRequest = 0;
  #state = new Proxy({
    personas: [],
    visible: [],
    selected: null,
    total: 0,
    first: 0,
    max: 50,
    query: '',
    loading: false,
    saving: false,
    editing: false,
  }, {
    set: (target, property, value) => {
      Reflect.set(target, property, value);
      this.#render();
      return true;
    },
  });

  constructor() {
    super();
    if (!template) throw new Error('No se encontró la plantilla de la pantalla de personas.');
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.#worker = new Worker(new URL('./personas-worker.js', import.meta.url), { type: 'module' });
    this.#worker.addEventListener('message', ({ data }) => {
      if (data.requestId !== this.#searchRequest) return;
      this.#state.visible = data.results;
    });
  }

  connectedCallback() {
    this.#bindEvents();
    this.shadowRoot.querySelector('#birth-date').max = localToday();
    navigator.serviceWorker?.getRegistration().then((registration) => {
      this.#notificationRegistration = registration;
    });
    this.#load();
  }

  disconnectedCallback() {
    this.#worker.terminate();
  }

  #bindEvents() {
    const root = this.shadowRoot;
    root.querySelector('#new-person-button').addEventListener('click', () => this.#openForm());
    root.querySelector('#close-form-button').addEventListener('click', () => this.#closeForm());
    root.querySelector('#cancel-form-button').addEventListener('click', () => this.#closeForm());
    root.querySelector('#person-form').addEventListener('submit', (event) => this.#save(event));
    root.querySelector('#search-input').addEventListener('input', ({ currentTarget }) => {
      this.#state.query = currentTarget.value;
      this.#filterPage();
    });
    root.querySelector('#page-size').addEventListener('change', ({ currentTarget }) => {
      this.#state.max = Number(currentTarget.value);
      this.#state.first = 0;
      this.#load();
    });
    root.querySelector('#previous-page').addEventListener('click', () => {
      this.#state.first = Math.max(0, this.#state.first - this.#state.max);
      this.#load();
    });
    root.querySelector('#next-page').addEventListener('click', () => {
      if (this.#state.first + this.#state.max >= this.#state.total) return;
      this.#state.first += this.#state.max;
      this.#load();
    });
    root.querySelector('#people-body').addEventListener('click', (event) => this.#handleRowAction(event));
    root.querySelector('#notifications-button').addEventListener('click', () => this.#enableNotifications());
  }

  async #load(clearStatus = true) {
    this.#state.loading = true;
    if (clearStatus) this.#setStatus('');
    try {
      const { personas, total } = await personaApi.list({
        first: this.#state.first,
        max: this.#state.max,
      });
      this.#state.personas = personas;
      this.#state.total = total;
      this.#filterPage();
    } catch (error) {
      this.#state.personas = [];
      this.#state.visible = [];
      this.#setStatus(error.message || 'No se pudo cargar el directorio.');
    } finally {
      this.#state.loading = false;
    }
  }

  #filterPage() {
    this.#searchRequest += 1;
    this.#worker.postMessage({
      requestId: this.#searchRequest,
      personas: this.#state.personas,
      query: this.#state.query,
    });
  }

  #render() {
    if (!this.shadowRoot) return;
    const root = this.shadowRoot;
    root.querySelector('#total-count').textContent = this.#state.total.toLocaleString('es-SV');
    root.querySelector('#page-count').textContent = this.#state.loading
      ? '…'
      : this.#state.visible.length.toLocaleString('es-SV');
    root.querySelector('#previous-page').disabled = this.#state.loading || this.#state.first === 0;
    root.querySelector('#next-page').disabled = this.#state.loading
      || this.#state.first + this.#state.max >= this.#state.total;
    root.querySelector('#new-person-button').disabled = this.#state.saving;
    root.querySelector('#save-person-button').disabled = this.#state.saving;
    root.querySelector('#save-person-button').textContent = this.#state.saving
      ? 'Guardando…'
      : this.#state.editing ? 'Guardar cambios' : 'Guardar persona';
    const from = this.#state.total === 0 ? 0 : this.#state.first + 1;
    const to = Math.min(this.#state.first + this.#state.personas.length, this.#state.total);
    root.querySelector('#page-summary').textContent = `${from}–${to} de ${this.#state.total}`;
    root.querySelector('#form-title').textContent = this.#state.editing ? 'Editar persona' : 'Nueva persona';
    root.querySelector('#person-form-panel').hidden = !this.#state.selected;
    this.#renderRows();
  }

  #renderRows() {
    const body = this.shadowRoot.querySelector('#people-body');
    body.replaceChildren();
    if (this.#state.loading) {
      this.#appendTableState(body, 'Cargando personas…');
      return;
    }
    if (this.#state.visible.length === 0) {
      this.#appendTableState(body, this.#state.query ? 'No hay coincidencias en esta página.' : 'Todavía no hay personas registradas.');
      return;
    }

    const rows = this.#state.visible.map((persona) => {
      const row = document.createElement('tr');
      const personCell = document.createElement('td');
      const identity = document.createElement('div');
      identity.className = 'person-cell';
      const avatar = document.createElement('span');
      avatar.className = 'person-avatar';
      avatar.textContent = initials(persona);
      const nameBlock = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'person-name';
      name.textContent = `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim() || 'Sin nombre';
      const id = document.createElement('span');
      id.className = 'person-id';
      id.textContent = persona.idPersona ?? '';
      nameBlock.append(name, id);
      identity.append(avatar, nameBlock);
      personCell.append(identity);

      const birth = document.createElement('td');
      const birthPill = document.createElement('span');
      birthPill.className = 'date-pill';
      birthPill.textContent = displayDate(persona.fechaNacimiento);
      birth.append(birthPill);

      const created = document.createElement('td');
      created.textContent = displayDate(persona.fechaCreacion, true);

      const actions = document.createElement('td');
      const buttons = document.createElement('div');
      buttons.className = 'row-actions';
      const edit = this.#makeRowButton('✎', 'Editar persona', 'edit', persona.idPersona);
      const remove = this.#makeRowButton('⌫', 'Eliminar persona', 'delete', persona.idPersona);
      remove.classList.add('delete');
      buttons.append(edit, remove);
      actions.append(buttons);
      row.append(personCell, birth, created, actions);
      return row;
    });
    body.append(...rows);
  }

  #makeRowButton(label, title, action, id) {
    const button = document.createElement('button');
    button.className = 'row-action';
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.dataset.action = action;
    button.dataset.id = id ?? '';
    button.textContent = label;
    return button;
  }

  #appendTableState(body, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'table-state';
    cell.colSpan = 4;
    cell.textContent = message;
    row.append(cell);
    body.append(row);
  }

  #openForm(persona = null) {
    this.#state.selected = persona ?? {};
    this.#state.editing = Boolean(persona);
    this.#clearFormMessage();
    const form = this.shadowRoot.querySelector('#person-form');
    form.reset();
    this.shadowRoot.querySelector('#person-id').value = persona?.idPersona ?? '';
    this.shadowRoot.querySelector('#first-name').value = persona?.nombres ?? '';
    this.shadowRoot.querySelector('#last-name').value = persona?.apellidos ?? '';
    const birthDate = this.shadowRoot.querySelector('#birth-date');
    birthDate.value = dateOnly(persona?.fechaNacimiento);
    birthDate.disabled = Boolean(persona);
    this.shadowRoot.querySelector('#person-form-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.shadowRoot.querySelector('#first-name').focus();
  }

  #closeForm() {
    this.#state.selected = null;
    this.#state.editing = false;
    this.#clearFormMessage();
  }

  async #save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const date = this.shadowRoot.querySelector('#birth-date').value;
    if (date > localToday()) {
      this.#showFormMessage('La fecha de nacimiento no puede ser posterior a hoy.');
      return;
    }

    const persona = {
      nombres: this.shadowRoot.querySelector('#first-name').value.trim(),
      apellidos: this.shadowRoot.querySelector('#last-name').value.trim(),
      fechaNacimiento: `${date}T12:00:00.000Z`,
      fechaCreacion: this.#state.editing
        ? this.#state.selected.fechaCreacion
        : new Date().toISOString(),
    };
    if (!persona.nombres || !persona.apellidos) {
      this.#showFormMessage('Nombres y apellidos son obligatorios.');
      return;
    }

    this.#state.saving = true;
    try {
      if (this.#state.editing) {
        await personaApi.update(this.#state.selected.idPersona, persona);
        this.#setStatus('Los cambios de la persona se guardaron correctamente.');
        this.#notify('Persona actualizada', `${persona.nombres} ${persona.apellidos}`);
      } else {
        await personaApi.create(persona);
        this.#state.first = 0;
        this.#setStatus('La persona se registró correctamente.');
        this.#notify('Persona registrada', `${persona.nombres} ${persona.apellidos}`);
      }
      this.#closeForm();
      await this.#load(false);
    } catch (error) {
      this.#showFormMessage(error.message || 'No se pudo guardar la persona.');
      this.#notify('No se pudo guardar', error.message || 'Revisa la conexión con el servicio.');
    } finally {
      this.#state.saving = false;
    }
  }

  async #handleRowAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const persona = this.#state.personas.find((entry) => entry.idPersona === button.dataset.id);
    if (!persona) return;
    if (button.dataset.action === 'edit') {
      this.#openForm(persona);
      return;
    }

    const fullName = `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim();
    if (!window.confirm(`¿Eliminar a ${fullName}? Esta acción no se puede deshacer.`)) return;
    try {
      await personaApi.remove(persona.idPersona);
      this.#setStatus('La persona se eliminó correctamente.');
      this.#notify('Persona eliminada', fullName);
      if (this.#state.first > 0 && this.#state.personas.length === 1) {
        this.#state.first = Math.max(0, this.#state.first - this.#state.max);
      }
      await this.#load(false);
    } catch (error) {
      this.#setStatus(error.message || 'No se pudo eliminar la persona.');
      this.#notify('No se pudo eliminar', error.message || 'Revisa los registros asociados.');
    }
  }

  async #enableNotifications() {
    if (!('Notification' in window)) {
      this.#setStatus('Este navegador no permite notificaciones.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      this.#setStatus('Avisos activados para esta aplicación.');
      this.#notify('Avisos activados', 'Te informaremos cuando se completen acciones.');
    } else {
      this.#setStatus('No se concedió permiso para mostrar avisos.');
    }
  }

  async #notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, icon: new URL('../assets/galeno.svg', import.meta.url).href };
    try {
      if (this.#notificationRegistration) {
        await this.#notificationRegistration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } catch (error) {
      console.error('No se pudo mostrar la notificación.', error);
    }
  }

  #showFormMessage(message) {
    const element = this.shadowRoot.querySelector('#form-message');
    element.textContent = message;
    element.hidden = false;
  }

  #clearFormMessage() {
    const element = this.shadowRoot.querySelector('#form-message');
    if (!element) return;
    element.textContent = '';
    element.hidden = true;
  }

  #setStatus(message) {
    const status = this.shadowRoot?.querySelector('#status-message');
    if (status) status.textContent = message;
  }
}

if (!customElements.get('persona-app')) customElements.define('persona-app', PersonaApp);
