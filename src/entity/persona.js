import { BaseEntity } from './base-entity.js';

export class Persona extends BaseEntity {
  constructor(data = {}) {
    super();
    this.idPersona = data.idPersona ?? null;
    this.nombres = data.nombres ?? '';
    this.apellidos = data.apellidos ?? '';
    
    // Validación segura para fechas
    this.fechaNacimiento = null;
    if (data.fechaNacimiento && !isNaN(new Date(data.fechaNacimiento).getTime())) {
      this.fechaNacimiento = new Date(data.fechaNacimiento);
    }

    this.fechaCreacion = null;
    if (data.fechaCreacion && !isNaN(new Date(data.fechaCreacion).getTime())) {
      this.fechaCreacion = new Date(data.fechaCreacion);
    }
  }

  get nombreCompleto() {
    return `${this.nombres} ${this.apellidos}`.trim();
  }
}