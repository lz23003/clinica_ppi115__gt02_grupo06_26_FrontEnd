import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { ApiClient } from '../../src/control/api-client.js';
import { AuthService } from '../../src/control/auth-service.js';

const { describe, it, beforeEach, afterEach } = globalThis;

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(data)
  };
}

describe('Capa Control - Pruebas de Servicios', () => {
  beforeEach(() => {
    globalThis.window = {
      CLINICASV_API_URL: 'http://test.com',
      location: { protocol: 'http:', hostname: 'localhost' }
    };

    sinon.stub(globalThis, 'fetch').callsFake(async (url) => {
      if (url.includes('/personas/buscar')) {
        return jsonResponse({
          idPersona: '1',
          nombres: 'Test',
          apellidos: 'User'
        });
      }
      if (url.includes('/personas-roles/persona/1')) {
        return jsonResponse([{ idRol: { nombre: 'Doctor' } }]);
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'Error 404'
      };
    });
  });

  afterEach(() => {
    sinon.restore();
    delete globalThis.window;
  });

  it('ApiClient.get debe retornar JSON si el fetch es exitoso', async () => {
    const api = new ApiClient('http://test.com');
    const data = await api.get('/personas/buscar');

    expect(data.nombres).to.equal('Test');
    expect(data.idPersona).to.equal('1');
  });

  it('ApiClient.get debe permitir solicitar respuestas binarias', async () => {
    globalThis.fetch.resetBehavior();
    globalThis.fetch.callsFake(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' },
      blob: async () => new Blob(['ticket'], { type: 'application/octet-stream' })
    }));
    const api = new ApiClient('http://test.com');

    const pdf = await api.get('/consultas/1/ticket', {
      headers: { Accept: '*/*' },
      responseType: 'blob'
    });

    expect(pdf).to.be.instanceOf(Blob);
    expect(globalThis.fetch.firstCall.args[1].headers.Accept).to.equal('*/*');
    expect(globalThis.fetch.firstCall.args[1]).not.to.have.property('responseType');
  });

  it('ApiClient.request debe lanzar un error si el status no es ok', async () => {
    const api = new ApiClient('http://test.com');
    const error = await api.get('/ruta-inexistente')
      .then(() => null, (reason) => reason);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.match(/Error 404/);
  });

  it('AuthService.login debe validar que el usuario tenga roles de empleado', async () => {
    const authService = new AuthService();
    const res = await authService.login('uuid-tipo-doc', '12345678-9');

    expect(res.persona.nombres).to.equal('Test');
    expect(res.roles).to.have.lengthOf(1);
    expect(res.roles[0].idRol.nombre).to.equal('Doctor');
  });
});
