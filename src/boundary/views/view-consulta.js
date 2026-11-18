import { ConsultaService } from '../../control/consulta-service.js';
import { ExamenService } from '../../control/examen-service.js';
import { PasoService } from '../../control/paso-service.js';
import { OfflineError } from '../../control/offline-error.js';
import { connectivity } from '../../state/connectivity.js';
import { SessionStore } from '../../state/session-store.js';
import { RegistroPaso } from '../../entity/registro-paso.js';
import { camposVisibles, esDoctor, puedeOperarPaso } from '../../control/permisos-consulta.js';
import { consultaYaAtendida, esPrimerPaso, esUltimoPaso, pasoInicial } from '../../control/flujo-pasos.js';
import { escapeHtml } from '../../control/escape-html.js';
import { filtrarExamenes } from '../../control/filtros-examen.js';

import '../components/ui-button.js';
import '../components/ui-checkbox.js';
import '../components/ui-confirm.js';
import '../components/ui-input.js';
import '../components/ui-select.js';
import '../components/ui-textarea.js';

export class ViewConsulta extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.consultaService = new ConsultaService();
    this.examenService = new ExamenService();
    this.pasoService = new PasoService();
    this.idConsulta = null;
    this.detalle = null;
    this.procedimientos = [];
    this.indiceProcedimiento = 0;
    this.indicePasoActual = 0;
    this.idPasoActualDB = null;
    this.pasos = [];
    this.pasosEjecutados = [];
    this.examenes = [];
    this.nombreRol = '';
    this.idPersonaLogueada = null;
    this._puedeAvanzar = false;
    this._busy = new Set();
    this._warnedForeignSteps = new Set();
    this._eventsBound = false;

    this._template = `
      <div class="back-row">
        <ui-button id="btn-volver" class="button-back">← Volver al Dashboard</ui-button>
      </div>
      <p id="consulta-status" class="status" role="status" aria-live="polite"></p>
      <section id="flow-error" class="flow-error" role="alert" hidden>
        <p>No se pudo cargar el flujo de atención.</p>
        <ui-button id="btn-reintentar">Reintentar</ui-button>
      </section>
      <section class="panel">
        <h2>Registro de Atención</h2>
        <div class="patient-header">
          <div class="avatar" id="avatar">P</div>
          <div class="patient-info">
            <h3 id="patient-name">Cargando...</h3>
            <p id="patient-id">ID: ...</p>
          </div>
        </div>
        <ui-select id="selector-procedimiento" class="procedure-select" label="Procedimiento" hidden></ui-select>
        <div class="steps-bar" id="steps-bar" aria-label="Pasos del procedimiento"></div>
      </section>

      <section class="grid">
        <div class="panel">
          <div class="form-group">
            <ui-textarea id="notas" label="Notas de la Consulta" rows="3" placeholder="Escriba las notas..."></ui-textarea>
          </div>
          <div class="form-group" id="grupo-diagnostico">
            <ui-input id="diagnostico" label="Diagnóstico Principal (CIE-10)" placeholder="Ej. J00 - Rinofaringitis aguda"></ui-input>
          </div>
          <div class="form-group" id="grupo-plan">
            <ui-textarea id="plan" label="Plan de Tratamiento" rows="3" placeholder="Indique el plan..."></ui-textarea>
          </div>
          <ui-button class="btn-save-notes" id="btn-guardar-notas">Guardar Notas</ui-button>
        </div>

        <div class="panel" id="panel-examenes">
          <h2>Lista de Exámenes Asignables</h2>
          <ui-input id="buscar-examen" label="Filtrar exámenes" placeholder="Escriba para filtrar..."></ui-input>
          <div class="examenes-list" id="lista-examenes" aria-live="polite">
            <p>Cargando exámenes...</p>
          </div>
          <ui-button class="btn-asignar" id="btn-asignar-examenes">Asignar Exámenes Seleccionados</ui-button>
        </div>
      </section>

      <div class="footer-actions">
        <ui-button class="btn btn-secondary" id="btn-anterior">← Anterior</ui-button>
        <ui-button class="btn btn-primary" id="btn-siguiente">Guardar y Avanzar al Siguiente Paso →</ui-button>
      </div>
      <div class="finish-row">
        <ui-button class="btn btn-danger" id="btn-finalizar" hidden>✓ Finalizar Consulta</ui-button>
      </div>
    `;
  }

  connectedCallback() {
    const session = SessionStore.getSession();
    if (!session) {
      window.location.hash = '#/login';
      return;
    }

    this.idConsulta = SessionStore.getConsultaActiva();
    if (!this.idConsulta) {
      window.location.hash = '#/dashboard';
      return;
    }

    this.shadowRoot.innerHTML = this._template;
    this._bindEvents();
    this._unsubscribeConnectivity = connectivity.subscribe(() => this._actualizarControlesOffline());
    this._actualizarControlesOffline();
    this._cargarEstilos();
    this._inicializar();
  }

  disconnectedCallback() {
    this._unsubscribeConnectivity?.();
    this._unsubscribeConnectivity = null;
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    this.shadowRoot.getElementById('btn-volver').addEventListener('ui-click', () => {
      window.location.hash = '#/dashboard';
    });
    this.shadowRoot.getElementById('btn-reintentar').addEventListener('ui-click', () => this._inicializar());
    this.shadowRoot.getElementById('selector-procedimiento').addEventListener('ui-change', (event) => {
      this._runBusy('selector-procedimiento', async () => {
        this.indiceProcedimiento = Number(event.detail.value);
        await this._seleccionarProcedimiento();
      });
    });
    this.shadowRoot.getElementById('buscar-examen').addEventListener('ui-input', () => this._renderExamenes());
    this.shadowRoot.getElementById('btn-asignar-examenes').addEventListener('ui-click', () =>
      this._runBusy('btn-asignar-examenes', () => this._asignarExamenes()));
    this.shadowRoot.getElementById('btn-siguiente').addEventListener('ui-click', () =>
      this._runBusy('btn-siguiente', () => this._avanzarPaso()));
    this.shadowRoot.getElementById('btn-anterior').addEventListener('ui-click', () =>
      this._runBusy('btn-anterior', () => this._retrocederPaso()));
    this.shadowRoot.getElementById('btn-guardar-notas').addEventListener('ui-click', () =>
      this._runBusy('btn-guardar-notas', async () => {
        await this._guardarNotasActual();
        this._toast('success', 'Notas guardadas correctamente.');
      }));
    this.shadowRoot.getElementById('btn-finalizar').addEventListener('ui-click', () =>
      this._runBusy('btn-finalizar', () => this._finalizar()));
  }

  async _cargarEstilos() {
    try {
      const response = await fetch(new URL('../../styles/views/view-consulta.css', import.meta.url));
      if (!response.ok) throw new Error('No se encontró el CSS de la vista de consulta.');
      const style = document.createElement('style');
      style.textContent = await response.text();
      this.shadowRoot.appendChild(style);
    } catch (error) {
      console.warn('No se pudieron cargar los estilos de la consulta:', error);
    }
  }

  async _inicializar() {
    this.shadowRoot.getElementById('flow-error').hidden = true;
    this._setStatus('Cargando consulta y procedimientos...');
    try {
      this.detalle = await this.consultaService.obtenerDetalle(this.idConsulta);
      if (consultaYaAtendida(this.detalle)) {
        this._toast('info', 'Esta consulta ya fue atendida y finalizada.');
        window.location.hash = '#/dashboard';
        return;
      }

      this._resolverContexto();
      const lista = await this.consultaService.obtenerProcedimientos(this.idConsulta, this.detalle);
      this.procedimientos = await Promise.all(lista.map(async (procedimiento) => ({
        ...procedimiento,
        pasos: await this.pasoService.obtenerPasosDeProcedimiento(procedimiento.idProcedimiento),
        ejecutados: await this.pasoService.obtenerEjecutados(procedimiento.idConsultaProcedimiento)
      })));

      if (!this.procedimientos.length) throw new Error('La consulta no tiene procedimientos para atender.');
      this._renderPaciente();
      if (esDoctor(this.nombreRol)) await this._cargarExamenes();
      const selector = this.shadowRoot.getElementById('selector-procedimiento');
      selector.hidden = this.procedimientos.length < 2;
      selector.setOptions(this.procedimientos.map((procedimiento, index) => ({
        value: String(index),
        label: procedimiento.nombreProcedimiento || `Procedimiento ${index + 1}`
      })), false);
      this.indiceProcedimiento = Math.max(0, this.procedimientos.findIndex((procedimiento) =>
        !this._procedimientoAlcanzoUltimo(procedimiento)));
      selector.value = String(this.indiceProcedimiento);
      await this._seleccionarProcedimiento(false);
      if (this.pasos.length) this._setStatus('');
    } catch (error) {
      this._setStatus(error.message || 'No se pudo cargar el flujo de atención.');
      this.shadowRoot.getElementById('flow-error').hidden = false;
      if (error instanceof OfflineError || !connectivity.isOnline()) {
        this._toast('warning', error.message);
      } else {
        console.error('No se pudo inicializar la consulta:', error);
      }
    }
    this._actualizarControlesOffline();
  }

  _resolverContexto() {
    const session = SessionStore.getSession();
    this.idPersonaLogueada = session?.persona?.idPersona ?? null;
    const contexto = SessionStore.getContext();
    let rolSeleccionado = contexto && session?.roles?.find((rol) =>
      rol.idRol?.idRol === contexto.idRol
      && rol.idClinica?.idClinica === contexto.idClinica
    );

    if (!rolSeleccionado) {
      const idClinica = this.detalle?.clinica?.idClinica
        ?? this.detalle?.procedimientos?.[0]?.idConsulta?.idPersonaRol?.idClinica?.idClinica;
      rolSeleccionado = session?.roles?.find((rol) => rol.idClinica?.idClinica === idClinica)
        ?? session?.roles?.[0];
      if (!rolSeleccionado) {
        throw new Error('No hay un rol disponible para atender esta consulta.');
      }
      this._toast('info', 'No había un rol seleccionado; se usó el primer rol disponible para esta clínica.');
      if (rolSeleccionado) {
        SessionStore.setContext({
          idClinica: rolSeleccionado.idClinica?.idClinica ?? idClinica,
          idRol: rolSeleccionado.idRol?.idRol,
          nombreRol: rolSeleccionado.idRol?.nombre ?? ''
        });
      }
    }

    this.nombreRol = rolSeleccionado?.idRol?.nombre
      ?? contexto?.nombreRol
      ?? '';
  }

  _renderPaciente() {
    const paciente = this.detalle?.paciente;
    if (!paciente) return;
    const nombre = `${paciente.nombres ?? ''} ${paciente.apellidos ?? ''}`.trim();
    this.shadowRoot.getElementById('patient-name').textContent = nombre || 'Paciente';
    this.shadowRoot.getElementById('patient-id').textContent =
      paciente.idPersona ? `ID: ${String(paciente.idPersona).slice(0, 8)}...` : '';
    this.shadowRoot.getElementById('avatar').textContent =
      String(paciente.nombres ?? 'P').slice(0, 2).toLocaleUpperCase();
  }

  async _seleccionarProcedimiento(focus = true) {
    const procedimiento = this.procedimientos[this.indiceProcedimiento];
    if (!procedimiento) return;
    this.pasos = procedimiento.pasos;
    this.pasosEjecutados = procedimiento.ejecutados;
    this.idConsultaProcedimiento = procedimiento.idConsultaProcedimiento;
    this.indicePasoActual = pasoInicial(this.pasos, this.pasosEjecutados);
    await this._cargarDatosDelPasoActual();
    this._actualizarUI();
    if (focus) this._focusFirstField();
  }

  async _cargarDatosDelPasoActual() {
    const plantilla = this.pasos[this.indicePasoActual];
    if (!plantilla) {
      this.idPasoActualDB = null;
      this.shadowRoot.getElementById('notas').value = '';
      this.shadowRoot.getElementById('diagnostico').value = '';
      this.shadowRoot.getElementById('plan').value = '';
      this.shadowRoot.querySelectorAll('ui-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
      });
      this.shadowRoot.getElementById('steps-bar').replaceChildren();
      this._setStatus('Este procedimiento no tiene pasos configurados.');
      for (const id of ['btn-guardar-notas', 'btn-asignar-examenes', 'btn-siguiente', 'btn-anterior', 'btn-finalizar']) {
        const button = this.shadowRoot.getElementById(id);
        button.hidden = true;
        button.disabled = true;
      }
      return;
    }
    const pasoEjecutado = this.pasosEjecutados.find((item) =>
      item.idProcedimientoPaso?.idProcedimientoPaso === plantilla.idProcedimientoPaso
      || item.idProcedimientoPaso === plantilla.idProcedimientoPaso
    );
    this.idPasoActualDB = pasoEjecutado?.idConsultaProcedimientoPaso ?? null;
    const registro = RegistroPaso.parsear(pasoEjecutado?.valor);
    this.shadowRoot.getElementById('notas').value = registro.notas;
    this.shadowRoot.getElementById('diagnostico').value = registro.diagnostico;
    this.shadowRoot.getElementById('plan').value = registro.plan;
    this.shadowRoot.querySelectorAll('ui-checkbox').forEach((checkbox) => {
      checkbox.checked = false;
    });
    this._renderExamenes();
    if (this.idPasoActualDB && esDoctor(this.nombreRol)) {
      await this._cargarExamenesMarcados(this.idPasoActualDB);
    }
  }

  async _cargarExamenes() {
    try {
      this.examenes = await this.examenService.listarActivos();
      this._renderExamenes();
    } catch (error) {
      this._setStatus('No se pudieron cargar los exámenes.');
      this._mostrarError(error, 'No se pudieron cargar los exámenes');
    }
  }

  _renderExamenes() {
    const contenedor = this.shadowRoot.getElementById('lista-examenes');
    if (!contenedor) return;
    const seleccionados = new Set([...contenedor.querySelectorAll('ui-checkbox')]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value));
    const filtro = this.shadowRoot.getElementById('buscar-examen')?.value ?? '';
    const lista = filtrarExamenes(this.examenes, filtro);
    contenedor.replaceChildren();
    if (lista.length === 0) {
      contenedor.textContent = this.examenes.length
        ? 'No hay exámenes que coincidan con el filtro.'
        : 'No hay exámenes disponibles.';
      return;
    }

    lista.forEach((examen) => {
      const item = document.createElement('div');
      item.className = 'examen-item';
      const checkbox = document.createElement('ui-checkbox');
      checkbox.id = `ex-${examen.idExamen}`;
      checkbox.setAttribute('label', examen.nombre ?? 'Examen');
      checkbox.value = examen.idExamen;
      checkbox.checked = seleccionados.has(String(examen.idExamen));
      checkbox.disabled = !this._puedeAvanzar;
      item.appendChild(checkbox);
      contenedor.appendChild(item);
    });
  }

  async _cargarExamenesMarcados(idPaso) {
    try {
      const ordenes = await this.examenService.obtenerOrdenesDePaso(idPaso);
      const ids = new Set(ordenes
        .map((orden) => /^EXAMEN:([^|]+)/.exec(orden.indicaciones ?? '')?.[1])
        .filter(Boolean));
      this.shadowRoot.querySelectorAll('ui-checkbox').forEach((checkbox) => {
        checkbox.checked = ids.has(checkbox.value);
      });
    } catch (error) {
      this._mostrarError(error, 'No se pudieron cargar los exámenes guardados');
    }
  }

  async _guardarNotasActual() {
    if (!this.idPasoActualDB) throw new Error('El paso actual aún no está registrado.');
    const texto = new RegistroPaso({
      notas: this.shadowRoot.getElementById('notas').value,
      diagnostico: this.shadowRoot.getElementById('diagnostico').value,
      plan: this.shadowRoot.getElementById('plan').value
    }).serializar();
    await this.pasoService.guardarValor(this.idPasoActualDB, texto);
    const paso = this.pasosEjecutados.find((item) =>
      item.idConsultaProcedimientoPaso === this.idPasoActualDB);
    if (paso) paso.valor = texto;
  }

  async _asignarExamenes() {
    const seleccionados = [...this.shadowRoot.querySelectorAll('#lista-examenes ui-checkbox')]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => {
        const examen = this.examenes.find((item) => String(item.idExamen) === checkbox.value);
        return examen ? { idExamen: examen.idExamen, nombre: examen.nombre } : null;
      })
      .filter(Boolean);
    if (!seleccionados.length) {
      this._toast('warning', 'Selecciona al menos un examen.');
      return;
    }
    if (!this.idPasoActualDB) {
      this._toast('danger', 'El paso actual todavía no está registrado.');
      return;
    }
    try {
      await this.examenService.reemplazarOrdenes(this.idPasoActualDB, seleccionados);
      this._toast('success', 'Exámenes asignados y guardados.');
    } catch (error) {
      const detalleFallos = error.fallos?.map(({ operation, id }) => `${operation}: ${id}`).join(', ');
      this._mostrarError(error, detalleFallos
        ? `Fallaron algunas operaciones de exámenes (${detalleFallos})`
        : 'No se pudieron asignar los exámenes');
    }
  }

  async _avanzarPaso() {
    if (esUltimoPaso(this.indicePasoActual, this.pasos.length)) {
      this._toast('info', 'Este es el último paso del procedimiento. Finaliza cuando todos los procedimientos hayan llegado al último paso.');
      return;
    }
    try {
      await this._guardarNotasActual();
      const siguiente = this.pasos[this.indicePasoActual + 1];
      await this.pasoService.avanzar(
        this.idConsultaProcedimiento,
        this.idPasoActualDB,
        siguiente.idProcedimientoPaso
      );
      await this._recargarProcedimientoActivo();
      this._toast('success', 'Avanzaste al siguiente paso.');
    } catch (error) {
      this._mostrarError(error, 'No se pudo avanzar al siguiente paso');
    }
  }

  async _retrocederPaso() {
    if (esPrimerPaso(this.indicePasoActual)) {
      this._toast('warning', 'Ya estás en el primer paso.');
      return;
    }
    try {
      await this._guardarNotasActual();
      const anterior = this.pasos[this.indicePasoActual - 1];
      await this.pasoService.retroceder(
        this.idConsultaProcedimiento,
        this.idPasoActualDB,
        anterior.idProcedimientoPaso
      );
      await this._recargarProcedimientoActivo();
      this._toast('success', 'Retrocediste al paso anterior.');
    } catch (error) {
      this._mostrarError(error, 'No se pudo retroceder al paso anterior');
    }
  }

  async _recargarProcedimientoActivo() {
    const procedimiento = this.procedimientos[this.indiceProcedimiento];
    procedimiento.ejecutados = await this.pasoService.obtenerEjecutados(procedimiento.idConsultaProcedimiento);
    this.pasosEjecutados = procedimiento.ejecutados;
    this.indicePasoActual = pasoInicial(this.pasos, this.pasosEjecutados);
    await this._cargarDatosDelPasoActual();
    this._actualizarUI();
    this._focusFirstField();
  }

  _procedimientoAlcanzoUltimo(procedimiento) {
    if (!procedimiento.pasos.length) return false;
    const indice = pasoInicial(procedimiento.pasos, procedimiento.ejecutados);
    return esUltimoPaso(indice, procedimiento.pasos.length)
      && procedimiento.ejecutados.some((ejecutado) =>
        (ejecutado.idProcedimientoPaso?.idProcedimientoPaso ?? ejecutado.idProcedimientoPaso)
          === procedimiento.pasos[procedimiento.pasos.length - 1].idProcedimientoPaso
      );
  }

  _todosProcedimientosAlcanzaronUltimo() {
    return this.procedimientos.length > 0
      && this.procedimientos.every((procedimiento) => this._procedimientoAlcanzoUltimo(procedimiento));
  }

  async _finalizar() {
    if (!this._puedeAvanzar
      || !esUltimoPaso(this.indicePasoActual, this.pasos.length)
      || !this._todosProcedimientosAlcanzaronUltimo()) {
      this._toast('warning', 'Lleva todos los procedimientos a su último paso antes de finalizar la consulta.');
      return;
    }
    const confirmation = document.createElement('ui-confirm');
    this.shadowRoot.appendChild(confirmation);
    const confirmed = await confirmation.show('¿Finalizar la consulta?', 'Finalizar consulta');
    confirmation.remove();
    if (!confirmed) return;
    try {
      await this.consultaService.finalizar(this.idConsulta);
      this._toast('success', 'Consulta finalizada.');
      window.location.hash = '#/dashboard';
    } catch (error) {
      this._mostrarError(error, 'No se pudo finalizar la consulta');
    }
  }

  _actualizarUI() {
    if (!this.pasos.length) {
      this._setStatus('Este procedimiento no tiene pasos configurados.');
      return;
    }
    const stepsBar = this.shadowRoot.getElementById('steps-bar');
    stepsBar.replaceChildren();
    this.pasos.forEach((paso, index) => {
      const span = document.createElement('span');
      span.className = 'step';
      span.textContent = `${paso.nombre ?? 'Paso'}${index < this.indicePasoActual ? ' ✔' : ''}`;
      if (index === this.indicePasoActual) {
        span.classList.add('active');
        span.setAttribute('aria-current', 'step');
      }
      if (index < this.indicePasoActual) span.classList.add('done');
      stepsBar.appendChild(span);
    });

    const pasoEjecutado = this.pasosEjecutados.find((item) =>
      item.idConsultaProcedimientoPaso === this.idPasoActualDB);
    const puedeOperar = puedeOperarPaso({
      nombreRol: this.nombreRol,
      idPersonaLogueada: this.idPersonaLogueada,
      pasoEjecutado
    });
    this._puedeAvanzar = puedeOperar;
    const fields = camposVisibles(this.nombreRol);
    this.shadowRoot.getElementById('grupo-diagnostico').hidden = !fields.diagnostico;
    this.shadowRoot.getElementById('grupo-plan').hidden = !fields.plan;
    this.shadowRoot.getElementById('panel-examenes').hidden = !fields.examenes;
    this.shadowRoot.getElementById('notas').setAttribute('label', fields.etiquetaNotas);
    this.shadowRoot.getElementById('btn-guardar-notas').hidden = !puedeOperar;
    this.shadowRoot.getElementById('btn-siguiente').hidden = !puedeOperar;
    this.shadowRoot.getElementById('btn-anterior').hidden = !puedeOperar;
    this.shadowRoot.getElementById('btn-asignar-examenes').hidden = !fields.examenes;
    for (const id of ['notas', 'diagnostico', 'plan']) {
      this.shadowRoot.getElementById(id).disabled = !puedeOperar;
    }
    this.shadowRoot.querySelectorAll('ui-checkbox').forEach((checkbox) => {
      checkbox.disabled = !puedeOperar;
    });

    const msgBloqueo = this.shadowRoot.getElementById('msg-bloqueo');
    if (!puedeOperar) {
      const name = pasoEjecutado?.idPersonaRol?.idPersona;
      const assigned = name
        ? `${name.nombres ?? ''} ${name.apellidos ?? ''}`.trim()
        : 'otra persona';
      this._setBlockingMessage(`Este paso está asignado a ${assigned}.`);
    } else {
      msgBloqueo?.remove();
    }

    if (esDoctor(this.nombreRol) && pasoEjecutado?.idPersonaRol && !puedeOperarPaso({
      nombreRol: 'enfermeria',
      idPersonaLogueada: this.idPersonaLogueada,
      pasoEjecutado
    })) {
      const key = `${this.idConsultaProcedimiento}:${this.idPasoActualDB}`;
      if (!this._warnedForeignSteps.has(key)) {
        this._warnedForeignSteps.add(key);
        const assignee = pasoEjecutado.idPersonaRol.idPersona;
        const name = `${assignee?.nombres ?? ''} ${assignee?.apellidos ?? ''}`.trim() || 'otra persona';
        const role = pasoEjecutado.idPersonaRol.idRol?.nombre || 'otro rol';
        this._toast('info', `Este paso estaba asignado a ${name} (${role}); lo estás atendiendo como doctor.`);
      }
    }

    const atLast = esUltimoPaso(this.indicePasoActual, this.pasos.length);
    const finalButton = this.shadowRoot.getElementById('btn-finalizar');
    finalButton.hidden = !puedeOperar || !atLast || !this._todosProcedimientosAlcanzaronUltimo();
    const next = this.shadowRoot.getElementById('btn-siguiente');
    next.textContent = atLast ? 'Último paso alcanzado' : 'Guardar y Avanzar al Siguiente Paso →';
    this._actualizarControlesOffline();
  }

  _setBlockingMessage(texto) {
    let message = this.shadowRoot.getElementById('msg-bloqueo');
    if (!message) {
      message = document.createElement('p');
      message.id = 'msg-bloqueo';
      message.className = 'blocking-message';
      message.setAttribute('role', 'status');
      message.setAttribute('aria-live', 'polite');
      this.shadowRoot.querySelector('.grid').prepend(message);
    }
    message.textContent = `⏳ Paso en espera. ${texto}`;
  }

  _focusFirstField() {
    const candidates = [
      this.shadowRoot.getElementById('notas'),
      this.shadowRoot.getElementById('diagnostico'),
      this.shadowRoot.getElementById('plan')
    ];
    candidates.find((field) => !field.closest('[hidden]'))?.focus();
  }

  async _runBusy(id, operation) {
    if (this._busy.has(id)) return;
    this._busy.add(id);
    this._actualizarControlesOffline();
    try {
      await operation();
    } catch (error) {
      this._mostrarError(error, 'No se pudo completar la acción');
    } finally {
      this._busy.delete(id);
      this._actualizarControlesOffline();
    }
  }

  _actualizarControlesOffline() {
    const offline = !connectivity.isOnline();
    for (const id of ['btn-guardar-notas', 'btn-asignar-examenes', 'btn-siguiente', 'btn-anterior', 'btn-finalizar']) {
      const button = this.shadowRoot.getElementById(id);
      if (!button) continue;
      const workflowDisabled = (id === 'btn-siguiente'
          && (esUltimoPaso(this.indicePasoActual, this.pasos.length) || !this._puedeAvanzar))
        || (id === 'btn-anterior' && (esPrimerPaso(this.indicePasoActual) || !this._puedeAvanzar))
        || (id === 'btn-finalizar' && (!this._todosProcedimientosAlcanzaronUltimo() || !this._puedeAvanzar))
        || (id === 'btn-guardar-notas' && !this._puedeAvanzar)
        || (id === 'btn-asignar-examenes' && !this._puedeAvanzar);
      button.disabled = offline || workflowDisabled || this._busy.has(id);
      if (offline) button.setAttribute('title', 'Requiere conexión');
      else if (button.getAttribute('title') === 'Requiere conexión') button.removeAttribute('title');
    }
    const selector = this.shadowRoot.getElementById('selector-procedimiento');
    if (selector) selector.disabled = this._busy.has('selector-procedimiento');
  }

  _setStatus(message) {
    this.shadowRoot.getElementById('consulta-status').textContent = message;
  }

  _mostrarError(error, mensaje) {
    const texto = error instanceof OfflineError || !connectivity.isOnline()
      ? 'Sin conexión. Necesitas conexión para guardar este cambio.'
      : `${mensaje}: ${error.message}`;
    this._setStatus(texto);
    this._toast('danger', texto);
  }

  _toast(type, message) {
    window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type, message } }));
  }
}

customElements.define('view-consulta', ViewConsulta);
