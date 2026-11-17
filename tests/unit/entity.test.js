import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BaseEntity } from '../../src/entity/base-entity.js';
import { Persona } from '../../src/entity/persona.js';
import { Consulta } from '../../src/entity/consulta.js';
import { Clinica } from '../../src/entity/clinica.js';

describe('Capa Entity - Pruebas Unitarias', () => {

  test('BaseEntity.toJSON debe convertir fechas a formato ISO string', () => {
    const fechaOriginal = new Date('2026-11-15T10:00:00Z');
    const dummy = new BaseEntity();
    dummy.id = '123';
    dummy.fecha = fechaOriginal;
    
    const json = dummy.toJSON();
    assert.strictEqual(json.fecha, fechaOriginal.toISOString());
  });

  test('Persona.fromJSON debe crear una instancia correcta con nombre completo', () => {
    const json = { idPersona: 'uuid-123', nombres: 'Carlos', apellidos: 'Gomez' };
    const persona = Persona.fromJSON(json);
    
    assert.ok(persona instanceof Persona);
    assert.strictEqual(persona.idPersona, 'uuid-123');
    assert.strictEqual(persona.nombreCompleto, 'Carlos Gomez');
  });

  test('Persona debe manejar fechas nulas o inválidas correctamente', () => {
    const json = { nombres: 'Ana', fechaNacimiento: 'texto-invalido' };
    const persona = Persona.fromJSON(json);
    assert.strictEqual(persona.fechaNacimiento, null);
  });

  test('Consulta._parseFecha debe limpiar el [UTC] y microsegundos', () => {
    const json = { fechaInicio: '2026-11-15T10:00:00.123456+00:00[UTC]' };
    const consulta = Consulta.fromJSON(json);
    
    assert.ok(consulta.fechaInicio instanceof Date);
    assert.strictEqual(consulta.fechaInicio.getFullYear(), 2026);
    assert.strictEqual(consulta.fechaInicio.getMonth(), 10); // Noviembre es mes 10
  });

  test('Clinica debe tener valores por defecto si el JSON viene vacío', () => {
    const clinica = new Clinica({});
    assert.strictEqual(clinica.activo, true);
    assert.strictEqual(clinica.nombre, '');
  });

});