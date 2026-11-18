import { expect } from '../js/lib/chai/index.js';
import { OfflineError } from '../../src/control/offline-error.js';

const { describe, it } = globalThis;

describe('OfflineError', () => {
  it('es una instancia de Error con nombre y mensaje específicos', () => {
    const error = new OfflineError();

    expect(error).to.be.instanceOf(Error);
    expect(error.name).to.equal('OfflineError');
    expect(error.message).to.equal(
      'Sin conexión. Necesitas conexión para guardar este cambio.'
    );
  });
});
