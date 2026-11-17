import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { SessionStore } from '../../src/state/session-store.js';

const { describe, it, beforeEach, afterEach } = globalThis;

describe('Capa State - SessionStore', () => {
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
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('setSession debe guardar los datos en localStorage', () => {
    const persona = { idPersona: '1', nombres: 'Luis' };
    const roles = [{ idRol: 'doc' }];

    SessionStore.setSession(persona, roles);

    const stored = globalThis.localStorage.getItem('clinicasv_session');
    expect(stored).to.be.a('string');
    const parsed = JSON.parse(stored);
    expect(parsed.persona.nombres).to.equal('Luis');
    expect(parsed.roles).to.have.lengthOf(1);
    sinon.assert.calledWith(
      storage.setItem,
      'clinicasv_session',
      JSON.stringify({ persona, roles })
    );
  });

  it('getSession debe retornar null si no hay sesión', () => {
    expect(SessionStore.getSession()).to.equal(null);
  });

  it('getSession debe retornar los datos correctos si ya existe sesión', () => {
    SessionStore.setSession({ idPersona: '99', nombres: 'Maria' }, []);

    const session = SessionStore.getSession();
    expect(session.persona.idPersona).to.equal('99');
  });

  it('clear debe eliminar la sesión del localStorage', () => {
    SessionStore.setSession({ idPersona: '1' }, []);
    SessionStore.clear();

    expect(SessionStore.getSession()).to.equal(null);
    sinon.assert.calledWith(storage.removeItem, 'clinicasv_session');
  });
});
