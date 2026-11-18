import { expect } from '../js/lib/chai/index.js';
import { filtrarExamenes } from '../../src/control/filtros-examen.js';

const { describe, it } = globalThis;

describe('Filtro de exámenes', () => {
  const examenes = [
    { idExamen: '1', nombre: 'Hemograma completo' },
    { idExamen: '2', nombre: 'Prueba de glucosa' }
  ];

  it('encuentra resultados sin distinguir mayúsculas', () => {
    expect(filtrarExamenes(examenes, 'HEMOGRAMA')).to.deep.equal([examenes[0]]);
  });

  it('no devuelve resultados cuando no hay coincidencias', () => {
    expect(filtrarExamenes(examenes, 'radiografía')).to.deep.equal([]);
  });

  it('normaliza tildes', () => {
    expect(filtrarExamenes([{ nombre: 'Examen de corazón' }], 'corazon')).to.have.lengthOf(1);
  });
});
