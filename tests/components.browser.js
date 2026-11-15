import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import '../src/components/login.component.js';
import '../src/components/consulta.component.js';
import '../src/components/dashboard.component.js';
import '../src/components/cita-card.component.js';
import '../src/core/router.js';
import { resetApiTransport } from '../src/api.service.js';

const jsonResponse = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(Boolean(predicate()), 'condition did not become true before timeout').to.equal(true);
};

describe('Web Components browser suite', () => {
  let sandbox;
  let fetchStub;

  beforeEach(() => {
    resetApiTransport();
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub(window, 'fetch');
  });

  afterEach(() => {
    sandbox.restore();
    resetApiTransport();
    document.querySelectorAll('galeno-login, galeno-consulta-activa, galeno-dashboard, cita-card, galeno-router')
      .forEach((component) => component.remove());
    sessionStorage.removeItem('galenosv.employee');
  });

  it('galeno-login emits login-submit with the entered document details', () => {
    const login = document.createElement('galeno-login');
    document.body.append(login);
    login.shadowRoot.querySelector('#document-type').value = 'PASAPORTE';
    const documentNumber = login.shadowRoot.querySelector('#document-number');
    documentNumber.value = 'A1234567';
    documentNumber.dispatchEvent(new Event('input', { bubbles: true }));
    const submitSpy = sinon.spy();
    login.addEventListener('login-submit', submitSpy);

    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    login.shadowRoot.querySelector('#login-form').dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).to.equal(true);
    expect(submitSpy.calledOnce).to.equal(true);
    expect(submitSpy.firstCall.args[0].detail)
      .to.deep.equal({ tipoDocumento: 'PASAPORTE', numeroDocumento: 'A1234567' });
  });

  it('loads the consultation identified in the SPA route and fetches its exams', async () => {
    const consultationId = 'b8620000-0000-4000-8000-000000000001';
    fetchStub.callsFake((url) => new URL(url).pathname.endsWith('/examenes/all')
      ? jsonResponse([])
      : jsonResponse({
        idConsulta: consultationId,
        fechaInicio: '2026-06-01T09:00:00',
        observaciones: '',
        idPersonaRol: {
          idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
          idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
          idRol: { idRol: 'role-1', nombre: 'Médico' },
        },
      }));
    const consultation = document.createElement('galeno-consulta-activa');
    consultation.setAttribute('route-consultaId', consultationId);
    document.body.append(consultation);

    const deadline = Date.now() + 3000;
    while (
      consultation.shadowRoot.querySelector('#consultation-title').textContent !== 'Elena Martínez'
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(fetchStub.called).to.equal(true);
    expect(fetchStub.args.some(([url]) => new URL(url).pathname.endsWith(`/consultas/${consultationId}`)))
      .to.equal(true);
    expect(consultation.shadowRoot.querySelector('#consultation-title').textContent).to.equal('Elena Martínez');
    expect(consultation.shadowRoot.querySelector('#save-notes').disabled).to.equal(false);
  });

  it('accepts a free-text diagnosis without making a catalog request and saves its value', async () => {
    const consultationId = 'b8620000-0000-4000-8000-000000000002';
    fetchStub.callsFake((url, options = {}) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/examenes/all')) return jsonResponse([]);
      if (path.endsWith(`/consultas/${consultationId}`) && options.method !== 'PUT') {
        return jsonResponse({
          idConsulta: consultationId,
          fechaInicio: '2026-06-01T09:00:00',
          observaciones: '',
          idPersonaRol: {
            idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
            idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
            idRol: { idRol: 'role-1', nombre: 'Médico' },
          },
        });
      }
      if (options.method === 'PUT') return jsonResponse({ idConsulta: consultationId });
      return jsonResponse([]);
    });

    const consultation = document.createElement('galeno-consulta-activa');
    consultation.setAttribute('route-consultaId', consultationId);
    document.body.append(consultation);
    const root = consultation.shadowRoot;
    const deadline = Date.now() + 3000;
    while (
      root.querySelector('#save-notes').disabled
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const diagnosisInput = root.querySelector('#diagnosis-search');
    diagnosisInput.value = 'Caries dental no especificada';
    diagnosisInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(diagnosisInput.type).to.equal('text');
    expect(root.querySelector('#diagnosis-suggestions')).to.equal(null);
    expect(fetchStub.callCount).to.equal(2);

    root.querySelector('#notes-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const saveDeadline = Date.now() + 3000;
    while (fetchStub.callCount < 3 && Date.now() < saveDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const putCall = fetchStub.args.find(([, options]) => options?.method === 'PUT');
    expect(putCall).to.exist;
    const payload = JSON.parse(putCall[1].body);
    expect(JSON.parse(payload.observaciones).historial[0].diagnostico)
      .to.equal('Caries dental no especificada');
  });

  it('filters dashboard consultations inclusively by the selected date range', async () => {
    sessionStorage.setItem('galenosv.employee', JSON.stringify({
      id: 'employee-1',
      nombres: 'Elena',
      apellidos: 'Martínez',
      assignments: [{
        idPersonaRol: 'assignment-1',
        idClinica: 'clinic-1',
        clinica: 'Clínica Central',
        idRol: 'role-1',
        rol: 'Médico',
      }],
    }));
    const records = [
      { idConsulta: 'before', fechaInicio: '2026-06-30T12:00:00Z' },
      { idConsulta: 'within', fechaInicio: '2026-07-01T12:00:00Z' },
      { idConsulta: 'after', fechaInicio: '2026-07-02T12:00:00Z' },
    ].map((record) => ({
      ...record,
      idPersonaRol: {
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
        idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
        idRol: { idRol: 'role-1', nombre: 'Médico' },
      },
    }));
    fetchStub.callsFake((url) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/consultas')) return jsonResponse(records);
      return jsonResponse([]);
    });

    const dashboard = document.createElement('galeno-dashboard');
    document.body.append(dashboard);
    const root = dashboard.shadowRoot;
    const deadline = Date.now() + 3000;
    while (
      root.querySelector('#clinic-select').options.length < 2
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(fetchStub.called).to.equal(false);
    const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const todayString = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    expect(root.querySelector('#date-from').value).to.equal(todayString);
    expect(root.querySelector('#date-to').value).to.equal(todayString);
    root.querySelector('#clinic-select').value = 'clinic-1';
    root.querySelector('#clinic-select').dispatchEvent(new Event('change'));
    expect(root.querySelector('#role-select').options.length).to.equal(2);
    root.querySelector('#role-select').value = 'role-1';
    root.querySelector('#role-select').dispatchEvent(new Event('change'));
    root.querySelector('#date-from').value = '2026-06-30';
    root.querySelector('#date-from').dispatchEvent(new Event('change'));
    root.querySelector('#date-to').value = '2026-07-02';
    root.querySelector('#date-to').dispatchEvent(new Event('change'));
    root.querySelector('#load-consultations').click();

    const loadDeadline = Date.now() + 3000;
    while (
      root.querySelector('#consultation-list').querySelectorAll('dashboard-consulta-card').length !== 3
      && Date.now() < loadDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    root.querySelector('#date-from').value = '2026-07-01';
    root.querySelector('#date-from').dispatchEvent(new Event('change'));
    root.querySelector('#date-to').value = '2026-07-01';
    root.querySelector('#date-to').dispatchEvent(new Event('change'));

    const filteredDeadline = Date.now() + 3000;
    while (
      root.querySelector('#consultation-count').textContent !== '1 de 3 consultas'
      && Date.now() < filteredDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(root.querySelector('#consultation-list').querySelectorAll('dashboard-consulta-card'))
      .to.have.length(1);
    expect(root.querySelector('#consultation-count').textContent).to.equal('1 de 3 consultas');
    const consultationRequests = fetchStub.args
      .filter(([url]) => new URL(url).pathname.endsWith('/consultas'));
    const filteredRequestUrl = new URL(consultationRequests.at(-1)[0]);
    expect(filteredRequestUrl.searchParams.get('idClinica')).to.equal('clinic-1');
    expect(filteredRequestUrl.searchParams.get('idRol')).to.equal('role-1');
    expect(filteredRequestUrl.searchParams.get('desde')).to.equal('2026-07-01');
    expect(filteredRequestUrl.searchParams.get('hasta')).to.equal('2026-07-01');
  });

  it('renders the stored author, timestamp, and notes for completed dashboard steps', () => {
    const card = document.createElement('dashboard-consulta-card');
    card.consulta = {
      id: 'consultation-history',
      fecha: '2026-07-01',
      hora: '09:00',
      tipo: 'Consulta médica',
      paciente: {
        id: 'person-1',
        nombres: 'Elena',
        apellidos: 'Martínez',
        fechaNacimiento: '1990-01-01',
      },
      pasosPrevios: [{
        nombre: 'Triaje',
        realizadoPor: 'Elena Martínez',
        guardadoEn: '2026-07-01T08:30:00Z',
        notas: 'Signos vitales registrados.',
        completado: true,
      }],
    };
    document.body.append(card);
    card.shadowRoot.querySelector('#view-record').click();

    expect(card.shadowRoot.querySelector('.step-person').textContent)
      .to.include('Realizado por Elena Martínez');
    expect(card.shadowRoot.querySelector('.step-person').textContent)
      .not.to.include('Fecha no disponible');
    expect(card.shadowRoot.querySelector('.step-notes').textContent)
      .to.equal('Signos vitales registrados.');
  });

  it('auto-saves the current step before moving to the previous step', async () => {
    sessionStorage.setItem('galenosv.employee', JSON.stringify({
      id: 'employee-1',
      nombres: 'Elena',
      apellidos: 'Martínez',
      assignments: [],
    }));
    const consultationId = 'b8620000-0000-4000-8000-000000000003';
    const consultationRecord = {
      idConsulta: consultationId,
      fechaInicio: '2026-06-01T09:00:00',
      observaciones: JSON.stringify({ historial: [{ paso: 'Triaje', guardadoEn: '2026-06-01T08:30:00Z' }] }),
      idPersonaRol: {
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
        idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
        idRol: { idRol: 'role-1', nombre: 'Médico' },
      },
    };
    fetchStub.callsFake((url, options = {}) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/examenes/all')) return jsonResponse([]);
      if (options.method === 'PUT') return jsonResponse({ idConsulta: consultationId });
      return jsonResponse(consultationRecord);
    });

    const consultation = document.createElement('galeno-consulta-activa');
    consultation.setAttribute('route-consultaId', consultationId);
    document.body.append(consultation);
    const root = consultation.shadowRoot;
    const deadline = Date.now() + 3000;
    while (
      root.querySelector('#save-notes').disabled
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(root.querySelector('#active-step-label').textContent).to.equal('Etapa actual: Consulta Médica');
    root.querySelector('#consultation-notes').value = 'Nota antes de retroceder';
    root.querySelector('#consultation-notes').dispatchEvent(new Event('input'));
    root.querySelector('#previous-step').click();
    const saveDeadline = Date.now() + 3000;
    while (
      !fetchStub.args.some(([, options]) => options?.method === 'PUT')
      && Date.now() < saveDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const putCall = fetchStub.args.find(([, options]) => options?.method === 'PUT');
    expect(putCall).to.exist;
    const history = JSON.parse(JSON.parse(putCall[1].body).observaciones).historial;
    expect(history.find(({ paso }) => paso === 'Consulta Médica').notas)
      .to.equal('Nota antes de retroceder');
    expect(history.find(({ paso }) => paso === 'Consulta Médica').realizadoPor)
      .to.equal('Elena Martínez');
    const previousStepDeadline = Date.now() + 3000;
    while (
      root.querySelector('#active-step-label').textContent !== 'Etapa actual: Triaje'
      && Date.now() < previousStepDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(root.querySelector('#active-step-label').textContent).to.equal('Etapa actual: Triaje');
  });

  it('filters, assigns, persists exams, advances steps, and completes a consultation', async () => {
    const consultationId = 'b8620000-0000-4000-8000-000000000004';
    const backendConsultation = {
      idConsulta: consultationId,
      fechaInicio: '2026-06-01T09:00:00',
      observaciones: JSON.stringify({ historial: [] }),
      examenIds: [],
      idPersonaRol: {
        idPersonaRol: 'assignment-1',
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
        idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
        idRol: { idRol: 'role-1', nombre: 'Médico' },
      },
    };
    fetchStub.callsFake((url, options = {}) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/examenes/all')) {
        return jsonResponse([
          { idExamen: 'exam-image', nombre: 'Radiografía', categoria: 'imagen' },
          { idExamen: 'exam-lab', nombre: 'Hemograma', categoria: 'laboratorio' },
        ]);
      }
      if (options.method === 'PUT') {
        return jsonResponse(backendConsultation);
      }
      return jsonResponse(backendConsultation);
    });

    const consultation = document.createElement('galeno-consulta-activa');
    consultation.consulta = {
      id: consultationId,
      tipo: 'Consulta médica',
      paciente: { id: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
      backendConsulta: backendConsultation,
    };
    document.body.append(consultation);
    const root = consultation.shadowRoot;
    await waitFor(() => root.querySelectorAll('#exam-list input[data-exam-id]').length === 2);

    const assignedEvent = sinon.spy();
    const stepEvent = sinon.spy();
    const finishedEvent = sinon.spy();
    consultation.addEventListener('consulta-examenes-asignados', assignedEvent);
    consultation.addEventListener('consulta-paso-cambiado', stepEvent);
    consultation.addEventListener('consulta-finalizada', finishedEvent);

    root.querySelector('#exam-category').value = 'imagen';
    root.querySelector('#exam-category').dispatchEvent(new Event('change'));
    expect(root.querySelectorAll('#exam-list input[data-exam-id]')).to.have.length(1);
    const exam = root.querySelector('#exam-list input[data-exam-id="exam-image"]');
    exam.checked = true;
    exam.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('#assign-exams').disabled).to.equal(false);
    root.querySelector('#assign-exams').click();

    await waitFor(() => root.querySelector('#save-message').textContent
      === 'Notas guardadas correctamente.');
    expect(assignedEvent.calledOnce).to.equal(true);
    expect(root.querySelector('#assigned-exams').textContent).to.include('Radiografía');
    const firstSave = fetchStub.args.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(firstSave[1].body).examenIds).to.deep.equal(['exam-image']);

    root.querySelector('#next-step').click();
    await waitFor(() => root.querySelector('#active-step-label').textContent
      === 'Etapa actual: Consulta Médica');
    expect(stepEvent.firstCall.args[0].detail.paso).to.equal('Consulta Médica');
    root.querySelector('#consultation-notes').value = 'Evaluación clínica';
    root.querySelector('#consultation-notes').dispatchEvent(new Event('input'));
    root.querySelector('#finish-consultation').click();
    await waitFor(() => root.querySelector('#active-step-label').textContent === 'Etapa actual: Cierre'
      && root.querySelector('#previous-step').disabled);

    expect(finishedEvent.calledOnce).to.equal(true);
    expect(fetchStub.args.some(([, options]) => options?.method === 'PUT'
      && JSON.parse(options.body).fechaFin)).to.equal(true);
    expect(root.querySelector('#assign-exams').disabled).to.equal(true);
  });

  it('renders consultation and exam API failures without enabling writes', async () => {
    fetchStub.rejects(new TypeError('Network unavailable'));
    const consultation = document.createElement('galeno-consulta-activa');
    consultation.setAttribute('route-consultaId', 'missing-consultation');
    document.body.append(consultation);
    const root = consultation.shadowRoot;

    const deadline = Date.now() + 3000;
    while (
      !root.querySelector('#save-message').textContent.includes('No se pudo cargar la consulta')
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(root.querySelector('#save-message').textContent).to.include('No se pudo cargar la consulta');
    expect(root.querySelector('#save-notes').disabled).to.equal(true);
    expect(root.querySelector('#previous-step').disabled).to.equal(true);
  });

  it('downloads the backend PDF Blob from a cita card', async () => {
    fetchStub.resolves(new Response(new Blob(['%PDF'], { type: 'application/pdf' }), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }));
    sandbox.stub(window.URL, 'createObjectURL').returns('blob:galenosv-ticket');
    const anchorClick = sandbox.stub(HTMLAnchorElement.prototype, 'click');
    const revokeSpy = sandbox.spy(window.URL, 'revokeObjectURL');
    const card = document.createElement('cita-card');
    card.cita = {
      id: 'appointment-1',
      fecha: '2026-07-01',
      hora: '09:00',
      clinica: 'Clínica Central',
      procedimientos: ['Consulta'],
    };
    document.body.append(card);
    card.shadowRoot.querySelector('#download-ticket').click();

    const deadline = Date.now() + 3000;
    while (
      card.shadowRoot.querySelector('#ticket-status').textContent !== 'El ticket PDF se descargó correctamente.'
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(fetchStub.calledOnce).to.equal(true);
    expect(window.URL.createObjectURL.calledOnce).to.equal(true);
    expect(anchorClick.calledOnce).to.equal(true);
    expect(card.shadowRoot.querySelector('#ticket-status').textContent)
      .to.equal('El ticket PDF se descargó correctamente.');
    const cleanupDeadline = Date.now() + 2000;
    while (!revokeSpy.calledOnce && Date.now() < cleanupDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(revokeSpy.calledOnce).to.equal(true);
  });

  it('redirects protected SPA routes to login without a backend JWT', async () => {
    const previousHash = window.location.hash;
    localStorage.removeItem('galenosv.authToken');
    const router = document.createElement('galeno-router');
    window.location.hash = '#/empleados/dashboard';
    document.body.append(router);

    const deadline = Date.now() + 3000;
    while (
      (!router.shadowRoot.querySelector('galeno-login') || window.location.hash !== '#/empleados/login')
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(window.location.hash).to.equal('#/empleados/login');
    expect(router.shadowRoot.querySelector('galeno-login')).not.to.equal(null);
    window.location.hash = previousHash;
  });

  it('renders incomplete appointment fields and reports a ticket download error', async () => {
    const card = document.createElement('cita-card');
    card.cita = {
      fecha: 'not-a-date',
      hora: '',
      clinica: '',
      procedimientos: [],
    };
    document.body.append(card);

    const root = card.shadowRoot;
    expect(root.querySelector('#appointment-date').textContent).to.equal('not-a-date');
    expect(root.querySelector('#appointment-time').textContent).to.equal('Hora: Pendiente');
    expect(root.querySelector('#appointment-clinic').textContent).to.equal('Clínica: Pendiente');
    expect(root.querySelector('#appointment-procedures').textContent)
      .to.equal('Procedimientos: por confirmar');

    const ticketError = sinon.spy();
    card.addEventListener('ticket-error', ticketError);
    root.querySelector('#download-ticket').click();
    await waitFor(() => root.querySelector('#download-ticket').disabled === false
      && root.querySelector('#ticket-status').textContent.length > 0);

    expect(fetchStub.called).to.equal(false);
    expect(ticketError.calledOnce).to.equal(true);
    expect(root.querySelector('#ticket-status').textContent)
      .to.equal('La cita no tiene un identificador válido.');
  });

});
