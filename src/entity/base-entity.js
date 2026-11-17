export class BaseEntity {
  static fromJSON(obj) {
    return new this(obj);
  }
  
  toJSON() {
    // Convierte Dates a ISO Strings automáticamente
    const json = { ...this };
    for (const key in json) {
      if (json[key] instanceof Date) {
        json[key] = json[key].toISOString();
      }
    }
    return json;
  }
}