import { ExamenService } from '../../control/examen-service.js';
import { PasoService } from '../../control/paso-service.js';
import { ApiClient } from '../../control/api-client.js';
import { RegistroPaso } from '../../entity/registro-paso.js';
import { OfflineError } from '../../control/offline-error.js';
import { connectivity } from '../../state/connectivity.js';

import '../components/ui-confirm.js';

export class ViewConsulta extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.examenService = new ExamenService();
    this.pasoService = new PasoService();
    this.api = new ApiClient();
    
    this.idConsulta = localStorage.getItem('consulta_activa');
    this.idConsultaProcedimiento = null;
    this.pasos = []; 
    this.pasosEjecutados = []; 
    this.indicePasoActual = 0;
    this.idPasoActualDB = null;
    this._puedeAvanzar = true;

    this.shadowRoot.innerHTML = `
      <div style="margin-bottom: 15px;">
        <button id="btn-volver" style="background: none; border: 1px solid var(--color-border); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; color: var(--color-primary);">← Volver al Dashboard</button>
      </div>
      <div class="panel">
        <h2>Registro de Atención</h2>
        <div class="patient-header" id="patient-header">
          <div class="avatar" id="avatar">P</div>
          <div class="patient-info">
            <h3 id="patient-name">Cargando...</h3>
            <p id="patient-id">ID: ...</p>
          </div>
        </div>
        <div class="steps-bar" id="steps-bar"></div>
      </div>

      <div class="grid">
        <div class="panel">
          <div class="form-group">
            <label id="lbl-notas">Notas de la Consulta</label>
            <textarea rows="3" id="notas" placeholder="Escriba las notas..."></textarea>
          </div>
          
          <div class="form-group" id="grupo-diagnostico">
            <label>Diagnóstico Principal (CIE-10)</label>
            <input type="text" id="diagnostico" placeholder="Ej. J00 - Rinofaringitis aguda" />
          </div>
          
          <div class="form-group" id="grupo-plan">
            <label>Plan de Tratamiento</label>
            <textarea rows="3" id="plan" placeholder="Indique el plan..."></textarea>
          </div>
          
          <button class="btn-save-notes" id="btn-guardar-notas">Guardar Notas</button>
        </div>

        <div class="panel" id="panel-examenes">
          <h2>Lista de Exámenes Asignables</h2>
          <div class="examenes-list" id="lista-examenes">
            <p>Cargando exámenes...</p>
          </div>
          <button class="btn-asignar" id="btn-asignar-examenes">Asignar Exámenes Seleccionados</button>
        </div>
      </div>

      <div class="footer-actions">
        <button class="btn btn-secondary" id="btn-anterior" disabled>← Anterior</button>
        <button class="btn btn-primary" id="btn-siguiente">Guardar y Avanzar al Siguiente Paso →</button>
      </div>
      
      <div style="text-align: center; margin-top: 15px;">
        <button class="btn btn-danger" id="btn-finalizar" style="display: none;">✓ Finalizar Consulta</button>
      </div>
    `;

    this._cargarEstilos();
  }

  async _cargarEstilos() {
    try {
      const url = new URL('../../styles/views/view-consulta.css', import.meta.url);
      const response = await fetch(url);
      const cssText = await response.text();
      const style = document.createElement('style');
      style.textContent = cssText;
      this.shadowRoot.appendChild(style);
    } catch (error) { console.warn(error); }
  }

  async connectedCallback() {
    this._unsubscribeConnectivity = connectivity.subscribe(() => {
      this._actualizarControlesOffline();
    });
    this._actualizarControlesOffline();

    try {
      const detalle = await this.api.get(`/consultas/${this.idConsulta}/detalle-completo`);
      if (detalle) {
        let todosLosPasosFinalizados = true;
        if (detalle.procedimientos && detalle.procedimientos.length > 0) {
          todosLosPasosFinalizados = detalle.procedimientos.every(proc => 
            proc.pasos.every(paso => paso.estado === 'FINALIZADO')
          );
        }
        if (detalle.fechaFin && todosLosPasosFinalizados) {
          this._toast('warning', 'Esta consulta ya fue atendida y finalizada. No se puede modificar.');
          window.location.hash = '#/dashboard';
          return;
        }
      }
    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) this._toast('warning', error.message);
      else console.error(error);
    }

    await this._inicializarFlujoReal();
    await this._cargarExamenes();
    await this._cargarDatosPaciente();

    this.shadowRoot.getElementById('btn-volver').addEventListener('click', () => {
      window.location.hash = '#/dashboard';
    });

    this.shadowRoot.getElementById('btn-asignar-examenes').addEventListener('click', async () => {
      await this._asignarExamenes();
    });

    this.shadowRoot.getElementById('btn-siguiente').addEventListener('click', async () => {
      await this._avanzarPaso();
    });

    this.shadowRoot.getElementById('btn-anterior').addEventListener('click', async () => {
      await this._retrocederPaso();
    });

    this.shadowRoot.getElementById('btn-guardar-notas').addEventListener('click', async () => {
      try {
        await this._guardarNotasActual();
        this._toast('success', 'Notas guardadas correctamente.');
      } catch (error) {
        this._mostrarError(error, 'No se pudieron guardar las notas');
      }
    });

    this.shadowRoot.getElementById('btn-finalizar').addEventListener('click', async () => {
      const confirmation = document.createElement('ui-confirm');
      this.shadowRoot.appendChild(confirmation);
      const confirmed = await confirmation.show('¿Finalizar la consulta?', 'Finalizar consulta');
      confirmation.remove();
      if (!confirmed) return;

      try {
        await this.api.put(`/consultas/${this.idConsulta}/finalizar`, {});
        this._toast('success', 'Consulta finalizada.');
        window.location.hash = '#/dashboard';
      } catch (error) {
        this._mostrarError(error, 'No se pudo finalizar la consulta');
      }
    });
  }

  async _inicializarFlujoReal() {
    if (!this.idConsulta) return;
    try {
      const consultasProcedimientos = await this.api.get(`/consultas-procedimientos/all`);
      const cp = consultasProcedimientos.find(item => item.idConsulta && item.idConsulta.idConsulta === this.idConsulta);
      if (!cp) return;

      this.idConsultaProcedimiento = cp.idConsultaProcedimiento;
      this.pasos = await this.pasoService.obtenerPasosDeProcedimiento(cp.idProcedimiento);
      this.pasosEjecutados = await this.api.get(`/consultas-procedimientos-pasos/consulta/${this.idConsultaProcedimiento}`);
      
      const pasoPendiente = this.pasosEjecutados.find(p => p.estado !== 'FINALIZADO');
      if (pasoPendiente) {
        this.indicePasoActual = this.pasos.findIndex(p => p.idProcedimientoPaso === pasoPendiente.idProcedimientoPaso.idProcedimientoPaso);
        this.idPasoActualDB = pasoPendiente.idConsultaProcedimientoPaso;
      } else {
        this.indicePasoActual = 0;
        this.idPasoActualDB = null;
      }

      await this._cargarDatosDelPasoActual();
      this._actualizarUI();
    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) this._toast('warning', error.message);
      else console.error(error);
    }
  }

  async _cargarDatosDelPasoActual() {
    const idPasoPlantilla = this.pasos[this.indicePasoActual].idProcedimientoPaso;
    const pasoEjecutado = this.pasosEjecutados.find(p => 
      p.idProcedimientoPaso && p.idProcedimientoPaso.idProcedimientoPaso === idPasoPlantilla
    );

    if (pasoEjecutado) {
      this.idPasoActualDB = pasoEjecutado.idConsultaProcedimientoPaso;
      
      if (pasoEjecutado.valor) {
        const registro = RegistroPaso.parsear(pasoEjecutado.valor);
        this.shadowRoot.getElementById('notas').value = registro.notas;
        this.shadowRoot.getElementById('diagnostico').value = registro.diagnostico;
        this.shadowRoot.getElementById('plan').value = registro.plan;
      } else {
        this.shadowRoot.getElementById('notas').value = '';
        this.shadowRoot.getElementById('diagnostico').value = '';
        this.shadowRoot.getElementById('plan').value = '';
      }

      await this._cargarExamenesMarcados(this.idPasoActualDB);
    } else {
      this.idPasoActualDB = null;
      this.shadowRoot.getElementById('notas').value = '';
      this.shadowRoot.getElementById('diagnostico').value = '';
      this.shadowRoot.getElementById('plan').value = '';
      this._limpiarExamenes();
    }
  }

  async _cargarExamenesMarcados(idPasoEjecutado) {
    this._limpiarExamenes();
    if (!idPasoEjecutado) return;
    
    try {
      const ordenes = await this.api.get(`/ordenes-examen/por-paso/${idPasoEjecutado}`);
      const contenedor = this.shadowRoot.getElementById('lista-examenes');
      
      if (ordenes && ordenes.length > 0) {
        ordenes.forEach(orden => {
          if (orden.indicaciones && orden.indicaciones.startsWith('EXAMEN:')) {
            const idExamen = orden.indicaciones.split('|')[0].replace('EXAMEN:', '');
            const checkbox = contenedor.querySelector(`input[value="${idExamen}"]`);
            if (checkbox) checkbox.checked = true;
          }
        });
      }
    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) this._toast('warning', error.message);
      else console.warn(error);
    }
  }

  _limpiarExamenes() {
    this.shadowRoot.querySelectorAll('.examen-item input').forEach(cb => cb.checked = false);
  }

  async _guardarNotasActual() {
    if (!this.idPasoActualDB) return;
    const notas = this.shadowRoot.getElementById('notas').value;
    const diagnostico = this.shadowRoot.getElementById('diagnostico').value;
    const plan = this.shadowRoot.getElementById('plan').value;
    const textoCompleto = new RegistroPaso({ notas, diagnostico, plan }).serializar();

    await this.api.put(`/consultas-procedimientos-pasos/${this.idPasoActualDB}/valor?valor=${encodeURIComponent(textoCompleto)}`);
    const paso = this.pasosEjecutados.find(p => p.idConsultaProcedimientoPaso === this.idPasoActualDB);
    if (paso) paso.valor = textoCompleto;
  }

  async _asignarExamenes() {
    const seleccionados = this.shadowRoot.querySelectorAll('.examen-item input:checked');
    if (seleccionados.length === 0) {
      this._toast('warning', 'Selecciona al menos un examen.');
      return;
    }
    if (!this.idPasoActualDB) {
      this._toast('danger', 'Error: el paso no está registrado.');
      return;
    }

    try {
      const ordenesViejas = await this.api.get(`/ordenes-examen/por-paso/${this.idPasoActualDB}`);
      if (ordenesViejas && ordenesViejas.length > 0) {
        for (const ord of ordenesViejas) {
          await this.api.delete(`/ordenes-examen/${ord.idOrdenExamen}`);
        }
      }

      for (const checkbox of seleccionados) {
        const idExamen = checkbox.value;
        const nombre = checkbox.nextElementSibling.textContent;

        await this.api.post('/ordenes-examen', {
          idOrdenExamen: crypto.randomUUID(),
          idConsultaProcedimientoPaso: { idConsultaProcedimientoPaso: this.idPasoActualDB },
          fechaCreacion: new Date().toISOString(),
          indicaciones: `EXAMEN:${idExamen}|NOMBRE:${nombre}`
        });
      }
      this._toast('success', 'Exámenes asignados y guardados.');
    } catch (error) {
      this._mostrarError(error, 'No se pudieron asignar los exámenes');
    }
  }

  async _avanzarPaso() {
    if (this.indicePasoActual >= this.pasos.length - 1) {
      this._toast('warning', "¡Último paso! Usa 'Finalizar'.");
      return;
    }

    try {
      await this._guardarNotasActual();

      const siguientePaso = this.pasos[this.indicePasoActual + 1];
      await this.api.post(`/consultas-procedimientos-pasos/siguiente/${this.idConsultaProcedimiento}?idPasoActual=${this.idPasoActualDB}&idSiguientePaso=${siguientePaso.idProcedimientoPaso}`);

      this.pasosEjecutados = await this.api.get(`/consultas-procedimientos-pasos/consulta/${this.idConsultaProcedimiento}`);
      
      this.indicePasoActual++;
      await this._cargarDatosDelPasoActual();
      this._actualizarUI();
      
      this._toast('success', 'Avanzaste al siguiente paso.');
    } catch (error) {
      this._mostrarError(error, 'No se pudo avanzar al siguiente paso');
    }
  }

  async _retrocederPaso() {
    if (this.indicePasoActual <= 0) {
      window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type: 'warning', message: 'Ya estás en el primer paso.' } }));
      return;
    }

    try {
      await this._guardarNotasActual();
      
      const pasoAnterior = this.pasos[this.indicePasoActual - 1];
      await this.api.post(`/consultas-procedimientos-pasos/retroceder/${this.idConsultaProcedimiento}?idPasoActual=${this.idPasoActualDB}&idPasoAnterior=${pasoAnterior.idProcedimientoPaso}`);
      
      this.pasosEjecutados = await this.api.get(`/consultas-procedimientos-pasos/consulta/${this.idConsultaProcedimiento}`);

      this.indicePasoActual--;
      await this._cargarDatosDelPasoActual();
      this._actualizarUI();
      
      window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type: 'success', message: 'Retrocediste al paso anterior.' } }));
    } catch (error) {
      this._mostrarError(error, 'No se pudo retroceder al paso anterior');
    }
  }

  disconnectedCallback() {
    this._unsubscribeConnectivity?.();
    this._unsubscribeConnectivity = null;
  }

  _actualizarControlesOffline() {
    const offline = !connectivity.isOnline();
    const controles = [
      'btn-guardar-notas',
      'btn-asignar-examenes',
      'btn-siguiente',
      'btn-anterior',
      'btn-finalizar'
    ];

    controles.forEach(id => {
      const button = this.shadowRoot.getElementById(id);
      if (!button) return;
      const disabledByWorkflow =
        (id === 'btn-siguiente' && (this.indicePasoActual >= this.pasos.length - 1 || !this._puedeAvanzar)) ||
        (id === 'btn-anterior' && this.indicePasoActual === 0);
      button.disabled = offline || disabledByWorkflow;
      if (offline) button.title = 'Requiere conexión';
      else if (button.title === 'Requiere conexión') button.removeAttribute('title');
    });
  }

  _mostrarError(error, mensaje) {
    const texto = error instanceof OfflineError || !connectivity.isOnline()
      ? 'Sin conexión. Necesitas conexión para guardar este cambio.'
      : `${mensaje}: ${error.message}`;
    this._toast('danger', texto);
  }

  _toast(type, message) {
    window.dispatchEvent(new CustomEvent('ui-toast', { detail: { type, message } }));
  }

  _actualizarUI() {
    if (this.pasos.length === 0) return;

    const stepsBar = this.shadowRoot.getElementById('steps-bar');
    stepsBar.innerHTML = '';
    
    this.pasos.forEach((paso, index) => {
      const span = document.createElement('span');
      span.textContent = `${paso.nombre} ${index < this.indicePasoActual ? '✔' : ''}`;
      span.className = 'step';
      if (index === this.indicePasoActual) span.classList.add('active');
      if (index < this.indicePasoActual) span.classList.add('done');
      stepsBar.appendChild(span);
      if (index < this.pasos.length - 1) stepsBar.appendChild(document.createTextNode(' | '));
    });

    const btnAnterior = this.shadowRoot.getElementById('btn-anterior');
    const btnSiguiente = this.shadowRoot.getElementById('btn-siguiente');
    const btnGuardar = this.shadowRoot.getElementById('btn-guardar-notas');
    const btnAsignar = this.shadowRoot.getElementById('btn-asignar-examenes');
    const btnFinalizar = this.shadowRoot.getElementById('btn-finalizar');
    const panelNotas = this.shadowRoot.querySelector('.grid'); 
    const panelExamenes = this.shadowRoot.getElementById('panel-examenes');

    const divDiagnostico = this.shadowRoot.getElementById('grupo-diagnostico');
    const divPlan = this.shadowRoot.getElementById('grupo-plan');
    const lblNotas = this.shadowRoot.getElementById('lbl-notas');

    let puedeAvanzar = true;
    let esUltimoPaso = (this.indicePasoActual === this.pasos.length - 1);
    let mensajeEstado = "";

    if (this.pasosEjecutados.length > 0 && this.idPasoActualDB) {
      const pasoActualBD = this.pasosEjecutados.find(p => p.idConsultaProcedimientoPaso === this.idPasoActualDB);
      
      if (pasoActualBD && pasoActualBD.idPersonaRol && pasoActualBD.idPersonaRol.idPersona) {
        const sesion = JSON.parse(localStorage.getItem('clinicasv_session'));
        const idPersonaLogueada = sesion?.persona?.idPersona;
        const idPersonaAsignada = pasoActualBD.idPersonaRol.idPersona.idPersona;

        if (idPersonaLogueada !== idPersonaAsignada) {
          puedeAvanzar = false;
          const nombreAsignado = `${pasoActualBD.idPersonaRol.idPersona.nombres} ${pasoActualBD.idPersonaRol.idPersona.apellidos}`;
          const rolAsignado = pasoActualBD.idPersonaRol.idRol?.nombre || "otro rol";
          
          mensajeEstado = `
            <div style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; border:1px solid #ffeeba; margin-bottom:15px; text-align:center;">
              <h3 style="margin:0 0 5px 0;">⏳ Paso en espera</h3>
              <p style="margin:0;">Este paso está asignado a <strong>${nombreAsignado}</strong> (${rolAsignado}).</p>
            </div>
          `;
        }
      }
    }
    this._puedeAvanzar = puedeAvanzar;

    // 🔥 ADAPTACIÓN DEL FORMULARIO SEGÚN EL ROL LOGUEADO
    const sesion = JSON.parse(localStorage.getItem('clinicasv_session'));
    const nombreRol = sesion?.roles?.[0]?.idRol?.nombre?.toLowerCase() || '';
    const esDoctor = nombreRol.includes('doctor') || nombreRol.includes('médico') || nombreRol.includes('medico');

    if (esDoctor) {
      if (divDiagnostico) divDiagnostico.style.display = 'block';
      if (divPlan) divPlan.style.display = 'block';
      if (panelExamenes) panelExamenes.style.display = 'block';
      if (lblNotas) lblNotas.textContent = "Notas de la Consulta Médica";
    } else {
      if (divDiagnostico) divDiagnostico.style.display = 'none';
      if (divPlan) divPlan.style.display = 'none';
      if (panelExamenes) panelExamenes.style.display = 'none';
      
      if (nombreRol.includes('enfermera')) {
        if (lblNotas) lblNotas.textContent = "Notas de Signos Vitales";
      } else {
        if (lblNotas) lblNotas.textContent = "Notas de Recepción";
      }
    }

    if (!puedeAvanzar) {
      if (btnGuardar) btnGuardar.style.display = 'none';
      if (btnFinalizar) btnFinalizar.style.display = 'none';
      btnSiguiente.style.display = 'none';
      
      this.shadowRoot.getElementById('notas').disabled = true;
      this.shadowRoot.getElementById('diagnostico').disabled = true;
      this.shadowRoot.getElementById('plan').disabled = true;
      this.shadowRoot.querySelectorAll('.examen-item input').forEach(cb => cb.disabled = true);

      if (!this.shadowRoot.getElementById('msg-bloqueo')) {
        const msgDiv = document.createElement('div');
        msgDiv.id = 'msg-bloqueo';
        msgDiv.innerHTML = mensajeEstado;
        panelNotas.parentNode.insertBefore(msgDiv, panelNotas);
      }
    } else {
      if (btnGuardar) btnGuardar.style.display = 'block';
      btnSiguiente.style.display = 'block';
      
      this.shadowRoot.getElementById('notas').disabled = false;
      this.shadowRoot.getElementById('diagnostico').disabled = false;
      this.shadowRoot.getElementById('plan').disabled = false;
      this.shadowRoot.querySelectorAll('.examen-item input').forEach(cb => cb.disabled = false);

      const msgExistente = this.shadowRoot.getElementById('msg-bloqueo');
      if (msgExistente) msgExistente.remove();

      // 🔥 MOSTRAR FINALIZAR SOLO SI ES ÚLTIMO PASO
      if (btnFinalizar) {
        btnFinalizar.style.display = esUltimoPaso ? 'inline-block' : 'none';
      }
    }

    if (esUltimoPaso) {
      btnSiguiente.textContent = "Último Paso Alcanzado";
    } else {
      btnSiguiente.textContent = "Guardar y Avanzar al Siguiente Paso →";
    }
    this._actualizarControlesOffline();
  }

  async _cargarExamenes() {
    const contenedor = this.shadowRoot.getElementById('lista-examenes');
    try {
      const examenes = await this.examenService.listarActivos();
      contenedor.innerHTML = '';
      examenes.forEach(ex => {
        const div = document.createElement('div');
        div.className = 'examen-item';
        div.innerHTML = `<input type="checkbox" id="ex-${ex.idExamen}" value="${ex.idExamen}"><label for="ex-${ex.idExamen}">${ex.nombre}</label>`;
        contenedor.appendChild(div);
      });
    } catch (error) {
      contenedor.textContent = 'No se pudieron cargar los exámenes.';
      if (error instanceof OfflineError || !connectivity.isOnline()) this._toast('warning', error.message);
    }
  }

  async _cargarDatosPaciente() {
    try {
      const consultas = await this.api.get('/consultas/all');
      const consulta = consultas.find(c => c.idConsulta === this.idConsulta);
      if (consulta && consulta.idPersonaRol && consulta.idPersonaRol.idPersona) {
        const p = consulta.idPersonaRol.idPersona;
        this.shadowRoot.getElementById('patient-name').textContent = `${p.nombres} ${p.apellidos}`;
        this.shadowRoot.getElementById('patient-id').textContent = `ID: ${p.idPersona.substring(0, 8)}...`;
        this.shadowRoot.getElementById('avatar').textContent = p.nombres.substring(0, 2).toUpperCase();
      }
    } catch (error) {
      if (error instanceof OfflineError || !connectivity.isOnline()) this._toast('warning', error.message);
      else console.error(error);
    }
  }
}
customElements.define('view-consulta', ViewConsulta);