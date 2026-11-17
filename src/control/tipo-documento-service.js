import { ApiClient } from './api-client.js';
import { TipoDocumento } from '../entity/tipo-documento.js';

export class TipoDocumentoService { 
  constructor() {
    this.api = new ApiClient();
  }

  async listarActivos() {
    const data = await this.api.get('/tipos-documento/all');
    return data.filter(td => td.activo).map(json => TipoDocumento.fromJSON(json));
  }
}