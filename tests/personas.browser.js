import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';
import { resetApiTransport } from '../src/api.service.js';

const jsonResponse = (body, headers = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json', ...headers },
});

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es');

const waitFor = async (predicate) => {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(Boolean(predicate()), 'condition did not become true before timeout').to.equal(true);
};

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.terminate = sinon.spy();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    const query = normalize(message.query).trim();
    const results = message.personas
      .filter((persona) => normalize(`${persona.nombres ?? ''} ${persona.apellidos ?? ''}`).includes(query))
      .sort((left, right) => normalize(left.apellidos).localeCompare(normalize(right.apellidos), 'es'));
    queueMicrotask(() => this.listeners.get('message')?.({
      data: { requestId: message.requestId, results },
    }));
  }
}

describe('persona-app directory', () => {
  let sandbox;
  let fetchStub;
  let workerDescriptor;
  let people;
  let component;
  let worker;

  beforeEach(async () => {
    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: class extends FakeWorker {
        constructor(...args) {
          super(...args);
          worker = this;
        }
      },
    });
    if (!customElements.get('persona-app')) {
      await import(`../src/persona-app.js?test=${Date.now()}`);
    }

    resetApiTransport();
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub(window, 'fetch');
    people = [{
      idPersona: 'person-1',
      nombres: 'Elena',
      apellidos: 'Álvarez',
      fechaNacimiento: '1990-04-03',
      fechaCreacion: '2026-01-02T10:00:00Z',
    }];
    fetchStub.callsFake((url, options = {}) => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.endsWith('/personas') && options.method === 'POST') {
        const created = JSON.parse(options.body);
        created.idPersona = 'person-created';
        people = [created, ...people];
        return Promise.resolve(jsonResponse(created));
      }
      if (requestUrl.pathname.endsWith('/personas') && options.method !== 'DELETE') {
        return Promise.resolve(jsonResponse(people, { 'X-Total-Count': String(people.length) }));
      }
      if (requestUrl.pathname.endsWith('/person-1') && options.method === 'PUT') {
        const updated = JSON.parse(options.body);
        people = people.map((person) => person.idPersona === 'person-1'
          ? { ...person, ...updated }
          : person);
        return Promise.resolve(jsonResponse(updated));
      }
      if (requestUrl.pathname.endsWith('/person-1') && options.method === 'DELETE') {
        people = people.filter((person) => person.idPersona !== 'person-1');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(jsonResponse([]));
    });
    component = document.createElement('persona-app');
  });

  afterEach(() => {
    component?.remove();
    sandbox.restore();
    resetApiTransport();
    if (workerDescriptor) {
      Object.defineProperty(globalThis, 'Worker', workerDescriptor);
    } else {
      delete globalThis.Worker;
    }
  });

  it('loads records and filters the current page by accented name', async () => {
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#people-body tr .person-name'));
    expect(component.shadowRoot.querySelector('#total-count').textContent).to.equal('1');
    expect(component.shadowRoot.querySelector('#page-count').textContent).to.equal('1');

    const search = component.shadowRoot.querySelector('#search-input');
    search.value = 'alvarez';
    search.dispatchEvent(new Event('input'));
    await waitFor(() => component.shadowRoot.querySelector('#people-body .person-name')?.textContent
      === 'Elena Álvarez');
    expect(component.shadowRoot.querySelector('#people-body .person-name').textContent)
      .to.equal('Elena Álvarez');

    search.value = 'no existe';
    search.dispatchEvent(new Event('input'));
    await waitFor(() => component.shadowRoot.querySelector('#people-body .table-state'));
    expect(component.shadowRoot.querySelector('#people-body .table-state').textContent)
      .to.equal('No hay coincidencias en esta página.');
    expect(fetchStub.firstCall.args[1].method || 'GET').to.equal('GET');
  });

  it('validates, creates, edits, and deletes a person through user actions', async () => {
    sandbox.stub(window, 'confirm').returns(true);
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#people-body tr .person-name'));
    const root = component.shadowRoot;

    root.querySelector('#new-person-button').click();
    expect(root.querySelector('#person-form-panel').hidden).to.equal(false);
    root.querySelector('#first-name').value = 'Mateo';
    root.querySelector('#last-name').value = 'García';
    root.querySelector('#birth-date').removeAttribute('max');
    root.querySelector('#birth-date').value = '2099-12-31';
    root.querySelector('#person-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));
    expect(root.querySelector('#form-message').textContent)
      .to.equal('La fecha de nacimiento no puede ser posterior a hoy.');

    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
      .toISOString().slice(0, 10);
    root.querySelector('#birth-date').value = localDate;
    root.querySelector('#person-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));
    await waitFor(() => root.querySelector('#total-count').textContent === '2');
    expect(root.querySelector('#status-message').textContent)
      .to.equal('La persona se registró correctamente.');
    expect(fetchStub.args.some(([, options]) => options?.method === 'POST')).to.equal(true);

    const edit = [...root.querySelectorAll('button[data-action="edit"]')]
      .find((button) => button.dataset.id === 'person-1');
    edit.click();
    expect(root.querySelector('#birth-date').disabled).to.equal(true);
    root.querySelector('#first-name').value = 'Elena editada';
    root.querySelector('#person-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));
    await waitFor(() => root.querySelector('#status-message').textContent
      === 'Los cambios de la persona se guardaron correctamente.');

    await waitFor(() => root.querySelector('button[data-action="delete"][data-id="person-1"]'));
    const remove = root.querySelector('button[data-action="delete"][data-id="person-1"]');
    remove.click();
    await waitFor(() => root.querySelector('#status-message').textContent
      === 'La persona se eliminó correctamente.');
    expect(fetchStub.args.some(([, options]) => options?.method === 'PUT')).to.equal(true);
    expect(fetchStub.args.some(([, options]) => options?.method === 'DELETE')).to.equal(true);
    expect(worker.terminate.calledOnce).to.equal(false);
  });

  it('shows a service error and terminates the search worker when disconnected', async () => {
    fetchStub.rejects(new TypeError('Network unavailable'));
    document.body.append(component);
    await waitFor(() => component.shadowRoot.querySelector('#status-message').textContent
      .includes('No se pudo conectar'));

    const currentWorker = worker;
    component.remove();
    expect(currentWorker.terminate.calledOnce).to.equal(true);
  });
});
