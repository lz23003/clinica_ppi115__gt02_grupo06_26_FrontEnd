import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { AuthService } from '../../src/control/auth-service.js';
import { SessionStore } from '../../src/state/session-store.js';

const { describe, it, beforeEach, afterEach } = globalThis;

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(data)
  };
}

describe('Integración: Flujo de Autenticación Empleado (HU2)', () => {
  let storage;

  beforeEach(() => {
    storage = {
      _data: {},
      getItem: sinon.stub().callsFake((key) => storage._data[key] ?? null),
      setItem: sinon.stub().callsFake((key, value) => {
        storage._data[key] = String(value);
      }),
      removeItem: sinon.stub().callsFake((key) => {
        delete storage._data[key];
      })
    };
    globalThis.localStorage = storage;
    globalThis.window = {
      CLINICASV_API_URL: 'http://test.com',
      location: { protocol: 'http:', hostname: 'localhost' }
    };

    sinon.stub(globalThis, 'fetch').callsFake(async (url) => {
      if (url.includes('/personas/buscar')) {
        return jsonResponse({
          idPersona: 'uuid-carlos-123',
          nombres: 'Carlos',
          apellidos: 'Gomez',
          fechaNacimiento: '1990-01-01T00:00:00Z'
        });
      }
      if (url.includes('/personas-roles/persona/uuid-carlos-123')) {
        return jsonResponse([
          {
            idPersonaRol: 'pr-1',
            idRol: { idRol: 'rol-doctor', nombre: 'Doctor' },
            idClinica: { idClinica: 'clinica-1', nombre: 'Clinica Central' }
          }
        ]);
      }
      return {
        ok: false,
        status: 500,
        text: async () => 'Error interno'
      };
    });
  });

  afterEach(() => {
    sinon.restore();
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  it('Debe autenticar a un empleado, obtener sus roles y guardar la sesión correctamente', async () => {
    const authService = new AuthService();
    const resultado = await authService.login('uuid-tipo-dui', '12345678-9');

    expect(resultado.persona.nombres).to.equal('Carlos');
    expect(resultado.roles).to.have.lengthOf(1);
    expect(resultado.roles[0].idRol.nombre).to.equal('Doctor');

    SessionStore.setSession(resultado.persona, resultado.roles);

    const sesionGuardada = SessionStore.getSession();
    expect(sesionGuardada).not.to.equal(null);
    expect(sesionGuardada.persona.idPersona).to.equal('uuid-carlos-123');
    expect(sesionGuardada.roles[0].idClinica.nombre).to.equal('Clinica Central');
    sinon.assert.calledWith(
      storage.setItem,
      'clinicasv_session',
      sinon.match.string
    );
  });

  it('Debe rechazar el acceso si el usuario no tiene roles asignados', async () => {
    globalThis.fetch.resetBehavior();
    globalThis.fetch.callsFake(async (url) => {
      if (url.includes('/personas/buscar')) {
        return jsonResponse({
          idPersona: 'uuid-paciente-sin-rol',
          nombres: 'Pedro',
          apellidos: 'SinRol'
        });
      }
      if (url.includes('/personas-roles/persona/uuid-paciente-sin-rol')) {
        return jsonResponse([]);
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'Error'
      };
    });

    const error = await new AuthService()
      .login('uuid-tipo-dui', '00000000-0')
      .then(() => null, (reason) => reason);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('El usuario no tiene roles asignados');
  });
});
