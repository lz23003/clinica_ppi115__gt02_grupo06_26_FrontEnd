export class SessionStore {
  static setSession(persona, roles) {
    const session = { persona, roles };
    localStorage.setItem('clinicasv_session', JSON.stringify(session));
  }

  static getSession() {
    const data = localStorage.getItem('clinicasv_session');
    return data ? JSON.parse(data) : null;
  }

  static clear() {
    localStorage.removeItem('clinicasv_session');
  }
}