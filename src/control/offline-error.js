export class OfflineError extends Error {
  constructor() {
    super('Sin conexión. Necesitas conexión para guardar este cambio.');
    this.name = 'OfflineError';
  }
}
