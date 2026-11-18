import { ApiClient } from './api-client.js';

export class PasoService {
  constructor() {
    this.api = new ApiClient();
  }

  // 1. Traer los pasos reales de un procedimiento desde la BD
  async obtenerPasosDeProcedimiento(idProcedimiento) {
    return this.api.get(`/procedimientos-pasos/procedimiento/${encodeURIComponent(idProcedimiento)}`);
  }

  obtenerEjecutados(idConsultaProcedimiento) {
    return this.api.get(`/consultas-procedimientos-pasos/consulta/${encodeURIComponent(idConsultaProcedimiento)}`);
  }

  // El recurso REST del backend solo acepta `valor` como query param.
  guardarValor(idPaso, texto) {
    return this.api.put(
      `/consultas-procedimientos-pasos/${encodeURIComponent(idPaso)}/valor?valor=${encodeURIComponent(texto)}`,
      {}
    );
  }

  avanzar(idConsultaProcedimiento, idPasoActual, idSiguiente) {
    const query = new URLSearchParams({
      idSiguientePaso: idSiguiente,
      ...(idPasoActual ? { idPasoActual } : {})
    });
    return this.api.post(
      `/consultas-procedimientos-pasos/siguiente/${encodeURIComponent(idConsultaProcedimiento)}?${query}`,
      {}
    );
  }

  retroceder(idConsultaProcedimiento, idPasoActual, idAnterior) {
    const query = new URLSearchParams({
      idPasoAnterior: idAnterior,
      ...(idPasoActual ? { idPasoActual } : {})
    });
    return this.api.post(
      `/consultas-procedimientos-pasos/retroceder/${encodeURIComponent(idConsultaProcedimiento)}?${query}`,
      {}
    );
  }
}