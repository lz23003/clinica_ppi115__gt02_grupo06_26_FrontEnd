import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { SessionStore } from '../../src/state/session-store.js';

const { describe, it, beforeEach, afterEach } = globalThis;

describe('SessionStore: contexto y consulta activa', () => {
  let data;
  let storage;

  beforeEach(() => {
    data = new Map();
    storage = {
      getItem: sinon.stub().callsFake((key) => data.get(key) ?? null),
      setItem: sinon.stub().callsFake((key, value) => data.set(key, String(value))),
      removeItem: sinon.stub().callsFake((key) => data.delete(key))
    };
    globalThis.localStorage = storage;
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('guarda y recupera el contexto de clínica y rol', () => {
    const context = { idClinica: 'clinic-1', idRol: 'role-1', nombreRol: 'Doctor' };
    SessionStore.setContext(context);
    expect(SessionStore.getContext()).to.deep.equal(context);
  });

  it('limpia el contexto de forma independiente', () => {
    SessionStore.setContext({ idClinica: 'clinic-1', idRol: 'role-1', nombreRol: 'Doctor' });
    SessionStore.clearContext();
    expect(SessionStore.getContext()).to.equal(null);
  });

  it('guarda, recupera y limpia la consulta activa', () => {
    SessionStore.setConsultaActiva('consulta-1');
    expect(SessionStore.getConsultaActiva()).to.equal('consulta-1');
    SessionStore.clearConsultaActiva();
    expect(SessionStore.getConsultaActiva()).to.equal(null);
  });

  it('retorna null para JSON corrupto', () => {
    data.set('clinicasv_context', '{invalid');
    data.set('clinicasv_session', '{invalid');
    expect(SessionStore.getContext()).to.equal(null);
    expect(SessionStore.getSession()).to.equal(null);
  });

  it('clear elimina sesión, contexto y consulta activa', () => {
    SessionStore.setSession({ idPersona: 'persona-1' }, []);
    SessionStore.setContext({ idClinica: 'clinic-1', idRol: 'role-1', nombreRol: 'Doctor' });
    SessionStore.setConsultaActiva('consulta-1');
    SessionStore.clear();
    expect(SessionStore.getSession()).to.equal(null);
    expect(SessionStore.getContext()).to.equal(null);
    expect(SessionStore.getConsultaActiva()).to.equal(null);
  });
});
