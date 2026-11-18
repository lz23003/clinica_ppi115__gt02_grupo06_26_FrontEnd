import { expect } from '../js/lib/chai/index.js';
import {
  camposVisibles,
  esDoctor,
  puedeOperarPaso
} from '../../src/control/permisos-consulta.js';

const { describe, it } = globalThis;

describe('Permisos de consulta', () => {
  const pasoAjeno = { idPersonaRol: { idPersona: { idPersona: 'persona-2' } } };
  const pasoPropio = { idPersonaRol: { idPersona: { idPersona: 'persona-1' } } };

  it('permite al doctor operar pasos asignados a otra persona', () => {
    expect(puedeOperarPaso({
      nombreRol: 'Doctor',
      idPersonaLogueada: 'persona-1',
      pasoEjecutado: pasoAjeno
    })).to.equal(true);
  });

  it('normaliza mayúsculas y tildes al reconocer doctores y médicos', () => {
    expect(esDoctor('Médico')).to.equal(true);
    expect(esDoctor('DOCTOR')).to.equal(true);
    expect(esDoctor('MEDICO')).to.equal(true);
  });

  it('no permite a enfermería operar el paso de otra persona', () => {
    expect(puedeOperarPaso({
      nombreRol: 'Enfermera',
      idPersonaLogueada: 'persona-1',
      pasoEjecutado: pasoAjeno
    })).to.equal(false);
  });

  it('permite a enfermería operar su paso asignado y los pasos sin asignar', () => {
    expect(puedeOperarPaso({
      nombreRol: 'Enfermera',
      idPersonaLogueada: 'persona-1',
      pasoEjecutado: pasoPropio
    })).to.equal(true);
    expect(puedeOperarPaso({ nombreRol: 'Enfermera', idPersonaLogueada: 'persona-1' })).to.equal(true);
  });

  it('muestra todos los campos al doctor y notas según los demás roles', () => {
    expect(camposVisibles('DOCTOR')).to.deep.equal({
      diagnostico: true,
      plan: true,
      examenes: true,
      etiquetaNotas: 'Notas de la Consulta Médica'
    });
    expect(camposVisibles('Enfermería').etiquetaNotas).to.equal('Notas de Signos Vitales');
    expect(camposVisibles('Recepción').etiquetaNotas).to.equal('Notas de Recepción');
    expect(camposVisibles('Recepción').diagnostico).to.equal(false);
  });
});
