import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// Importamos las capas que vamos a integrar
import { AuthService } from '../../src/control/auth-service.js';
import { SessionStore } from '../../src/state/session-store.js';

describe('Integración: Flujo de Autenticación Empleado (HU2)', () => {

  // 1. Configuramos los mocks antes de cada prueba
  beforeEach(() => {
    // Mock de localStorage
    global.localStorage = {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; }
    };

    // Mock de fetch (Simulamos las respuestas del backend Jakarta EE)
    global.fetch = async (url, options) => {
      // Simulamos la búsqueda por documento
      if (url.includes('/personas/buscar')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            idPersona: 'uuid-carlos-123',
            nombres: 'Carlos',
            apellidos: 'Gomez',
            fechaNacimiento: '1990-01-01T00:00:00Z'
          })
        };
      }
      // Simulamos la búsqueda de roles de esa persona
      if (url.includes('/personas-roles/persona/uuid-carlos-123')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ([
            {
              idPersonaRol: 'pr-1',
              idRol: { idRol: 'rol-doctor', nombre: 'Doctor' },
              idClinica: { idClinica: 'clinica-1', nombre: 'Clinica Central' }
            }
          ])
        };
      }
      
      // Simulamos que no se encuentra el documento (para el test de error)
      if (url.includes('/personas/buscar')) {
        return {
          ok: false,
          status: 404,
          text: async () => "No se encontró la persona"
        };
      }

      return { ok: false, status: 500, text: async () => 'Error interno' };
    };
  });

  // 2. Las pruebas de integración
  test('Debe autenticar a un empleado, obtener sus roles y guardar la sesión correctamente', async () => {
    // Paso 1: Instanciamos los servicios
    const authService = new AuthService();

    // Paso 2: Ejecutamos el login (esto internamente llama a ApiClient -> fetch)
    const resultado = await authService.login('uuid-tipo-dui', '12345678-9');

    // Paso 3: Validamos que el AuthService devolvió los datos correctos
    assert.strictEqual(resultado.persona.nombres, 'Carlos');
    assert.strictEqual(resultado.roles.length, 1);
    assert.strictEqual(resultado.roles[0].idRol.nombre, 'Doctor');

    // Paso 4: Simulamos que el ViewLogin guarda la sesión en el SessionStore
    SessionStore.setSession(resultado.persona, resultado.roles);

    // Paso 5: Validamos que el SessionStore efectivamente guardó todo en el localStorage
    const sesionGuardada = SessionStore.getSession();
    assert.ok(sesionGuardada);
    assert.strictEqual(sesionGuardada.persona.idPersona, 'uuid-carlos-123');
    assert.strictEqual(sesionGuardada.roles[0].idClinica.nombre, 'Clinica Central');
  });

  test('Debe rechazar el acceso si el usuario no tiene roles asignados', async () => {
    // Modificamos el mock para que devuelva una lista de roles vacía
    global.fetch = async (url) => {
      if (url.includes('/personas/buscar')) {
        return {
          ok: true, status: 200, headers: { get: () => 'application/json' },
          json: async () => ({ idPersona: 'uuid-paciente-sin-rol', nombres: 'Pedro', apellidos: 'SinRol' })
        };
      }
      if (url.includes('/personas-roles/persona/uuid-paciente-sin-rol')) {
        return {
          ok: true, status: 200, headers: { get: () => 'application/json' },
          json: async () => ([]) // Lista vacía
        };
      }
      return { ok: false, status: 404, text: async () => 'Error' };
    };

    const authService = new AuthService();
    
    // Validamos que el servicio lance el error esperado
    await assert.rejects(
      async () => { await authService.login('uuid-tipo-dui', '00000000-0'); },
      /El usuario no tiene roles asignados/
    );
  });

});