import { apiService } from '../api.service.js';

const consultationTemplate = document.createElement('template');
consultationTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 13px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .patient-header, .panel { border: 1px solid #e7ede9; border-radius: 13px; background: #fff; box-shadow: 0 12px 35px rgb(22 57 49 / 4%); }
    .patient-header { display: flex; align-items: center; gap: 14px; padding: 19px 22px; }
    .avatar { display: grid; width: 49px; height: 49px; flex: 0 0 auto; place-items: center; border-radius: 15px; background: #e7f2eb; color: #34745a; font-size: 15px; font-weight: 700; }
    .eyebrow { margin: 0 0 6px; color: #729185; font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
    h1, h2 { margin: 0; color: #173a35; font-family: "Manrope", "Segoe UI", sans-serif; }
    h1 { font-size: 19px; }
    h2 { margin-bottom: 5px; font-size: 15px; }
    .patient-details, .muted { margin: 5px 0 0; color: #82918c; font-size: 10px; line-height: 1.5; }
    .stepper { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 20px 0; padding: 0; list-style: none; }
    .step { position: relative; display: grid; justify-items: center; gap: 7px; color: #98a49e; font-size: 9px; text-align: center; }
    .step:not(:last-child)::after { position: absolute; top: 12px; left: calc(50% + 17px); width: calc(100% - 34px); height: 2px; background: #e2e9e4; content: ""; }
    .step.complete:not(:last-child)::after { background: #83b69a; }
    .step-number { z-index: 1; display: grid; width: 25px; height: 25px; place-items: center; border: 1px solid #dce6df; border-radius: 50%; background: #fff; color: #82918c; font-size: 10px; font-weight: 700; }
    .step.current { color: #17684f; font-weight: 700; }
    .step.current .step-number, .step.complete .step-number { border-color: #15745c; background: #15745c; color: #fff; }
    .content-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(250px, .8fr); align-items: start; gap: 15px; }
    .panel { padding: clamp(17px, 3vw, 22px); }
    .panel-header { margin-bottom: 17px; }
    .field { display: grid; gap: 7px; margin-bottom: 14px; color: #40574e; font-size: 10px; font-weight: 700; }
    textarea, input, select { width: 100%; min-height: 39px; padding: 10px; border: 1px solid #e3eae5; border-radius: 7px; background: #fff; color: #23453a; font: inherit; font-size: 11px; }
    textarea { min-height: 92px; resize: vertical; line-height: 1.5; }
    textarea:focus-visible, input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    .save-notes { min-height: 36px; padding: 0 12px; border: 1px solid #dce8df; border-radius: 7px; background: #f7fbf8; color: #17684f; font: inherit; font-size: 10px; font-weight: 700; }
    .save-notes:hover { background: #edf6ef; }
    .exam-filter { margin-bottom: 13px; }
    .exam-list { display: grid; gap: 9px; padding: 0; list-style: none; }
    .exam-option { display: flex; align-items: flex-start; gap: 9px; color: #5e7067; font-size: 10px; font-weight: 500; line-height: 1.4; }
    .exam-option input { width: 15px; min-height: 15px; height: 15px; margin: 0; accent-color: #15745c; }
    .exam-option small { display: block; margin-top: 2px; color: #9aa59f; font-size: 9px; }
    .assign-exams { width: 100%; min-height: 37px; margin-top: 12px; border: 0; border-radius: 7px; background: #eaf3ed; color: #17684f; font: inherit; font-size: 10px; font-weight: 700; }
    .assigned { margin: 13px 0 0; color: #718078; font-size: 10px; line-height: 1.6; }
    .message { min-height: 16px; margin: 10px 0 0; color: #65796e; font-size: 10px; }
    .message.error { color: #a83f3f; }
    .step-navigation { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px; padding: 13px; border: 1px solid #e7ede9; border-radius: 11px; background: #fff; }
    .nav-group { display: flex; gap: 8px; }
    .step-navigation button { min-height: 37px; padding: 0 13px; border: 1px solid #dce8df; border-radius: 7px; background: #fff; color: #53675e; font: inherit; font-size: 10px; font-weight: 700; }
    .step-navigation button.primary { border-color: #15745c; background: #15745c; color: #fff; }
    .step-navigation button.finish { border-color: #26804d; background: #26804d; color: #fff; }
    .step-navigation button:disabled { cursor: not-allowed; opacity: .52; }
    .step-navigation button:hover:not(:disabled) { filter: brightness(.96); }
    .empty-exams { color: #82918c; font-size: 10px; }
    @media (max-width: 760px) { .content-grid { grid-template-columns: 1fr; } }
    @media (max-width: 520px) { .patient-header { padding: 15px; } .stepper { margin: 17px 0; } .step { font-size: 8px; } .step-navigation { align-items: stretch; flex-direction: column; } .nav-group { display: grid; grid-template-columns: 1fr; } .nav-group button { width: 100%; } }
  </style>
  <section aria-labelledby="consultation-title">
    <header class="patient-header">
      <span class="avatar" id="patient-avatar" aria-hidden="true"></span>
      <div><p class="eyebrow">CONSULTA ACTIVA</p><h1 id="consultation-title"></h1><p class="patient-details" id="patient-details"></p></div>
    </header>
    <ol class="stepper" id="stepper" aria-label="Pasos de la consulta"></ol>
    <div class="content-grid">
      <section class="panel" aria-labelledby="notes-title">
        <header class="panel-header"><p class="eyebrow" id="step-eyebrow"></p><h2 id="notes-title">Registro de Atención</h2><p class="muted" id="active-step-label"></p></header>
        <form id="notes-form">
          <label class="field" for="consultation-notes">Notas de la Consulta
            <textarea id="consultation-notes" name="notas" placeholder="Describe los hallazgos y observaciones relevantes."></textarea>
          </label>
          <label class="field" for="diagnosis-search">Diagnóstico Principal
            <input id="diagnosis-search" type="text" autocomplete="off" placeholder="Escribe el diagnóstico">
          </label>
          <label class="field" for="treatment-plan">Plan de Tratamiento
            <textarea id="treatment-plan" name="plan" placeholder="Indica el tratamiento y los pasos acordados."></textarea>
          </label>
          <button class="save-notes" id="save-notes" type="submit">Guardar Notas</button>
          <p class="message" id="save-message" role="status" aria-live="polite"></p>
        </form>
      </section>
      <aside class="panel" aria-labelledby="exams-title">
        <header class="panel-header"><p class="eyebrow">ÓRDENES CLÍNICAS</p><h2 id="exams-title">Lista de Exámenes Asignables</h2><p class="muted">Selecciona los exámenes requeridos.</p></header>
        <label class="field exam-filter" for="exam-category">Categoría
          <select id="exam-category">
            <option value="todos">Todas las categorías</option>
            <option value="laboratorio">Laboratorio</option>
            <option value="imagen">Imagen</option>
          </select>
        </label>
        <ul class="exam-list" id="exam-list"></ul>
        <button class="assign-exams" id="assign-exams" type="button">Asignar Exámenes Seleccionados</button>
        <p class="assigned" id="assigned-exams" aria-live="polite">Aún no hay exámenes asignados.</p>
      </aside>
    </div>
    <nav class="step-navigation" aria-label="Navegación de pasos">
      <button id="previous-step" type="button">‹ Anterior</button>
      <div class="nav-group">
        <button class="primary" id="next-step" type="button">Guardar y Avanzar al Siguiente Paso &gt;</button>
        <button class="finish" id="finish-consultation" type="button">Finalizar Consulta</button>
      </div>
    </nav>
  </section>
`;

const steps = ['Triaje', 'Consulta Médica', 'Tratamiento', 'Cierre'];

class GalenoConsultaActiva extends HTMLElement {
  #consulta = null;
  #state = new Proxy({
    activeStep: 0,
    notes: '',
    diagnosis: '',
    plan: '',
    examCategory: 'todos',
    selectedExams: [],
    assignedExams: [],
    exams: [],
    saving: false,
    completed: false,
    message: '',
  }, {
    set: (target, property, value) => {
      Reflect.set(target, property, value);
      this.#renderState();
      return true;
    },
  });

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(consultationTemplate.content.cloneNode(true));
  }

  set consulta(value) {
    this.#consulta = value;
    this.#hydrateAttendance();
    this.#renderPatient();
  }

  get consulta() {
    return this.#consulta;
  }

  connectedCallback() {
    this.#bindEvents();
    this.#renderPatient();
    this.#renderState();
    void this.#loadExams();
    if (this.#consulta) return;
    const consultationId = this.getAttribute('route-consultaId');
    if (consultationId) void this.#loadConsultation(consultationId);
    else this.#state.message = 'Abre una consulta desde la agenda para iniciar la atención.';
  }

  async #loadConsultation(id) {
    this.#state.message = 'Cargando consulta…';
    try {
      this.#consulta = await apiService.obtenerConsulta(id);
      this.#hydrateAttendance();
      this.#renderPatient();
      this.#state.message = '';
    } catch (error) {
      this.#state.message = `No se pudo cargar la consulta: ${error.message}`;
    }
  }

  async #loadExams() {
    try {
      this.#state.exams = await apiService.obtenerExamenes();
      const selectedIds = this.#consulta?.backendConsulta?.examenIds || [];
      this.#state.assignedExams = this.#state.exams.filter(({ id }) => selectedIds.includes(id));
    } catch (error) {
      this.#state.message = error.message || 'No se pudieron cargar los exámenes del backend.';
    }
  }

  #hydrateAttendance() {
    let history = [];
    try {
      const observations = this.#consulta?.backendConsulta?.observaciones;
      const parsed = observations ? JSON.parse(observations) : null;
      if (Array.isArray(parsed?.historial)) history = parsed.historial;
    } catch {
      this.#state.message = 'El historial guardado tiene un formato que no se puede leer.';
      return;
    }

    history = history.filter((entry) => entry && typeof entry === 'object');
    const savedSteps = new Set(history.map((entry) => entry.paso).filter(Boolean));
    const nextStep = steps.findIndex((step) => !savedSteps.has(step));
    this.#state.activeStep = nextStep < 0 ? steps.length - 1 : nextStep;
    this.#state.completed = Boolean(this.#consulta?.backendConsulta?.fechaFin);
    this.#loadStepRecord(history, this.#state.activeStep);
    const assignedIds = this.#consulta?.backendConsulta?.examenIds || [];
    this.#state.assignedExams = assignedIds.map((id) => ({ id }));
  }

  #loadStepRecord(history, stepIndex) {
    const record = history.find((entry) => entry?.paso === steps[stepIndex]);
    this.#state.notes = record?.notas || '';
    this.#state.diagnosis = record?.diagnostico || '';
    this.#state.plan = record?.plan || '';
    if (this.shadowRoot) {
      this.shadowRoot.querySelector('#consultation-notes').value = this.#state.notes;
      this.shadowRoot.querySelector('#diagnosis-search').value = this.#state.diagnosis;
      this.shadowRoot.querySelector('#treatment-plan').value = this.#state.plan;
    }
  }

  #bindEvents() {
    const root = this.shadowRoot;
    root.querySelector('#consultation-notes').addEventListener('input', ({ currentTarget }) => {
      this.#state.notes = currentTarget.value;
    });
    root.querySelector('#diagnosis-search').addEventListener('input', ({ currentTarget }) => {
      this.#state.diagnosis = currentTarget.value;
    });
    root.querySelector('#treatment-plan').addEventListener('input', ({ currentTarget }) => {
      this.#state.plan = currentTarget.value;
    });
    root.querySelector('#notes-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.#saveNotes();
    });
    root.querySelector('#exam-category').addEventListener('change', ({ currentTarget }) => {
      this.#state.examCategory = currentTarget.value;
      this.#renderExams();
    });
    root.querySelector('#exam-list').addEventListener('change', (event) => {
      const checkbox = event.target.closest('input[type="checkbox"][data-exam-id]');
      if (!checkbox) return;
      const selected = new Set(this.#state.selectedExams);
      if (checkbox.checked) selected.add(checkbox.dataset.examId);
      else selected.delete(checkbox.dataset.examId);
      this.#state.selectedExams = [...selected];
    });
    root.querySelector('#assign-exams').addEventListener('click', () => this.#assignSelectedExams());
    root.querySelector('#previous-step').addEventListener('click', () => this.#previousStep());
    root.querySelector('#next-step').addEventListener('click', () => this.#advanceStep());
    root.querySelector('#finish-consultation').addEventListener('click', () => this.#finish());
  }

  #renderPatient() {
    if (!this.shadowRoot) return;
    if (!this.#consulta) {
      this.shadowRoot.querySelector('#consultation-title').textContent = 'Consulta no disponible';
      this.shadowRoot.querySelector('#patient-details').textContent = '';
      return;
    }
    const patient = this.#consulta.paciente;
    this.shadowRoot.querySelector('#patient-avatar').textContent =
      `${patient.nombres?.[0] ?? ''}${patient.apellidos?.[0] ?? ''}`.toUpperCase();
    this.shadowRoot.querySelector('#consultation-title').textContent =
      `${patient.nombres} ${patient.apellidos}`.trim();
    this.shadowRoot.querySelector('#patient-details').textContent =
      `ID ${patient.id} · ${this.#consulta.tipo || 'Consulta médica'}`;
  }

  #renderState() {
    if (!this.shadowRoot) return;
    const root = this.shadowRoot;
    const stepper = root.querySelector('#stepper');
    stepper.replaceChildren(...steps.map((label, index) => {
      const item = document.createElement('li');
      item.className = `step${index < this.#state.activeStep ? ' complete' : ''}${index === this.#state.activeStep ? ' current' : ''}`;
      if (index === this.#state.activeStep) item.setAttribute('aria-current', 'step');
      const number = document.createElement('span');
      number.className = 'step-number';
      number.textContent = index < this.#state.activeStep ? '✓' : String(index + 1);
      const name = document.createElement('span');
      name.textContent = label;
      item.append(number, name);
      return item;
    }));
    root.querySelector('#step-eyebrow').textContent = `PASO ${this.#state.activeStep + 1} DE ${steps.length}`;
    root.querySelector('#active-step-label').textContent = `Etapa actual: ${steps[this.#state.activeStep]}`;
    const unavailable = !this.#consulta;
    root.querySelector('#previous-step').disabled = unavailable || this.#state.activeStep === 0 || this.#state.saving || this.#state.completed;
    root.querySelector('#next-step').disabled = unavailable || this.#state.saving || this.#state.completed || this.#state.activeStep === steps.length - 1;
    root.querySelector('#finish-consultation').disabled = unavailable || this.#state.saving || this.#state.completed;
    root.querySelector('#save-notes').disabled = unavailable || this.#state.saving || this.#state.completed;
    root.querySelector('#assign-exams').disabled = unavailable || this.#state.selectedExams.length === 0 || this.#state.completed;
    root.querySelector('#save-message').textContent = this.#state.saving ? 'Guardando…' : this.#state.message;
    root.querySelector('#save-message').classList.toggle('error', this.#state.message.startsWith('No se pudo'));
    root.querySelector('#assigned-exams').textContent = this.#state.assignedExams.length
      ? `Asignados: ${this.#state.assignedExams.map(({ name }) => name).join(', ')}`
      : 'Aún no hay exámenes asignados.';
    this.#renderExams();
  }

  #renderExams() {
    const list = this.shadowRoot.querySelector('#exam-list');
    if (!list) return;
    const exams = this.#state.exams.filter((exam) => (
      this.#state.examCategory === 'todos' || exam.category === this.#state.examCategory
    ));
    list.replaceChildren();
    if (exams.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-exams';
      empty.textContent = 'No hay exámenes para esta categoría.';
      list.append(empty);
      return;
    }

    exams.forEach((exam) => {
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'exam-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.examId = exam.id;
      checkbox.checked = this.#state.selectedExams.includes(exam.id);
      checkbox.disabled = this.#state.completed;
      const text = document.createElement('span');
      text.append(document.createTextNode(exam.name));
      const description = document.createElement('small');
      description.textContent = exam.description;
      text.append(description);
      label.append(checkbox, text);
      item.append(label);
      list.append(item);
    });
  }

  async #saveNotes({ finalizar = false } = {}) {
    if (!this.#consulta || this.#state.saving || this.#state.completed) return false;
    this.#state.saving = true;
    this.#state.message = '';
    try {
      const registro = {
        consultaId: this.#consulta.id,
        paso: steps[this.#state.activeStep],
        notas: this.#state.notes,
        diagnostico: this.shadowRoot.querySelector('#diagnosis-search').value.trim(),
        plan: this.#state.plan,
        examenes: this.#state.assignedExams,
        consulta: this.#consulta,
        finalizar,
      };
      const saved = await apiService.guardarAtencionConsulta(registro);
      if (saved && !saved.queued && this.#consulta) {
        this.#consulta.backendConsulta = saved;
      }
      this.#state.message = saved?.queued
        ? saved.message
        : 'Notas guardadas correctamente.';
      this.dispatchEvent(new CustomEvent('consulta-notas-guardadas', {
        bubbles: true,
        composed: true,
        detail: registro,
      }));
      return true;
    } catch (error) {
      this.#state.message = `No se pudo guardar: ${error.message}`;
      return false;
    } finally {
      this.#state.saving = false;
    }
  }

  async #assignSelectedExams() {
    const assigned = new Map(this.#state.assignedExams.map((exam) => [exam.id, exam]));
    this.#state.exams
      .filter(({ id }) => this.#state.selectedExams.includes(id))
      .forEach((exam) => assigned.set(exam.id, exam));
    this.#state.assignedExams = [...assigned.values()];
    this.#state.selectedExams = [];
    this.dispatchEvent(new CustomEvent('consulta-examenes-asignados', {
      bubbles: true,
      composed: true,
      detail: { examenes: this.#state.assignedExams },
    }));
    await this.#saveNotes();
  }

  async #advanceStep() {
    if (this.#state.activeStep >= steps.length - 1 || !(await this.#saveNotes())) return;
    this.#state.activeStep += 1;
    this.#loadStepRecord(this.#readHistory(), this.#state.activeStep);
    this.#state.message = `Avanzaste a ${steps[this.#state.activeStep]}.`;
    this.dispatchEvent(new CustomEvent('consulta-paso-cambiado', {
      bubbles: true,
      composed: true,
      detail: { activeStep: this.#state.activeStep, paso: steps[this.#state.activeStep] },
    }));
  }

  async #previousStep() {
    if (this.#state.activeStep === 0 || this.#state.completed || !(await this.#saveNotes())) return;
    this.#state.activeStep -= 1;
    this.#loadStepRecord(this.#readHistory(), this.#state.activeStep);
    this.#state.message = `Regresaste a ${steps[this.#state.activeStep]}.`;
    this.dispatchEvent(new CustomEvent('consulta-paso-cambiado', {
      bubbles: true,
      composed: true,
      detail: { activeStep: this.#state.activeStep, paso: steps[this.#state.activeStep] },
    }));
  }

  #readHistory() {
    try {
      const parsed = JSON.parse(this.#consulta?.backendConsulta?.observaciones || '{}');
      return Array.isArray(parsed.historial) ? parsed.historial : [];
    } catch {
      return [];
    }
  }

  async #finish() {
    if (this.#state.completed || !(await this.#saveNotes({ finalizar: true }))) return;
    this.#state.activeStep = steps.length - 1;
    this.#state.completed = true;
    this.#state.message = 'Consulta finalizada.';
    this.dispatchEvent(new CustomEvent('consulta-finalizada', {
      bubbles: true,
      composed: true,
      detail: { consultaId: this.#consulta.id },
    }));
  }
}

if (!customElements.get('galeno-consulta-activa')) {
  customElements.define('galeno-consulta-activa', GalenoConsultaActiva);
}
