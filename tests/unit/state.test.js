import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SessionStore } from '../../src/state/session-store.js';

describe('Capa State - SessionStore', () => {
  
  // Mock de localStorage para Node.js
  beforeEach(() => {
    global.localStorage = {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; }
    };
  });

  test('setSession debe guardar los datos en localStorage', () => {
    const persona = { idPersona: '1', nombres: 'Luis' };
    const roles = [{ idRol: 'doc' }];
    
    SessionStore.setSession(persona, roles);
    
    const stored = global.localStorage.getItem('clinicasv_session');
    assert.ok(stored);
    
    const parsed = JSON.parse(stored);
    assert.strictEqual(parsed.persona.nombres, 'Luis');
    assert.strictEqual(parsed.roles.length, 1);
  });

  test('getSession debe retornar null si no hay sesión', () => {
    const session = SessionStore.getSession();
    assert.strictEqual(session, null);
  });

  test('getSession debe retornar los datos correctos si ya existe sesión', () => {
    const persona = { idPersona: '99', nombres: 'Maria' };
    SessionStore.setSession(persona, []);
    
    const session = SessionStore.getSession();
    assert.strictEqual(session.persona.idPersona, '99');
  });

  test('clear debe eliminar la sesión del localStorage', () => {
    SessionStore.setSession({ idPersona: '1' }, []);
    SessionStore.clear();
    
    const session = SessionStore.getSession();
    assert.strictEqual(session, null);
  });

});