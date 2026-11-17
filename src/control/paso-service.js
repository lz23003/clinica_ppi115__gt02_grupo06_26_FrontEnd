import { ApiClient } from './api-client.js';

export class PasoService {
  constructor() {
    this.api = new ApiClient();
  }

  // 1. Traer los pasos reales de un procedimiento desde la BD
  async obtenerPasosDeProcedimiento(idProcedimiento) {
    return await this.api.get(`/procedimientos-pasos/procedimiento/${idProcedimiento}`);
  }

  // 2. Avanzar el estado del paso (ya lo teníamos)
  async avanzarPaso(idPaso) {
    return await this.api.put(`/consultas-procedimientos-pasos/${idPaso}/estado?nuevoEstado=FINALIZADO`, {});
  }

  // 3. Retroceder el estado del paso (ya lo teníamos)
  async retrocederPaso(idPaso) {
    return await this.api.put(`/consultas-procedimientos-pasos/${idPaso}/estado?nuevoEstado=PENDIENTE`, {});
  }
}