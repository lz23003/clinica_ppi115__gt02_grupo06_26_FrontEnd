import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { ExamenService } from '../../src/control/examen-service.js';
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

describe('ExamenService', () => {
  let service;

  beforeEach(() => {
    globalThis.window = {
      CLINICASV_API_URL: 'http://test.local/api/v1',
      location: { protocol: 'http:', hostname: 'localhost' }
    };
    service = new ExamenService();
    service.api = new ApiClient('http://test.local/api/v1');
  });

  afterEach(() => {
    sinon.restore();
    delete globalThis.window;
  });

  it('consulta las órdenes por paso con el endpoint backend', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(response([]));
    await service.obtenerOrdenesDePaso('step-1');
    expect(fetchStub.firstCall.args[0]).to.equal('http://test.local/api/v1/ordenes-examen/por-paso/step-1');
    expect(fetchStub.firstCall.args[1].method).to.equal('GET');
  });

  it('borra las órdenes anteriores y crea una orden por examen', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onCall(0).resolves(response([{ idOrdenExamen: 'old-1' }]));
    fetchStub.onCall(1).resolves(response(null, 204));
    fetchStub.onCall(2).resolves(response({ idOrdenExamen: 'new-1' }, 201));
    await service.reemplazarOrdenes('step-1', [{ idExamen: 'exam-1', nombre: 'Hemograma' }]);

    expect(fetchStub.getCall(1).args[0]).to.equal('http://test.local/api/v1/ordenes-examen/old-1');
    expect(fetchStub.getCall(1).args[1].method).to.equal('DELETE');
    expect(fetchStub.getCall(2).args[0]).to.equal('http://test.local/api/v1/ordenes-examen');
    expect(fetchStub.getCall(2).args[1].method).to.equal('POST');
    const body = JSON.parse(fetchStub.getCall(2).args[1].body);
    expect(body.idConsultaProcedimientoPaso.idConsultaProcedimientoPaso).to.equal('step-1');
    expect(body.indicaciones).to.equal('EXAMEN:exam-1|NOMBRE:Hemograma');
  });

  it('reporta las operaciones que fallan parcialmente', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onCall(0).resolves(response([{ idOrdenExamen: 'old-1' }]));
    fetchStub.onCall(1).resolves(response(null, 204));
    fetchStub.onCall(2).rejects(new TypeError('fallo de red'));
    fetchStub.onCall(3).resolves(response({ idOrdenExamen: 'new-2' }, 201));

    const error = await service.reemplazarOrdenes('step-1', [
      { idExamen: 'exam-1', nombre: 'Hemograma' },
      { idExamen: 'exam-2', nombre: 'Glucosa' }
    ]).then(() => null, (reason) => reason);
    expect(error.fallos).to.have.lengthOf(1);
    expect(error.fallos[0]).to.deep.include({ operation: 'create', id: 'exam-1' });
  });
});
