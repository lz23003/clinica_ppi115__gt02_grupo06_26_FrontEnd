class GalenoPlaceholder extends HTMLElement {
  connectedCallback() {
    const title = this.#getRouteTitle();
    const description = this.#getDescription();
    const root = this.attachShadow({ mode: 'open' });
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('../../styles.css', import.meta.url);

    const page = document.createElement('section');
    page.className = 'placeholder-page';
    page.setAttribute('aria-labelledby', 'page-title');

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'GALENOSV · PORTAL CLÍNICO';

    const heading = document.createElement('h1');
    heading.id = 'page-title';
    heading.textContent = title;

    const detail = document.createElement('p');
    detail.className = 'placeholder-description';
    detail.textContent = description;

    const note = document.createElement('p');
    note.className = 'placeholder-note';
    note.textContent = 'Esta sección forma parte de la arquitectura inicial y se implementará en la siguiente etapa.';

    page.append(eyebrow, heading, detail, note);
    root.append(stylesheet, page);
  }

  #getRouteTitle() {
    const titles = {
      '/citas': 'Búsqueda de citas',
      '/empleados/login': 'Acceso de empleados',
      '/empleados/dashboard': 'Agenda del personal',
      '/not-found': 'Página no encontrada',
    };
    if (this.getAttribute('data-route')?.startsWith('/consultas/')) return 'Seguimiento de consulta';
    return titles[this.getAttribute('data-route')] || 'GalenoSV';
  }

  #getDescription() {
    const route = this.getAttribute('data-route');
    if (route?.startsWith('/consultas/')) {
      return 'HU4 · Flujo de atención, notas, diagnóstico, tratamiento y exámenes.';
    }
    if (route === '/not-found') return 'La ruta solicitada no existe.';
    return this.#descriptions[route] || 'La sección se encuentra en preparación.';
  }

  #descriptions = {
    '/citas': 'HU1 · Búsqueda pública de citas por documento, clínica y rango de fechas.',
    '/empleados/login': 'HU2 · Inicio de sesión para validar la identidad del personal.',
    '/empleados/dashboard': 'HU3 · Selección de clínica y rol, filtros y consultas del día.',
  };
}

if (!customElements.get('galeno-placeholder')) {
  customElements.define('galeno-placeholder', GalenoPlaceholder);
}
