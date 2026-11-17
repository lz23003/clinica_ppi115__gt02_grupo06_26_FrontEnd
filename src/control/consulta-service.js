import { ApiClient } from './api-client.js';
import { Consulta } from '../entity/consulta.js';

export class ConsultaService {
  constructor() {
    this.api = new ApiClient();
  }

    async obtenerConsultasDeClinica(idClinica, idRol = null, idPersona = null) {
    let url = `/consultas/por-clinica-rol?idClinica=${idClinica}`;
    if (idRol) url += `&idRol=${idRol}`;
    if (idPersona) url += `&idPersona=${idPersona}`;
    
    const data = await this.api.get(url);
    return data.map(json => Consulta.fromJSON(json));
  }
}