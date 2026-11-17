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
    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const config = {
      ...options,
      headers,
      signal: options.signal || AbortSignal.timeout(10000) 
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || `Error HTTP: ${response.status}`);
      }

      if (response.status === 204) return null;

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/pdf')) {
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

  get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); }
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }

  async getWithTotal(endpoint) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Error al obtener datos');
    
    const total = response.headers.get('X-Total-Count');
    const data = await response.json();
    return { data, total: total ? parseInt(total, 10) : data.length };
  }
}