import { ApiClient } from './api-client.js';

export class ExamenService {
  constructor() {
    this.api = new ApiClient();
  }

  async listarActivos() {
    const data = await this.api.get('/examenes/all');
    // Filtramos solo los que están activos
    return data.filter(ex => ex.activo);
  }
}