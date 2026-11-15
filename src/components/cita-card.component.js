import { apiService } from '../api.service.js';

const citaCardTemplate = document.createElement('template');
citaCardTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 13px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    article { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; padding: 19px; border: 1px solid #e7ede9; border-radius: 12px; background: #fff; }
    .eyebrow { margin: 0 0 8px; color: #7a8e84; font-size: 9px; font-weight: 700; letter-spacing: 1px; }
    h3 { margin: 0 0 7px; color: #21463a; font: 700 15px "Manrope", "Segoe UI", sans-serif; }
    .time { margin: 0; color: #60736a; font-size: 12px; }
    .clinic { margin: 13px 0 0; color: #567365; font-size: 11px; font-weight: 600; }
    .procedures { margin: 7px 0 0; color: #82918c; font-size: 11px; line-height: 1.55; }
    button { align-self: start; min-height: 34px; padding: 0 11px; border: 1px solid #dce8df; border-radius: 7px; background: #f7fbf8; color: #17684f; font: inherit; font-size: 10px; font-weight: 700; white-space: nowrap; }
    button:hover:not(:disabled) { border-color: #b6d2c0; background: #eef7f0; }
    button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    button:disabled { cursor: progress; opacity: .65; }
    .ticket-status { grid-column: 1 / -1; margin: 0; color: #60736a; font-size: 10px; }
    .ticket-status:empty { display: none; }
    @media (max-width: 520px) { article { grid-template-columns: 1fr; } button { justify-self: start; } }
  </style>
  <article aria-labelledby="appointment-date">
    <div>
      <p class="eyebrow">CITA DISPONIBLE</p>
      <h3 id="appointment-date"></h3>
      <p class="time" id="appointment-time"></p>
      <p class="clinic" id="appointment-clinic"></p>
      <p class="procedures" id="appointment-procedures"></p>
    </div>
    <button id="download-ticket" type="button">Descargar ticket PDF</button>
    <p class="ticket-status" id="ticket-status" role="status" aria-live="polite"></p>
  </article>
`;

class CitaCard extends HTMLElement {
  #cita = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(citaCardTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#download-ticket').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('ticket-download', {
        bubbles: true,
        composed: true,
        detail: { cita: this.#cita },
      }));
      void this.#downloadTicket();
    });
    this.#render();
  }

  set cita(value) {
    this.#cita = value;
    this.#render();
  }

  get cita() {
    return this.#cita;
  }

  #render() {
    if (!this.shadowRoot || !this.#cita) return;
    const date = new Date(`${this.#cita.fecha}T00:00:00`);
    this.shadowRoot.querySelector('#appointment-date').textContent = Number.isNaN(date.getTime())
      ? this.#cita.fecha || 'Fecha pendiente'
      : new Intl.DateTimeFormat('es-SV', { dateStyle: 'full' }).format(date);
    this.shadowRoot.querySelector('#appointment-time').textContent = `Hora: ${this.#cita.hora || 'Pendiente'}`;
    this.shadowRoot.querySelector('#appointment-clinic').textContent = `Clínica: ${this.#cita.clinica || 'Pendiente'}`;
    const procedures = Array.isArray(this.#cita.procedimientos) ? this.#cita.procedimientos : [];
    this.shadowRoot.querySelector('#appointment-procedures').textContent = procedures.length
      ? `Procedimientos: ${procedures.join(', ')}`
      : 'Procedimientos: por confirmar';
    this.shadowRoot.querySelector('#download-ticket').dataset.citaId = this.#cita.id || '';
  }

  async #downloadTicket() {
    const button = this.shadowRoot.querySelector('#download-ticket');
    const status = this.shadowRoot.querySelector('#ticket-status');
    if (!this.#cita || button.disabled) return;
    button.disabled = true;
    status.textContent = 'Descargando ticket…';
    try {
      const blob = await apiService.descargarTicketCita(this.#cita.id);
      const objectUrl = window.URL.createObjectURL(blob);
      const safeId = String(this.#cita.id || 'cita').replace(/[^a-zA-Z0-9_-]/g, '-');
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = `galenosv-cita-${safeId}.pdf`;
      downloadLink.hidden = true;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
      status.textContent = 'El ticket PDF se descargó correctamente.';
    } catch (error) {
      status.textContent = error.message || 'No se pudo descargar el ticket. Inténtalo nuevamente.';
      this.dispatchEvent(new CustomEvent('ticket-error', {
        bubbles: true,
        composed: true,
        detail: { message: status.textContent, cause: error },
      }));
    } finally {
      button.disabled = false;
    }
  }
}

if (!customElements.get('cita-card')) {
  customElements.define('cita-card', CitaCard);
}
