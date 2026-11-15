const API_BASE = new URL(
  document.querySelector('meta[name="api-base-url"]')?.content?.trim() || './api/v1',
  document.baseURI,
);
const API_ENDPOINTS = Object.freeze(Object.fromEntries(
  Object.entries({
    login: 'auth/login',
    citas: 'citas/busqueda',
    consultas: 'consultas',
    examenes: 'examenes/all',
    clinicas: 'clinicas/all',
    roles: 'roles/all',
    personas: 'personas',
    ticket: 'citas',
  }).map(([name, fallback]) => [
    name,
    document.querySelector(`meta[name="api-endpoint-${name}"]`)?.content?.trim() || fallback,
  ]),
));

let transport = (...args) => fetch(...args);
let offlineQueueModule;

const endpointUrl = (path) => path instanceof URL
  ? path
  : new URL(path.replace(/^\/+/, ''), `${API_BASE.href.replace(/\/+$/, '')}/`);
const isNetworkFailure = (error) => error instanceof TypeError || !navigator.onLine;

const readResponse = async (response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
};

const friendlyMessage = (body, status) => {
  if (typeof body === 'string' && body.trim() && !body.trim().startsWith('<')) return body;
  if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
  if (status === 401 || status === 403) return 'No tienes autorización para realizar esta operación.';
  if (status === 404) return 'El backend no tiene disponible este endpoint.';
  return `La solicitud al servicio falló (HTTP ${status}).`;
};

const getStoredToken = () => localStorage.getItem('galenosv.authToken');
const EMPLOYEE_SESSION_KEY = 'galenosv.employee';

const readStoredEmployee = () => {
  try {
    const employee = JSON.parse(sessionStorage.getItem(EMPLOYEE_SESSION_KEY) || 'null');
    return employee && Array.isArray(employee.assignments) ? employee : null;
  } catch {
    return null;
  }
};

