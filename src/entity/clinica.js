import { BaseEntity } from './base-entity.js';

export class Clinica extends BaseEntity {
  constructor(data = {}) {
    super();
    this.idClinica = data.idClinica ?? null;
    this.nombre = data.nombre ?? '';
    this.activo = data.activo ?? true;
    this.tipo = data.tipo ?? '';
    this.comentarios = data.comentarios ?? '';
  }
}