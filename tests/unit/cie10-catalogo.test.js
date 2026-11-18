import { expect } from '../js/lib/chai/index.js';
import { buscarCie10 } from '../../src/control/cie10-catalogo.js';

const { describe, it } = globalThis;

describe('Búsqueda en catálogo CIE-10', () => {
  const catalogo = [
    { codigo: 'J00', descripcion: 'Rinofaringitis aguda' },
    { codigo: 'R51', descripcion: 'Cefalea' }
  ];

  it('busca por código o descripción sin distinguir mayúsculas', () => {
    expect(buscarCie10(catalogo, 'j00')).to.deep.equal([catalogo[0]]);
    expect(buscarCie10(catalogo, 'CEFALEA')).to.deep.equal([catalogo[1]]);
  });

  it('devuelve una lista vacía si no hay coincidencias', () => {
    expect(buscarCie10(catalogo, 'diabetes')).to.deep.equal([]);
  });

  it('normaliza tildes en la descripción', () => {
    expect(buscarCie10([{ codigo: 'R51', descripcion: 'Cefalía' }], 'cefalia')).to.have.lengthOf(1);
  });
});
