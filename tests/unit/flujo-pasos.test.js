import { expect } from '../js/lib/chai/index.js';
import {
  consultaYaAtendida,
  esPrimerPaso,
  esUltimoPaso,
  pasoInicial
} from '../../src/control/flujo-pasos.js';

const { describe, it } = globalThis;

describe('Flujo de pasos', () => {
  it('identifica primer, último e intermedio', () => {
    expect(esPrimerPaso(0)).to.equal(true);
    expect(esUltimoPaso(2, 3)).to.equal(true);
    expect(esUltimoPaso(1, 3)).to.equal(false);
  });

  it('elige el primer paso no finalizado, o el último si todos terminaron', () => {
    const pasos = [{ idProcedimientoPaso: 'a' }, { idProcedimientoPaso: 'b' }];
    expect(pasoInicial(pasos, [{ idProcedimientoPaso: { idProcedimientoPaso: 'a' }, estado: 'FINALIZADO' }]))
      .to.equal(1);
    expect(pasoInicial(pasos, [
      { idProcedimientoPaso: { idProcedimientoPaso: 'a' }, estado: 'FINALIZADO' },
      { idProcedimientoPaso: { idProcedimientoPaso: 'b' }, estado: 'FINALIZADO' }
    ])).to.equal(1);
  });

  it('considera atendida una consulta solo si todos sus procedimientos terminaron', () => {
    expect(consultaYaAtendida({
      fechaFin: '2026-01-01',
      procedimientos: [{ pasos: [{ estado: 'FINALIZADO' }] }, { pasos: [{ estado: 'FINALIZADO' }] }]
    })).to.equal(true);
    expect(consultaYaAtendida({
      fechaFin: null,
      procedimientos: [{ pasos: [{ estado: 'FINALIZADO' }] }]
    })).to.equal(false);
    expect(consultaYaAtendida({
      fechaFin: '2026-01-01',
      procedimientos: [{ pasos: [{ estado: 'PENDIENTE' }] }]
    })).to.equal(false);
    expect(consultaYaAtendida({ fechaFin: '2026-01-01', procedimientos: [] })).to.equal(false);
  });
});
