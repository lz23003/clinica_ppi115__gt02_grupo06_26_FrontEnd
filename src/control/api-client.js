import { connectivity } from '../state/connectivity.js';
import { OfflineError } from './offline-error.js';

function messageFromErrorResponse(body, status) {
  try {
    const payload = JSON.parse(body);
    if (payload.error === 'offline') {
      return 'No hay conexión con el servicio. Revisa tu conexión a internet e inténtalo de nuevo.';
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    if (body.trim()) return body.trim();
  }

  return `No se pudo completar la solicitud (código ${status}).`;
}

function notifyCachedResponse(response) {
  if (response.headers?.get?.('X-From-Cache') !== 'true') return;

  const target = globalThis.window;
  if (!target?.dispatchEvent) return;

  const EventConstructor = globalThis.CustomEvent;
  if (EventConstructor) {
    target.dispatchEvent(new EventConstructor('api-from-cache'));
  } else if (typeof globalThis.Event === 'function') {
    target.dispatchEvent(new Event('api-from-cache'));
  }
}

export class ApiClient {
  constructor(baseUrl = null) {
    if (window.CLINICASV_API_URL) {
      this.baseUrl = window.CLINICASV_API_URL;
    } 
    else if (baseUrl) {
      this.baseUrl = baseUrl;
    } 
    else {
      this.baseUrl = `${window.location.protocol}//${window.location.hostname}:9080/Odontologia_SV-1.0-SNAPSHOT/api/v1`;
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const { responseType, ...requestOptions } = options;
    const method = (requestOptions.method || 'GET').toUpperCase();
    if (method !== 'GET' && !connectivity.isOnline()) {
      throw new OfflineError();
    }

    const headers = {
      'Accept': 'application/json',
      ...requestOptions.headers
    };

    if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const config = {
      ...requestOptions,
      headers,
      signal: requestOptions.signal || AbortSignal.timeout(10000)
    };

    try {
      let response;
      try {
        response = await fetch(url, config);
      } catch (error) {
        if (error instanceof TypeError && !connectivity.isOnline()) {
          throw new OfflineError();
        }
        throw error;
      }

      notifyCachedResponse(response);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(messageFromErrorResponse(errorData, response.status));
      }

      if (response.status === 204) return null;

      const contentType = response.headers?.get?.('content-type');
      if (responseType === 'blob' || (contentType && contentType.includes('application/pdf'))) {
        return await response.blob();
      }

            const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new Error('La petición tardó demasiado tiempo.');
      }
      throw error;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); }
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }

  async getWithTotal(endpoint) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    notifyCachedResponse(response);
    if (!response.ok) throw new Error('Error al obtener datos');
    
    const total = response.headers.get('X-Total-Count');
    const data = await response.json();
    return { data, total: total ? parseInt(total, 10) : data.length };
  }
}