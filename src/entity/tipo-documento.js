import { BaseEntity } from './base-entity.js';
export class TipoDocumento extends BaseEntity {
  constructor(data = {}) {
    super();
    this.idTipoDocumento = data.idTipoDocumento ?? null;
    this.nombre = data.nombre ?? '';
    this.activo = data.activo ?? true;
  }
}