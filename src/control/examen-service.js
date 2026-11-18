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

  obtenerOrdenesDePaso(idPaso) {
    return this.api.get(`/ordenes-examen/por-paso/${encodeURIComponent(idPaso)}`);
  }

  async reemplazarOrdenes(idPaso, examenes) {
    const fallos = [];
    const actuales = await this.obtenerOrdenesDePaso(idPaso);
    for (const orden of actuales) {
      try {
        await this.api.delete(`/ordenes-examen/${encodeURIComponent(orden.idOrdenExamen)}`);
      } catch (error) {
        fallos.push({ operation: 'delete', id: orden.idOrdenExamen, error });
      }
    }

    for (const examen of examenes) {
      try {
        await this.api.post('/ordenes-examen', {
          idConsultaProcedimientoPaso: { idConsultaProcedimientoPaso: idPaso },
          fechaCreacion: new Date().toISOString(),
          indicaciones: `EXAMEN:${examen.idExamen}|NOMBRE:${examen.nombre}`
        });
      } catch (error) {
        fallos.push({ operation: 'create', id: examen.idExamen, error });
      }
    }

    if (fallos.length) {
      const error = new Error(`No se completó el reemplazo: ${fallos.length} operación(es) fallaron.`);
      error.fallos = fallos;
      throw error;
    }
  }
}