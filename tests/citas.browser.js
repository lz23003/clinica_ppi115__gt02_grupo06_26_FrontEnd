import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import '../src/components/citas.component.js';
import { resetApiTransport } from '../src/api.service.js';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate(), 'condition did not become true before timeout').to.equal(true);
};

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

describe('galeno-citas', () => {
  let sandbox;
  let fetchStub;
  let component;

  beforeEach(() => {
    resetApiTransport();
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub(window, 'fetch');
    component = document.createElement('galeno-citas');
  });

  afterEach(() => {
    sandbox.restore();
    resetApiTransport();
    component?.remove();
  });

  it('loads clinics asynchronously and renders a successful appointment search', async () => {
    fetchStub.callsFake((url) => new URL(url).pathname.endsWith('/clinicas/activas')
      ? jsonResponse([
        { idClinica: 'clinic-1', nombre: 'Clínica Central', activo: true },
        { idClinica: 'clinic-inactive', nombre: 'Clínica cerrada', activo: false },
      ])
      : jsonResponse([{
        idCita: 'appointment-1',
        fecha: today(),
        hora: '09:30',
        clinica: 'Clínica Central',
        procedimientos: ['Consulta general'],
      }]));
    document.body.append(component);

    await waitFor(() => component.shadowRoot.querySelector('#clinic').options.length === 2);
    const root = component.shadowRoot;
    expect([...root.querySelector('#clinic').options].map(({ textContent }) => textContent))
      .to.deep.equal(['Selecciona una clínica', 'Clínica Central']);
    root.querySelector('#document-number').value = '01234567-8';
    root.querySelector('#clinic').value = 'clinic-1';
    root.querySelector('#date-from').value = '2020-01-01';
    root.querySelector('#date-to').value = '2020-01-31';
    expect(root.querySelector('#date-from').min).to.equal('');
    expect(root.querySelector('#date-to').min).to.equal('');

    const searchEvent = sinon.spy();
    const resultEvent = sinon.spy();
    component.addEventListener('citas-search', searchEvent);
    component.addEventListener('citas-results', resultEvent);
    root.querySelector('#search-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    await waitFor(() => root.querySelector('#result-count').textContent === '1 cita encontrada');
    expect(searchEvent.calledOnce).to.equal(true);
    expect(searchEvent.firstCall.args[0].detail).to.deep.equal({
      tipoDocumento: 'DUI',
      numeroDocumento: '01234567-8',
      clinica: 'clinic-1',
      desde: '2020-01-01',
      hasta: '2020-01-31',
    });
    expect(resultEvent.calledOnce).to.equal(true);
    expect(root.querySelector('#appointment-results cita-card')).not.to.equal(null);
    expect(root.querySelector('#search-button').disabled).to.equal(false);
  });

  it('rejects an inverted date range without calling the appointment endpoint', async () => {
    fetchStub.resolves(jsonResponse([{ idClinica: 'clinic-1', nombre: 'Clínica Central', activo: true }]));
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#clinic').options.length === 2);

    const root = component.shadowRoot;
    root.querySelector('#document-number').value = '01234567-8';
    root.querySelector('#clinic').value = 'clinic-1';
    root.querySelector('#date-from').value = '2099-12-31';
    root.querySelector('#date-to').value = '2099-12-30';
    root.querySelector('#search-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    expect(root.querySelector('#search-message').hidden).to.equal(false);
    expect(root.querySelector('#search-message').textContent)
      .to.equal('La fecha inicial debe ser anterior o igual a la fecha final.');
    expect(fetchStub.callCount).to.equal(1);
  });

  it('shows a friendly message when clinic loading or appointment search fails', async () => {
    fetchStub.onFirstCall().resolves(new Response('backend unavailable', { status: 503 }));
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#search-message').hidden === false);
    expect(component.shadowRoot.querySelector('#search-message').textContent).to.equal('backend unavailable');

    fetchStub.resetBehavior();
    fetchStub.resetHistory();
    fetchStub.resolves(jsonResponse([{ idClinica: 'clinic-1', nombre: 'Clínica Central', activo: true }]));
    component.remove();
    component = document.createElement('galeno-citas');
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#clinic').options.length === 2);
    fetchStub.onSecondCall().resolves(new Response('backend unavailable', { status: 503 }));

    const root = component.shadowRoot;
    root.querySelector('#document-number').value = '01234567-8';
    root.querySelector('#clinic').value = 'clinic-1';
    root.querySelector('#date-from').value = today();
    root.querySelector('#date-to').value = today();
    root.querySelector('#search-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    await waitFor(() => root.querySelector('#search-button').disabled === false
      && root.querySelector('#result-count').textContent === '0 citas encontradas');
    expect(root.querySelector('#search-message').textContent).to.equal('backend unavailable');
    expect(root.querySelector('#appointment-results .empty-state').textContent)
      .to.equal('No encontramos citas para los criterios indicados.');
  });
});
