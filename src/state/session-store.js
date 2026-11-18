export class SessionStore {
  static setSession(persona, roles) {
    const session = { persona, roles };
    localStorage.setItem('clinicasv_session', JSON.stringify(session));
  }

  static getSession() {
    const data = localStorage.getItem('clinicasv_session');
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  static setContext({ idClinica, idRol, nombreRol }) {
    localStorage.setItem('clinicasv_context', JSON.stringify({ idClinica, idRol, nombreRol }));
  }

  static getContext() {
    const data = localStorage.getItem('clinicasv_context');
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  static clearContext() {
    localStorage.removeItem('clinicasv_context');
  }

  static setConsultaActiva(id) {
    if (id) localStorage.setItem('consulta_activa', id);
    else this.clearConsultaActiva();
  }

  static getConsultaActiva() {
    return localStorage.getItem('consulta_activa');
  }

  static clearConsultaActiva() {
    localStorage.removeItem('consulta_activa');
  }

  static clear() {
    localStorage.removeItem('clinicasv_session');
    this.clearContext();
    this.clearConsultaActiva();
  }
}