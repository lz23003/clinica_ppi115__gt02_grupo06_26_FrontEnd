import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { PasoService } from '../../src/control/paso-service.js';
import { ApiClient } from '../../src/control/api-client.js';

const { describe, it, beforeEach, afterEach } = globalThis;

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => data === null ? '' : JSON.stringify(data)
  };
}

describe('PasoService', () => {
  let service;

  beforeEach(() => {
    globalThis.window = {
      CLINICASV_API_URL: 'http://test.local/api/v1',
      location: { protocol: 'http:', hostname: 'localhost' }
    };
    service = new PasoService();
    service.api = new ApiClient('http://test.local/api/v1');
  });

  afterEach(() => {
    sinon.restore();
    delete globalThis.window;
  });

  it('consulta pasos de plantilla y pasos ejecutados con rutas disponibles', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(response([]));
    await service.obtenerPasosDeProcedimiento('proc-1');
    await service.obtenerEjecutados('cp-1');
    expect(fetchStub.firstCall.args[0]).to.include('/procedimientos-pasos/procedimiento/proc-1');
    expect(fetchStub.secondCall.args[0]).to.include('/consultas-procedimientos-pasos/consulta/cp-1');
  });

  it('guarda el texto en el query param requerido actualmente por el backend', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(response({}));
    await service.guardarValor('step-1', 'nota con & y /');
    expect(fetchStub.firstCall.args[0]).to.include(
      '/consultas-procedimientos-pasos/step-1/valor?valor=nota%20con%20%26%20y%20%2F'
    );
    expect(fetchStub.firstCall.args[1].method).to.equal('PUT');
    expect(fetchStub.firstCall.args[1].body).to.equal('{}');
  });

  it('avanza y retrocede con POST y los nombres de query params del backend', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(response({}));
    await service.avanzar('cp-1', 'actual-1', 'siguiente-1');
    await service.retroceder('cp-1', 'actual-1', 'anterior-1');
    expect(fetchStub.firstCall.args[0]).to.include(
      '/siguiente/cp-1?idSiguientePaso=siguiente-1&idPasoActual=actual-1'
    );
    expect(fetchStub.secondCall.args[0]).to.include(
      '/retroceder/cp-1?idPasoAnterior=anterior-1&idPasoActual=actual-1'
    );
    expect(fetchStub.firstCall.args[1].method).to.equal('POST');
    expect(fetchStub.secondCall.args[1].method).to.equal('POST');
  });
});