const isTokenCurrent = (token = getStoredToken()) => {
  if (!token || typeof token !== 'string') return false;
  try {
    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) return false;
    const header = JSON.parse(atob(headerPart.replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    return header.alg === 'HS256'
      && header.typ === 'JWT'
      && Number.isFinite(payload.exp)
      && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export class ApiServiceError extends Error {
  constructor(message, { status = 0, url = '', cause } = {}) {
    super(message, { cause });
    this.name = 'ApiServiceError';
    this.status = status;
    this.url = url;
  }
}

export function setApiTransport(nextTransport) {
  if (typeof nextTransport !== 'function') {
    throw new TypeError('El transporte de API debe ser una función.');
  }
  transport = nextTransport;
}

export function resetApiTransport() {
  transport = (...args) => fetch(...args);
}

export const apiService = Object.freeze({
  isAuthenticated() {
    const token = getStoredToken();
    if (isTokenCurrent(token)) return true;
    if (token) localStorage.removeItem('galenosv.authToken');
    return false;
  },

  logout() {
    localStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem('galenosv.authToken');
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_API_CACHE' });
  },

  getCurrentEmployee() {
    return readStoredEmployee();
  },

  getEmployeeAssignments() {
    return readStoredEmployee()?.assignments || [];
  },

  async request(path, { method = 'GET', body, headers = {}, queueIfOffline = false } = {}) {
    const url = endpointUrl(path);
    const token = localStorage.getItem('galenosv.authToken')
      || sessionStorage.getItem('galenosv.authToken');
    const requestHeaders = {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    };
    const options = {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };

    try {
      const response = await transport(url, options);
      const responseBody = await readResponse(response);
      if (!response.ok) {
        const apiError = new ApiServiceError(friendlyMessage(responseBody, response.status), {
          status: response.status,
          url: url.href,
        });
        document.dispatchEvent(new CustomEvent('galeno-api-error', {
          detail: { message: apiError.message, method, url: url.href, status: response.status },
        }));
        throw apiError;
      }
      return { body: responseBody, response };
    } catch (error) {
      if (queueIfOffline && isNetworkFailure(error)) {
        try {
          offlineQueueModule ||= await import('./offline-queue.js');
          await offlineQueueModule.enqueueOfflineRequest({
            url: url.href,
            method,
            headers: requestHeaders,
            body: options.body,
          });
          await requestBackgroundSync();
          return {
            body: { queued: true, message: 'Guardado localmente; se sincronizará al recuperar la conexión.' },
            response: new Response(null, { status: 202 }),
          };
        } catch (queueError) {
          throw new ApiServiceError('No se pudo guardar la operación sin conexión. No cierres esta pantalla e inténtalo de nuevo.', {
            url: url.href,
            cause: queueError,
          });
        }
      }
      if (error instanceof ApiServiceError) throw error;

      const apiError = new ApiServiceError(
        'No se pudo conectar con el backend. Verifica la conexión y la URL configurada.',
        { url: url.href, cause: error },
      );
      document.dispatchEvent(new CustomEvent('galeno-api-error', {
        detail: { message: apiError.message, method, url: url.href },
      }));
      throw apiError;
    }
  },

  async login(credenciales) {
    const { body } = await this.request(API_ENDPOINTS.login, {
      method: 'POST',
      body: credenciales,
    });
    const token = body?.accessToken || body?.token || body?.jwt;
    if (!body?.identityValidated
      || !isTokenCurrent(token)
      || !body.employee
      || !Array.isArray(body.employee.assignments)
      || body.employee.assignments.length === 0) {
      this.logout();
      throw new ApiServiceError('El backend no devolvió una sesión válida con asignaciones de empleado.');
    }
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_API_CACHE' });
    localStorage.setItem('galenosv.authToken', token);
    sessionStorage.removeItem('galenosv.authToken');
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(body.employee));
    return body;
  },

  async descargarTicketCita(citaId) {
    if (!citaId) throw new ApiServiceError('La cita no tiene un identificador válido.');
    const url = endpointUrl(`${API_ENDPOINTS.ticket}/${encodeURIComponent(citaId)}/ticket`);
    const token = getStoredToken();
    let response;
    try {
      response = await transport(url, {
        method: 'GET',
        headers: {
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (error) {
      throw new ApiServiceError('No se pudo conectar con el servicio de tickets.', {
        url: url.href,
        cause: error,
      });
    }
    if (!response.ok) {
      throw new ApiServiceError(
        `No se pudo generar el ticket (HTTP ${response.status}).`,
        { status: response.status, url: url.href },
      );
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) {
      throw new ApiServiceError('El backend no devolvió un documento PDF.', { url: url.href });
    }
    return response.blob();
  },

  async obtenerCitas(filtros) {
    const url = endpointUrl(API_ENDPOINTS.citas);
    const { body } = await this.request(url, { method: 'POST', body: filtros });
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de citas devolvió un formato inesperado.', { url: url.href });
    return body;
  },

  async obtenerConsultasDashboard(clinica, rol, filtros = {}) {
    const url = endpointUrl(API_ENDPOINTS.consultas);
    const clinicId = typeof clinica === 'object' ? clinica?.idClinica : clinica;
    const roleId = typeof rol === 'object' ? rol?.idRol : rol;
    if (clinicId) url.searchParams.set('idClinica', clinicId);
    if (roleId) url.searchParams.set('idRol', roleId);
    if (filtros.desde) url.searchParams.set('desde', filtros.desde);
    if (filtros.hasta) url.searchParams.set('hasta', filtros.hasta);
    const { body } = await this.request(url);
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de consultas devolvió un formato inesperado.', { url: url.href });

    const query = normalize(filtros.paciente || '');
    return body
      .map(adaptConsulta)
      .filter((consulta) => {
        const name = normalize(`${consulta.paciente.nombres} ${consulta.paciente.apellidos}`);
        const nameMatches = !query || name.includes(query);
        return nameMatches;
      });
  },

  async obtenerConsulta(id) {
    if (!id) throw new ApiServiceError('Falta el identificador de la consulta.');
    const url = `consultas/${encodeURIComponent(id)}`;
    const { body } = await this.request(url);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiServiceError('El servicio de consultas devolvió un registro inesperado.');
    }
    return adaptConsulta(body);
  },

  async obtenerExamenes() {
    const { body } = await this.request(API_ENDPOINTS.examenes);
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de exámenes devolvió un formato inesperado.');
    return body.map((examen) => ({
      ...examen,
      id: examen.idExamen || examen.id || examen.idTipoExamen,
      name: examen.nombre || examen.descripcion || examen.nombreExamen || 'Examen',
      description: examen.descripcion || examen.observaciones || '',
      category: normalize(`${examen.categoria || ''} ${examen.tipo || ''} ${examen.nombre || ''}`)
        .match(/imagen|radiograf|rayos x/)
        ? 'imagen'
        : 'laboratorio',
    }));
  },

  async obtenerClinicas() {
    const { body } = await this.request(API_ENDPOINTS.clinicas);
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de clínicas devolvió un formato inesperado.');
    return body;
  },

  async obtenerRoles() {
    const { body } = await this.request(API_ENDPOINTS.roles);
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de roles devolvió un formato inesperado.');
    return body;
  },

  async guardarAtencionConsulta(datosConsulta) {
    let consultation = datosConsulta.consulta?.backendConsulta
      || datosConsulta.consultaRest
      || datosConsulta.consulta;
    const id = consultation?.idConsulta || datosConsulta.consultaId;
    if (!id) throw new ApiServiceError('Falta el identificador de la consulta que se desea guardar.');
    if (!consultation.idPersonaRol) {
      const { body } = await this.request(`consultas/${encodeURIComponent(id)}`);
      if (!body || typeof body !== 'object') {
        throw new ApiServiceError('No se pudo recuperar el registro original de la consulta.');
      }
      consultation = body;
    }

    let attendanceHistory = [];
    if (consultation.observaciones) {
      try {
        const previous = JSON.parse(consultation.observaciones);
        if (Array.isArray(previous.historial)) attendanceHistory = previous.historial;
        else attendanceHistory = [{ paso: 'Registro anterior', notas: consultation.observaciones }];
      } catch {
        attendanceHistory = [{ paso: 'Registro anterior', notas: consultation.observaciones }];
      }
    }
    attendanceHistory = attendanceHistory.filter((entry) => entry && typeof entry === 'object');
    const employee = readStoredEmployee();
    const employeeName = [employee?.nombres, employee?.apellidos]
      .filter((name) => typeof name === 'string' && name.trim())
      .join(' ');
    const newEntry = {
      notas: datosConsulta.notas || '',
      diagnostico: datosConsulta.diagnostico || '',
      plan: datosConsulta.plan || '',
      paso: datosConsulta.paso || '',
      guardadoEn: new Date().toISOString(),
      realizadoPor: employeeName || 'Empleado autenticado',
      ...(employee?.id ? { idRealizadoPor: employee.id } : {}),
    };
    const previousStepIndex = attendanceHistory.findIndex((entry) => entry.paso === newEntry.paso);
    if (previousStepIndex >= 0) attendanceHistory[previousStepIndex] = newEntry;
    else attendanceHistory.push(newEntry);

    const body = {
      idConsulta: id,
      observaciones: JSON.stringify({ historial: attendanceHistory }),
      examenIds: (datosConsulta.examenes || [])
        .map((exam) => typeof exam === 'string' ? exam : exam.id)
        .filter(Boolean),
      ...(datosConsulta.finalizar ? { fechaFin: new Date().toISOString() } : {}),
    };
    const { body: saved } = await this.request(`consultas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
      queueIfOffline: true,
    });
    if (saved && typeof saved === 'object') {
      consultation.examenIds = body.examenIds;
      consultation.observaciones = body.observaciones;
      if (body.fechaFin) consultation.fechaFin = body.fechaFin;
    }
    return saved;
  },

  async obtenerPendientesOffline() {
    offlineQueueModule ||= await import('./offline-queue.js');
    return offlineQueueModule.countQueuedRequests();
  },

  async sincronizarPendientesOffline() {
    offlineQueueModule ||= await import('./offline-queue.js');
    return offlineQueueModule.flushOfflineQueue(transport);
  },
});

export const personaApi = Object.freeze({
  async list({ first = 0, max = 50 } = {}) {
    const url = endpointUrl(API_ENDPOINTS.personas);
    url.search = new URLSearchParams({ first: String(first), max: String(max) });
    const { body, response } = await apiService.request(url);
    if (!Array.isArray(body)) throw new ApiServiceError('El servicio de personas devolvió un listado inesperado.');
    return {
      personas: body,
      total: Number(response.headers.get('X-Total-Count')) || first + body.length,
    };
  },

  async create(persona) {
    const { body } = await apiService.request(API_ENDPOINTS.personas, {
      method: 'POST',
      body: persona,
    });
    return body;
  },

  async update(id, persona) {
    const { body } = await apiService.request(
      `${API_ENDPOINTS.personas}/${encodeURIComponent(id)}`,
      { method: 'PUT', body: persona },
    );
    return body;
  },

  async remove(id) {
    await apiService.request(
      `${API_ENDPOINTS.personas}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },
});

export async function requestBackgroundSync() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!('sync' in registration)) return false;
    await registration.sync.register('galenosv-outbox');
    return true;
  } catch (error) {
    console.warn('Background Sync no está disponible; se usará la sincronización al recuperar la conexión.', error);
    return false;
  }
}

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es');

const getPreviousSteps = (consulta) => {
  if (!consulta.observaciones) return [];
  try {
    const parsed = JSON.parse(consulta.observaciones);
    if (Array.isArray(parsed.historial)) {
      return parsed.historial.filter((entry) => entry && typeof entry === 'object').map((entry) => ({
        nombre: entry.paso || entry.nombre || 'Paso sin nombre',
        realizadoPor: entry.realizadoPor || '',
        completado: Boolean(entry.completado ?? entry.guardadoEn),
        ...(entry.guardadoEn ? { guardadoEn: entry.guardadoEn } : {}),
        ...(entry.notas ? { notas: entry.notas } : {}),
      }));
    }
  } catch {
    return [{
      nombre: 'Registro anterior',
      realizadoPor: '',
      completado: true,
      notas: consulta.observaciones,
    }];
  }
  return [];
};

const adaptConsulta = (consulta) => {
  const personRole = consulta.idPersonaRol || {};
  const person = personRole.idPersona || {};
  const clinic = personRole.idClinica || {};
  const role = personRole.idRol || {};
  const start = consulta.fechaInicio ? new Date(consulta.fechaInicio) : null;
  const validStart = start && !Number.isNaN(start.getTime());
  const iso = validStart ? start.toISOString() : '';

  return {
    id: consulta.idConsulta,
    fecha: iso.slice(0, 10),
    hora: validStart ? new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit' }).format(start) : 'Pendiente',
    tipo: consulta.referenciaExterna || 'Consulta médica',
    paciente: {
      nombres: person.nombres || 'Paciente',
      apellidos: person.apellidos || '',
      fechaNacimiento: person.fechaNacimiento || '',
      id: person.idPersona || '—',
    },
    clinica: clinic.nombre || '',
    clinicaId: clinic.idClinica || '',
    rol: role.nombre || '',
    rolId: role.idRol || '',
    pasosPrevios: getPreviousSteps(consulta),
    backendConsulta: consulta,
  };
};
