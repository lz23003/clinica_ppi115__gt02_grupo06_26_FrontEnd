import { BaseEntity } from './base-entity.js';

export class PersonaRol extends BaseEntity {
  constructor(data = {}) {
    super();
    this.idPersonaRol = data.idPersonaRol ?? null;
    
    // Validación segura para fecha
    this.fechaCreacion = null;
    if (data.fechaCreacion && !isNaN(new Date(data.fechaCreacion).getTime())) {
      this.fechaCreacion = new Date(data.fechaCreacion);
    }

    this.idClinica = data.idClinica ?? null; // Objeto Clinica
    this.idPersona = data.idPersona ?? null; // Objeto Persona
    this.idRol = data.idRol ?? null;         // Objeto Rol
  }
}