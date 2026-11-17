import { expect } from '../js/lib/chai/index.js';
import { BaseEntity } from '../../src/entity/base-entity.js';
import { Persona } from '../../src/entity/persona.js';
import { Consulta } from '../../src/entity/consulta.js';
import { Clinica } from '../../src/entity/clinica.js';

const { describe, it } = globalThis;

describe('Capa Entity - Pruebas Unitarias', () => {
  it('BaseEntity.toJSON debe convertir fechas a formato ISO string', () => {
    const fechaOriginal = new Date('2026-11-15T10:00:00Z');
    const dummy = new BaseEntity();
    dummy.id = '123';
    dummy.fecha = fechaOriginal;

    expect(dummy.toJSON().fecha).to.equal(fechaOriginal.toISOString());
  });

  it('Persona.fromJSON debe crear una instancia correcta con nombre completo', () => {
    const persona = Persona.fromJSON({
      idPersona: 'uuid-123',
      nombres: 'Carlos',
      apellidos: 'Gomez'
    });

    expect(persona).to.be.instanceOf(Persona);
    expect(persona.idPersona).to.equal('uuid-123');
    expect(persona.nombreCompleto).to.equal('Carlos Gomez');
  });

  it('Persona debe manejar fechas nulas o inválidas correctamente', () => {
    const persona = Persona.fromJSON({
      nombres: 'Ana',
      fechaNacimiento: 'texto-invalido'
    });

    expect(persona.fechaNacimiento).to.equal(null);
  });

  it('Consulta._parseFecha debe limpiar el [UTC] y microsegundos', () => {
    const consulta = Consulta.fromJSON({
      fechaInicio: '2026-11-15T10:00:00.123456+00:00[UTC]'
    });

    expect(consulta.fechaInicio).to.be.instanceOf(Date);
    expect(consulta.fechaInicio.getFullYear()).to.equal(2026);
    expect(consulta.fechaInicio.getMonth()).to.equal(10);
  });

  it('Clinica debe tener valores por defecto si el JSON viene vacío', () => {
    const clinica = new Clinica({});

    expect(clinica.activo).to.equal(true);
    expect(clinica.nombre).to.equal('');
  });
});
