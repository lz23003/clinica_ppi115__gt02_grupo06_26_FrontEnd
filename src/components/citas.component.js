import './cita-card.component.js';
import { apiService } from '../api.service.js';

const citasTemplate = document.createElement('template');
citasTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 14px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .layout { display: grid; grid-template-columns: minmax(245px, .75fr) minmax(0, 1.6fr); align-items: start; gap: 21px; }
    .panel { padding: clamp(19px, 3vw, 25px); border: 1px solid #e7ede9; border-radius: 13px; background: #fff; box-shadow: 0 12px 35px rgb(22 57 49 / 4%); }
    .eyebrow { margin: 0 0 8px; color: #729185; font-size: 10px; font-weight: 700; letter-spacing: 1.3px; }
    h1, h2 { margin: 0; color: #173a35; font-family: "Manrope", "Segoe UI", sans-serif; }
    h1 { margin-bottom: 7px; font-size: clamp(22px, 3vw, 28px); letter-spacing: -.7px; }
    h2 { font-size: 16px; }
    .intro { margin: 0 0 22px; color: #82918c; font-size: 11px; line-height: 1.6; }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 6px; color: #40574e; font-size: 10px; font-weight: 700; }
    select, input { width: 100%; min-height: 39px; padding: 0 10px; border: 1px solid #e3eae5; border-radius: 7px; background: #fff; color: #23453a; font: inherit; font-size: 11px; }
    select:focus-visible, input:focus-visible, button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    .date-range { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    button { min-height: 40px; padding: 0 13px; border: 0; border-radius: 8px; background: #15745c; color: #fff; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: .3px; }
    button:hover:not(:disabled) { background: #105542; }
    button:disabled { cursor: wait; opacity: .65; }
    .form-error { margin: 0; color: #a83f3f; font-size: 10px; }
    .results-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .result-count { margin: 0; color: #899791; font-size: 10px; }
    .cards { display: grid; gap: 11px; }
    .empty-state { padding: 38px 18px; border: 1px dashed #dfe8e2; border-radius: 10px; color: #82918c; font-size: 11px; line-height: 1.6; text-align: center; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .panel { padding: 18px; } }
    @media (max-width: 420px) { .date-range { grid-template-columns: 1fr; } }
  </style>
  <div class="layout">
    <section class="panel" aria-labelledby="search-title">
      <p class="eyebrow">ASISTENTE</p>
      <h1 id="search-title">Busca tu cita</h1>
      <p class="intro">Ingresa los datos del documento y el rango de fechas para consultar tus citas.</p>
      <form id="search-form">
        <label for="document-type">Tipo de documento
          <select id="document-type" name="tipoDocumento" required>
            <option value="DUI">DUI</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="LICENCIA">Licencia de Conducir</option>
          </select>
        </label>
        <label for="document-number">Número de documento
          <input id="document-number" name="numeroDocumento" type="text" maxlength="30" autocomplete="off" required>
        </label>
        <label for="clinic">Clínica
          <select id="clinic" name="clinica" required>
            <option value="">Selecciona una clínica</option>
            </select>
        </label>
        <div class="date-range">
          <label for="date-from">Desde
            <input id="date-from" name="desde" type="date" required>
          </label>
          <label for="date-to">Hasta
            <input id="date-to" name="hasta" type="date" required>
          </label>
        </div>
        <p class="form-error" id="search-message" role="alert" hidden></p>
        <button id="search-button" type="submit">BUSCAR CITAS</button>
      </form>
    </section>
    <section class="panel" aria-labelledby="results-title">
      <div class="results-heading">
        <div><p class="eyebrow">RESULTADOS</p><h2 id="results-title">Tus citas</h2></div>
        <p class="result-count" id="result-count" aria-live="polite">Aún no has buscado</p>
      </div>
      <div class="cards" id="appointment-results" aria-live="polite" aria-busy="false">
        <p class="empty-state" id="empty-state">Completa el asistente de búsqueda para consultar tus citas.</p>
      </div>
    </section>
  </div>
`;

const dateInputValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

class GalenoCitas extends HTMLElement {
  #state = new Proxy({
    citas: [],
    loading: false,
    searched: false,
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
    this.attachShadow({ mode: 'open' }).append(citasTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#search-form').addEventListener('submit', (event) => this.#search(event));
    const today = dateInputValue(new Date());
    this.shadowRoot.querySelector('#date-from').min = today;
    this.shadowRoot.querySelector('#date-to').min = today;
    this.#loadClinicas();
    this.shadowRoot.querySelector('#date-from').addEventListener('change', ({ currentTarget }) => {
      this.shadowRoot.querySelector('#date-to').min = currentTarget.value || today;
    });
    this.shadowRoot.querySelector('#appointment-results').addEventListener('ticket-download', (event) => {
      this.dispatchEvent(new CustomEvent('ticket-download', {
        bubbles: true,
        composed: true,
        detail: event.detail,
      }));
    });
    this.#renderState();
  }

  async #loadClinicas() {
    try {
      const clinics = await apiService.obtenerClinicas();
      const select = this.shadowRoot.querySelector('#clinic');
      select.replaceChildren(new Option('Selecciona una clínica', ''));
      clinics.forEach((clinic) => select.add(new Option(clinic.nombre, clinic.idClinica)));
    } catch (error) {
      this.#state.error = error.message || 'No se pudieron cargar las clínicas.';
    }
  }

  async #search(event) {
    event.preventDefault();
    const form = this.shadowRoot.querySelector('#search-form');
    if (!form.reportValidity()) return;

    const filters = {
      tipoDocumento: this.shadowRoot.querySelector('#document-type').value,
      numeroDocumento: this.shadowRoot.querySelector('#document-number').value.trim(),
      clinica: this.shadowRoot.querySelector('#clinic').value,
      desde: this.shadowRoot.querySelector('#date-from').value,
      hasta: this.shadowRoot.querySelector('#date-to').value,
    };
    if (filters.desde > filters.hasta) {
      this.#state.error = 'La fecha inicial debe ser anterior o igual a la fecha final.';
      return;
    }

    this.#state.error = '';
    this.#state.loading = true;
    this.#state.searched = true;
    this.#state.citas = [];
    this.dispatchEvent(new CustomEvent('citas-search', {
      bubbles: true,
      composed: true,
      detail: filters,
    }));

    try {
      const citas = await apiService.obtenerCitas(filters);
      this.#state.citas = citas;
      this.dispatchEvent(new CustomEvent('citas-results', {
        bubbles: true,
        composed: true,
        detail: { citas },
      }));
    } catch (error) {
      this.#state.error = error.message || 'No se pudieron consultar las citas.';
    } finally {
      this.#state.loading = false;
    }
  }

  #renderState() {
    if (!this.shadowRoot) return;
    const root = this.shadowRoot;
    const resultList = root.querySelector('#appointment-results');
    const searchMessage = root.querySelector('#search-message');
    const resultCount = root.querySelector('#result-count');

    searchMessage.textContent = this.#state.error;
    searchMessage.hidden = !this.#state.error;
    resultList.setAttribute('aria-busy', String(this.#state.loading));
    root.querySelector('#search-button').disabled = this.#state.loading;
    root.querySelector('#search-button').textContent = this.#state.loading ? 'BUSCANDO…' : 'BUSCAR CITAS';
    resultCount.textContent = this.#state.loading
      ? 'Consultando…'
      : this.#state.searched
        ? `${this.#state.citas.length} ${this.#state.citas.length === 1 ? 'cita encontrada' : 'citas encontradas'}`
        : 'Aún no has buscado';

    resultList.replaceChildren();
    if (this.#state.loading) {
      resultList.append(this.#makeEmptyState('Buscando citas con los datos ingresados…'));
      return;
    }
    if (this.#state.citas.length === 0) {
      const message = this.#state.searched
        ? 'No encontramos citas para los criterios indicados.'
        : 'Completa el asistente de búsqueda para consultar tus citas.';
      resultList.append(this.#makeEmptyState(message));
      return;
    }

    const cards = this.#state.citas.map((cita) => {
      const card = document.createElement('cita-card');
      card.cita = cita;
      return card;
    });
    resultList.append(...cards);
  }

  #makeEmptyState(message) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = message;
    return emptyState;
  }
}

if (!customElements.get('galeno-citas')) {
  customElements.define('galeno-citas', GalenoCitas);
}
