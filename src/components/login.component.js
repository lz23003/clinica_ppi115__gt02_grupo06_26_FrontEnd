const loginTemplate = document.createElement('template');
loginTemplate.innerHTML = `
  <style>
    :host { display: block; color: #173a35; font: 14px "DM Sans", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    .login-card { width: min(440px, 100%); margin: 4vh auto; padding: clamp(24px, 5vw, 40px); border: 1px solid #e8eeea; border-radius: 16px; background: #fff; box-shadow: 0 12px 35px rgb(22 57 49 / 6%); }
    .eyebrow { margin: 0 0 8px; color: #729185; font-size: 10px; font-weight: 700; letter-spacing: 1.4px; }
    h1 { margin: 0 0 8px; font: 700 25px "Manrope", "Segoe UI", sans-serif; letter-spacing: -.7px; }
    .intro { margin: 0 0 25px; color: #82918c; font-size: 12px; line-height: 1.6; }
    form { display: grid; gap: 17px; }
    label { display: grid; gap: 7px; color: #40574e; font-size: 11px; font-weight: 700; }
    select, input { width: 100%; min-height: 43px; padding: 0 12px; border: 1px solid #e3eae5; border-radius: 8px; background: #fff; color: #23453a; font: inherit; font-size: 12px; }
    select:focus-visible, input:focus-visible, button:focus-visible { outline: 3px solid rgb(21 116 92 / 20%); outline-offset: 2px; }
    button { min-height: 43px; margin-top: 5px; border: 0; border-radius: 8px; background: #15745c; color: #fff; font: inherit; font-size: 11px; font-weight: 700; letter-spacing: .5px; }
    button:hover:not(:disabled) { background: #105542; }
    button:disabled { cursor: not-allowed; opacity: .58; }
    .message { min-height: 17px; margin: 0; color: #9c3e3e; font-size: 11px; }
    .privacy { margin: 19px 0 0; color: #94a099; font-size: 10px; line-height: 1.5; text-align: center; }
  </style>
  <section class="login-card" aria-labelledby="login-title">
    <p class="eyebrow">PORTAL CLÍNICO</p>
    <h1 id="login-title">Portal de empleados</h1>
    <p class="intro">Ingresa tu documento para continuar al espacio de trabajo.</p>
    <form id="login-form">
      <label for="document-type">Tipo de documento
        <select id="document-type" name="tipoDocumento" required>
          <option value="DUI">DUI</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="LICENCIA">Licencia de Conducir</option>
        </select>
      </label>
      <label for="document-number">Número de documento
        <input id="document-number" name="numeroDocumento" type="text" autocomplete="off" maxlength="30" required>
      </label>
      <p class="message" id="login-message" role="status" aria-live="polite"></p>
      <button id="submit-login" type="submit" disabled>INICIAR SESIÓN</button>
    </form>
    <p class="privacy">Tus datos se utilizan únicamente para validar el acceso al portal.</p>
  </section>
`;

class GalenoLogin extends HTMLElement {
  #state = new Proxy({
    tipoDocumento: 'DUI',
    numeroDocumento: '',
    submitting: false,
  }, {
    set: (target, property, value) => {
      Reflect.set(target, property, value);
      this.#renderState();
      return true;
    },
  });

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(loginTemplate.content.cloneNode(true));
  }

  connectedCallback() {
    const root = this.shadowRoot;
    root.querySelector('#document-type').addEventListener('change', ({ currentTarget }) => {
      this.#state.tipoDocumento = currentTarget.value;
    });
    root.querySelector('#document-number').addEventListener('input', ({ currentTarget }) => {
      this.#state.numeroDocumento = currentTarget.value.trim();
    });
    root.querySelector('#login-form').addEventListener('submit', (event) => this.#submit(event));
    this.#renderState();
  }

  set busy(value) {
    this.#state.submitting = Boolean(value);
  }

  setStatus(message, isError = false) {
    const status = this.shadowRoot.querySelector('#login-message');
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  #renderState() {
    const button = this.shadowRoot?.querySelector('#submit-login');
    if (!button) return;
    button.disabled = this.#state.submitting || this.#state.numeroDocumento.length === 0;
    button.textContent = this.#state.submitting ? 'VALIDANDO…' : 'INICIAR SESIÓN';
  }

  #submit(event) {
    event.preventDefault();
    const form = this.shadowRoot.querySelector('#login-form');
    if (!form.reportValidity()) return;

    const credentials = {
      tipoDocumento: this.shadowRoot.querySelector('#document-type').value,
      numeroDocumento: this.shadowRoot.querySelector('#document-number').value.trim(),
    };
    if (!credentials.numeroDocumento) return;

    this.dispatchEvent(new CustomEvent('login-submit', {
      bubbles: true,
      composed: true,
      detail: credentials,
    }));
  }
}

if (!customElements.get('galeno-login')) {
  customElements.define('galeno-login', GalenoLogin);
}
