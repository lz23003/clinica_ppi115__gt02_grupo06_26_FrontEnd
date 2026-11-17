import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ApiClient } from '../../src/control/api-client.js';
import { AuthService } from '../../src/control/auth-service.js';

describe('Capa Control - Pruebas de Servicios', () => {

  beforeEach(() => {
    // Mock de fetch global
    global.fetch = async (url, options) => {
      if (url.includes('/personas/buscar')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ idPersona: '1', nombres: 'Test', apellidos: 'User' }),
          text: async () => 'ok'
        };
      }
      if (url.includes('/personas-roles/persona/1')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ([{ idRol: { nombre: 'Doctor' } }]),
          text: async () => 'ok'
        };
      }
      // Para cualquier otra ruta
      return { ok: false, status: 404, text: async () => 'Error 404' };
    };
  });

  test('ApiClient.get debe retornar JSON si el fetch es exitoso', async () => {
    const api = new ApiClient('http://test.com');
    const data = await api.get('/personas/buscar');
    
    assert.strictEqual(data.nombres, 'Test');
    assert.strictEqual(data.idPersona, '1');
  });

  test('ApiClient.request debe lanzar un error si el status no es ok', async () => {
    const api = new ApiClient('http://test.com');
    
    await assert.rejects(
      async () => { await api.get('/ruta-inexistente'); },
      /Error 404/
    );
  });

  test('AuthService.login debe validar que el usuario tenga roles de empleado', async () => {
    const authService = new AuthService();
    const res = await authService.login('uuid-tipo-doc', '12345678-9');
    
    assert.ok(res.persona);
    assert.strictEqual(res.persona.nombres, 'Test');
    assert.strictEqual(res.roles.length, 1);
    assert.strictEqual(res.roles[0].idRol.nombre, 'Doctor');
  });

});