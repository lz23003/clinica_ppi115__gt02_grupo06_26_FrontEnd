import './js/lib/mocha/mocha.js';

globalThis.location ??= { search: '' };

const suites = {
  unit: [
    './unit/state.test.js',
    './unit/entity.test.js',
    './unit/control.test.js',
    './unit/registro-paso.test.js',
    './unit/connectivity.test.js',
    './unit/offline-error.test.js',
    './unit/api-client.test.js',
    './unit/session-store.test.js',
    './unit/permisos-consulta.test.js',
    './unit/filtros-examen.test.js',
    './unit/cie10-catalogo.test.js',
    './unit/flujo-pasos.test.js',
    './unit/consulta-service.test.js',
    './unit/paso-service.test.js',
    './unit/examen-service.test.js'
  ],
  integration: ['./integration/flujo-auth.test.js']
};
const selectedSuite = process.argv[2];

if (selectedSuite && !Object.hasOwn(suites, selectedSuite)) {
  throw new Error(`Suite de pruebas desconocida: ${selectedSuite}`);
}

globalThis.mocha.setup({ ui: 'bdd', reporter: 'spec' });

for (const testFile of suites[selectedSuite] ?? [
  ...suites.unit,
  ...suites.integration
]) {
  await import(testFile);
}

globalThis.mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
