import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import { apiService, resetApiTransport } from '../src/api.service.js';
import { readOfflineQueue, removeQueuedRequest } from '../src/offline-queue.js';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const jwt = (payload) => {
  const encode = (value) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.backend-signature`;
};
const encode = (value) => btoa(JSON.stringify(value))
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

describe('apiService browser suite', () => {
  let sandbox;
  let fetchStub;

  beforeEach(() => {
    localStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.employee');
    resetApiTransport();
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub(window, 'fetch');
  });

  afterEach(() => {
    sandbox.restore();
    resetApiTransport();
    localStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.authToken');
  });

  it('sends login credentials and stores only the JWT returned by the backend', async () => {
    const credentials = { tipoDocumento: 'DUI', numeroDocumento: '00000000-0' };
    const backendToken = jwt({ sub: 'employee-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const employee = {
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
    };
    fetchStub.resolves(jsonResponse({ identityValidated: true, accessToken: backendToken, employee }));

    await apiService.login(credentials);

    const [url, options] = fetchStub.firstCall.args;
    expect(new URL(url).pathname).to.match(/\/auth\/login$/);
    expect(options.method).to.equal('POST');
    expect(options.headers.Accept).to.equal('application/json');
    expect(options.headers['Content-Type']).to.equal('application/json');
    expect(JSON.parse(options.body)).to.deep.equal(credentials);
    expect(localStorage.getItem('galenosv.authToken')).to.equal(backendToken);
    expect(apiService.getEmployeeAssignments()).to.deep.equal(employee.assignments);
    expect(apiService.getCurrentEmployee().nombres).to.equal('Elena');

    fetchStub.resolves(jsonResponse([]));
    await apiService.request('roles/all');
    expect(fetchStub.secondCall.args[1].headers.Authorization)
      .to.equal(`Bearer ${backendToken}`);
  });

  it('rejects login when the backend does not return a valid JWT', async () => {
    fetchStub.resolves(jsonResponse({ identityValidated: true }));

    let thrown;
    try {
      await apiService.login({ tipoDocumento: 'DUI', numeroDocumento: '00000000-0' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.have.property('name', 'ApiServiceError');
    expect(localStorage.getItem('galenosv.authToken')).to.equal(null);
  });

  it('injects an existing localStorage token into the Authorization header', async () => {
    localStorage.setItem('galenosv.authToken', 'test-access-token');
    fetchStub.resolves(jsonResponse([]));

    await apiService.request('roles/all');

    expect(fetchStub.calledOnce).to.equal(true);
    expect(fetchStub.firstCall.args[1].headers.Authorization).to.equal('Bearer test-access-token');
  });

  it('uses a POST body for public appointment search without exposing the document in the URL', async () => {
    fetchStub.resolves(jsonResponse([]));
    const filters = {
      tipoDocumento: 'DUI',
      numeroDocumento: '01234567-8',
      clinica: 'clinic-central',
      desde: '2026-06-01',
      hasta: '2026-06-02',
    };

    await apiService.obtenerCitas(filters);

    const [url, options] = fetchStub.firstCall.args;
    expect(new URL(url).pathname).to.match(/\/citas\/busqueda$/);
    expect(new URL(url).search).to.equal('');
    expect(options.method).to.equal('POST');
    expect(JSON.parse(options.body)).to.deep.equal(filters);
    expect(options.headers['Content-Type']).to.equal('application/json');
  });

  it('maps a consultation by ID using only its persisted workflow history', async () => {
    fetchStub.resolves(jsonResponse({
      idConsulta: 'test-consultation',
      fechaInicio: '2026-06-01T09:00:00',
      observaciones: JSON.stringify({ historial: [
        { paso: 'Triaje', realizadoPor: 'Enfermería', notas: 'Signos vitales', guardadoEn: '2026-06-01T08:30:00Z' },
      ] }),
      idPersonaRol: {
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
        idClinica: { idClinica: 'clinic-1', nombre: 'Clínica Central' },
        idRol: { idRol: 'role-1', nombre: 'Médico' },
      },
    }));

    const consultation = await apiService.obtenerConsulta('test-consultation');

    expect(new URL(fetchStub.firstCall.args[0]).pathname).to.match(/\/consultas\/test-consultation$/);
    expect(consultation.paciente.nombres).to.equal('Elena');
    expect(consultation.pasosPrevios.map(({ nombre }) => nombre)).to.deep.equal(['Triaje']);
    expect(consultation.pasosPrevios[0].completado).to.equal(true);
    expect(consultation.pasosPrevios[0].realizadoPor).to.equal('Enfermería');
    expect(consultation.pasosPrevios[0]).not.to.have.property('simulado');
  });

  it('sends dashboard clinic, role, and date range filters to the backend without a fixed page limit', async () => {
    fetchStub.resolves(jsonResponse([]));

    await apiService.obtenerConsultasDashboard('clinic-1', 'role-1', {
      desde: '2026-11-01',
      hasta: '2026-11-30',
    });

    const url = new URL(fetchStub.firstCall.args[0]);
    expect(url.searchParams.get('idClinica')).to.equal('clinic-1');
    expect(url.searchParams.get('idRol')).to.equal('role-1');
    expect(url.searchParams.get('desde')).to.equal('2026-11-01');
    expect(url.searchParams.get('hasta')).to.equal('2026-11-30');
    expect(url.searchParams.has('max')).to.equal(false);
  });

  it('parses backend zoned timestamps and uses the clinic local date for dashboard consultations', async () => {
    fetchStub.resolves(jsonResponse([{
      idConsulta: 'test-zoned-consultation',
      fechaInicio: '2026-11-16T14:00:00Z[UTC]',
      idPersonaRol: {
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
        idClinica: { idClinica: 'clinic-1', nombre: 'Flor Blanca' },
        idRol: { idRol: 'role-1', nombre: 'Doctor' },
      },
    }]));

    const [consultation] = await apiService.obtenerConsultasDashboard(
      'clinic-1',
      'role-1',
      { desde: '2026-11-16', hasta: '2026-11-18' },
    );

    expect(consultation.fecha).to.equal('2026-11-16');
  });

  it('resolves a stored step author from the authenticated employee ID', async () => {
    sessionStorage.setItem('galenosv.employee', JSON.stringify({
      id: 'employee-1',
      nombres: 'Elena',
      apellidos: 'Martínez',
      assignments: [],
    }));
    fetchStub.resolves(jsonResponse([{
      idConsulta: 'test-authored-consultation',
      fechaInicio: '2026-11-16T14:00:00Z[UTC]',
      observaciones: JSON.stringify({
        historial: [{
          paso: 'Triaje',
          idRealizadoPor: 'employee-1',
          guardadoEn: '2026-11-16T14:00:00Z[UTC]',
        }],
      }),
      idPersonaRol: {
        idPersona: { idPersona: 'person-1', nombres: 'Elena', apellidos: 'Martínez' },
      },
    }]));

    const [consultation] = await apiService.obtenerConsultasDashboard('clinic-1', 'role-1');

    expect(consultation.pasosPrevios[0].realizadoPor).to.equal('Elena Martínez');
  });

  it('sends selected exam IDs in the consultation update instead of saving exam objects in notes', async () => {
    const consultation = {
      id: 'consultation-1',
      backendConsulta: {
        idConsulta: 'consultation-1',
        fechaInicio: '2026-07-01T09:00:00',
        idPersonaRol: { idPersonaRol: 'assignment-1' },
        observaciones: '',
      },
    };
    sessionStorage.setItem('galenosv.employee', JSON.stringify({
      nombres: 'Elena',
      apellidos: 'Martínez',
      assignments: [],
    }));
    fetchStub.resolves(jsonResponse({ idConsulta: 'consultation-1', examenIds: ['exam-1'] }));

    await apiService.guardarAtencionConsulta({
      consulta: consultation,
      consultaId: 'consultation-1',
      paso: 'Consulta Médica',
      notas: 'Evaluación',
      diagnostico: 'Caries dental no especificada',
      plan: 'Tratamiento dental',
      examenes: [{ id: 'exam-1', name: 'Radiografía' }],
    });

    const [url, options] = fetchStub.firstCall.args;
    const payload = JSON.parse(options.body);
    const savedHistory = JSON.parse(payload.observaciones).historial[0];
    expect(new URL(url).pathname).to.match(/\/consultas\/consultation-1$/);
    expect(options.method).to.equal('PUT');
    expect(payload.examenIds).to.deep.equal(['exam-1']);
    expect(JSON.parse(payload.observaciones).examenIds).to.deep.equal(['exam-1']);
    expect(savedHistory.diagnostico).to.equal('Caries dental no especificada');
    expect(savedHistory.realizadoPor).to.equal('Elena Martínez');
    expect(new Date(savedHistory.guardadoEn).toString()).not.to.equal('Invalid Date');
    expect(savedHistory).not.to.have.property('examenes');
    expect(JSON.stringify(payload.observaciones)).not.to.include('Radiografía');
  });

  it('downloads the PDF ticket as a Blob from the backend endpoint', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    fetchStub.resolves(new Response(pdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }));

    const downloaded = await apiService.descargarTicketCita('appointment-1');

    expect(downloaded).to.be.instanceOf(Blob);
    expect(new URL(fetchStub.firstCall.args[0]).pathname).to.match(/\/citas\/appointment-1\/ticket$/);
    expect(fetchStub.firstCall.args[1].headers.Accept).to.equal('application/pdf');
  });

  it('emits a friendly global error and rejects on an HTTP failure', async () => {
    fetchStub.resolves(new Response('<h1>Not found</h1>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    }));
    const listener = sinon.spy();
    document.addEventListener('galeno-api-error', listener, { once: true });

    let thrown;
    try {
      await apiService.request('missing-endpoint');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.have.property('status', 404);
    expect(thrown.message).not.to.include('<h1>');
    expect(listener.calledOnce).to.equal(true);
    expect(listener.firstCall.args[0].detail.status).to.equal(404);
  });

  it('rejects unauthorized and forbidden responses with a friendly message', async () => {
    for (const status of [401, 403]) {
      fetchStub.resetBehavior();
      fetchStub.resolves(jsonResponse({ error: 'request rejected' }, status));

      let thrown;
      try {
        await apiService.request('private-endpoint');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.have.property('status', status);
      expect(thrown.message).to.equal('No tienes autorización para realizar esta operación.');
    }
  });

  it('handles empty and malformed JSON responses without leaking parser errors', async () => {
    fetchStub.onFirstCall().resolves(new Response(null, { status: 204 }));
    fetchStub.onSecondCall().resolves(new Response('{malformed', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    expect((await apiService.request('empty-response')).body).to.equal(null);
    expect((await apiService.request('malformed-json')).body).to.equal('{malformed');
  });

  it('maps exam catalog variants and rejects invalid catalog response shapes', async () => {
    fetchStub.onFirstCall().resolves(jsonResponse([
      { idExamen: 'xray', nombre: 'Radiografía dental', descripcion: 'Imagen', activo: true },
      { idTipoExamen: 'blood', nombreExamen: 'Hemograma', observaciones: 'Laboratorio', activo: true },
      { id: 'other', descripcion: 'Prueba general', categoria: 'laboratorio', activo: true },
      { idExamen: 'inactive', nombre: 'Examen inactivo', activo: false },
    ]));
    const exams = await apiService.obtenerExamenes();
    expect(exams.map(({ id, name, category }) => [id, name, category])).to.deep.equal([
      ['xray', 'Radiografía dental', 'imagen'],
      ['blood', 'Hemograma', 'laboratorio'],
      ['other', 'Prueba general', 'laboratorio'],
    ]);

    fetchStub.onSecondCall().resolves(jsonResponse({ items: [] }));
    let thrown;
    try {
      await apiService.obtenerExamenes();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).to.have.property('name', 'ApiServiceError');
  });

  it('adapts partial consultation records and applies an accent-insensitive patient filter', async () => {
    fetchStub.resolves(jsonResponse([
      {
        idConsulta: 'match',
        fechaInicio: 'invalid-date',
        observaciones: 'nota previa',
        idPersonaRol: { idPersona: { nombres: 'José', apellidos: 'Álvarez' } },
      },
      {
        idConsulta: 'other',
        observaciones: '',
        idPersonaRol: { idPersona: { nombres: 'Lucía', apellidos: 'Pérez' } },
      },
    ]));

    const results = await apiService.obtenerConsultasDashboard('clinic-1', 'role-1', {
      paciente: 'jose alvarez',
    });

    expect(results).to.have.length(1);
    expect(results[0]).to.include({
      id: 'match',
      fecha: '',
      hora: 'Pendiente',
      clinica: '',
      rol: '',
    });
    expect(results[0].pasosPrevios[0].nombre).to.equal('Registro anterior');
    expect(results[0].pasosPrevios[0].notas).to.equal('nota previa');
  });

  it('validates missing consultation identifiers and rejects malformed consultation records', async () => {
    let missingId;
    try {
      await apiService.obtenerConsulta('');
    } catch (error) {
      missingId = error;
    }
    expect(missingId).to.have.property('name', 'ApiServiceError');

    fetchStub.resolves(jsonResponse([]));
    let malformed;
    try {
      await apiService.obtenerConsulta('consultation-1');
    } catch (error) {
      malformed = error;
    }
    expect(malformed).to.have.property('name', 'ApiServiceError');
  });

  it('rejects expired, malformed, and unsupported JWTs and clears stale sessions', () => {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const expired = encode({ sub: 'employee-1', exp: Math.floor(Date.now() / 1000) - 1 });
    localStorage.setItem('galenosv.authToken', `${header}.${expired}.signature`);
    expect(apiService.isAuthenticated()).to.equal(false);
    expect(localStorage.getItem('galenosv.authToken')).to.equal(null);

    localStorage.setItem('galenosv.authToken', 'not-a-jwt');
    expect(apiService.isAuthenticated()).to.equal(false);
    expect(localStorage.getItem('galenosv.authToken')).to.equal(null);

    const unsupportedHeader = encode({ alg: 'none', typ: 'JWT' });
    const currentPayload = encode({ sub: 'employee-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem('galenosv.authToken', `${unsupportedHeader}.${currentPayload}.signature`);
    expect(apiService.isAuthenticated()).to.equal(false);
    expect(localStorage.getItem('galenosv.authToken')).to.equal(null);
  });

  it('queues a consultation update in IndexedDB when fetch fails offline', async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({}) },
    });
    fetchStub.rejects(new TypeError('Network unavailable'));

    try {
      const saved = await apiService.guardarAtencionConsulta({
        consulta: {
          backendConsulta: {
            idConsulta: 'offline-appointment-test',
            idPersonaRol: { idPersonaRol: 'assignment-1' },
            observaciones: '',
          },
        },
        paso: 'Consulta médica',
        notas: 'Guardado offline',
        examenes: [],
      });

      expect(saved.queued).to.equal(true);
      expect(fetchStub.calledOnce).to.equal(true);
      const queued = (await readOfflineQueue()).find(({ url }) => url.endsWith('/consultas/offline-appointment-test'));
      expect(queued).to.exist;
      expect(queued.method).to.equal('PUT');
      expect(JSON.parse(queued.body).observaciones).to.include('Guardado offline');
      await removeQueuedRequest(queued.id);
    } finally {
      if (navigatorDescriptor) {
        Object.defineProperty(navigator, 'serviceWorker', navigatorDescriptor);
      } else {
        delete navigator.serviceWorker;
      }
    }
  });
});
