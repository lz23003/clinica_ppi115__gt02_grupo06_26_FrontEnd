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

  obtenerDetalle(id) {
    return this.api.get(`/consultas/${encodeURIComponent(id)}/detalle-completo`);
  }

  async obtenerProcedimientos(idConsulta, detalle = null) {
    // El backend no expone una ruta por consulta; el detalle verificado incluye los procedimientos.
    detalle ??= await this.obtenerDetalle(idConsulta);
    return detalle?.procedimientos ?? [];
  }

  finalizar(id) {
    return this.api.put(`/consultas/${encodeURIComponent(id)}/finalizar`, {});
  }
}