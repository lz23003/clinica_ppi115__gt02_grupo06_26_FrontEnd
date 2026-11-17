import { expect } from '../js/lib/chai/index.js';
import { RegistroPaso } from '../../src/entity/registro-paso.js';

const { describe, it } = globalThis;

describe('Entidad RegistroPaso', () => {
  it('serializar y parsear conserva separadores dentro de los campos', () => {
    const original = new RegistroPaso({
      notas: 'Dolor en zona | izquierda',
      diagnostico: 'A | B',
      plan: 'Reposo | control'
    });

    expect(RegistroPaso.parsear(original.serializar())).to.deep.equal(original);
  });

  it('parsear conserva compatibilidad con el formato anterior', () => {
    const registro = RegistroPaso.parsear(
      'NOTAS: Dolor | persistente | DIAGNÓSTICO: Cefalea | PLAN: Reposo'
    );

    expect(registro.notas).to.equal('Dolor | persistente');
    expect(registro.diagnostico).to.equal('Cefalea');
    expect(registro.plan).to.equal('Reposo');
  });

  it('parsear un valor vacío retorna campos vacíos', () => {
    expect(RegistroPaso.parsear(null)).to.deep.equal(new RegistroPaso());
  });
});
