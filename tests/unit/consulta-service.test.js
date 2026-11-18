import { expect } from '../js/lib/chai/index.js';
import sinon from '../js/lib/sinon/sinon-esm.js';
import { ConsultaService } from '../../src/control/consulta-service.js';
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

describe('ConsultaService', () => {
  let service;

  beforeEach(() => {
    globalThis.window = {
      CLINICASV_API_URL: 'http://test.local/api/v1',
      location: { protocol: 'http:', hostname: 'localhost' }
    };
    service = new ConsultaService();
    service.api = new ApiClient('http://test.local/api/v1');
  });

  afterEach(() => {
    sinon.restore();
    delete globalThis.window;
  });

  it('obtiene el detalle por consulta con la ruta existente', async () => {
    sinon.stub(globalThis, 'fetch').resolves(response({ idConsulta: 'c1', paciente: {} }));
    await service.obtenerDetalle('c1');
    expect(globalThis.fetch.firstCall.args[0]).to.equal(
      'http://test.local/api/v1/consultas/c1/detalle-completo'
    );
    expect(globalThis.fetch.firstCall.args[1].method).to.equal('GET');
  });

  it('obtiene procedimientos desde el detalle completo, sin inventar una ruta filtrada', async () => {
    sinon.stub(globalThis, 'fetch').resolves(response({
      procedimientos: [{ idConsultaProcedimiento: 'cp1' }]
    }));
    const result = await service.obtenerProcedimientos('c1');
    expect(result).to.deep.equal([{ idConsultaProcedimiento: 'cp1' }]);
    expect(globalThis.fetch.firstCall.args[0]).to.include('/consultas/c1/detalle-completo');
  });

  it('finaliza la consulta mediante PUT al endpoint verificado', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(response({ idConsulta: 'c1' }));
    await service.finalizar('c1');
    expect(fetchStub.firstCall.args[0]).to.equal('http://test.local/api/v1/consultas/c1/finalizar');
    expect(fetchStub.firstCall.args[1].method).to.equal('PUT');
    expect(fetchStub.firstCall.args[1].body).to.equal('{}');
  });
});
