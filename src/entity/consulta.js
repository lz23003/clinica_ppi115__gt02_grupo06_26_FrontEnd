import { BaseEntity } from './base-entity.js';

export class Consulta extends BaseEntity {
  constructor(data = {}) {
    super();
    this.idConsulta = data.idConsulta ?? null;
    
    // Pasamos las fechas por nuestro método de limpieza
    this.fechaInicio = this._parsearFecha(data.fechaInicio);
    this.fechaFin = this._parsearFecha(data.fechaFin);
    
    this.referenciaExterna = data.referenciaExterna ?? '';
    this.observaciones = data.observaciones ?? '';
    this.idPersonaRol = data.idPersonaRol ?? null; 
  }

  // Este método limpia el "[UTC]" y los microsegundos para que JS lo entienda
  _parsearFecha(valor) {
    if (!valor) return null;
    
    // 1. Quitamos el '[UTC]' si existe
    let fechaLimpia = String(valor).replace('[UTC]', '');
    
    // 2. Quitamos los microsegundos extra (dejamos solo 3 decimales)
    fechaLimpia = fechaLimpia.replace(/(\.\d{3})\d+/, '$1');

    const fecha = new Date(fechaLimpia);
    
    if (isNaN(fecha.getTime())) {
      console.warn("Fecha inválida recibida:", valor);
      return null;
    }
    return fecha;
  }
}