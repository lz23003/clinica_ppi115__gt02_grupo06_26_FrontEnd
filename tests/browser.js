import { expect } from './js/lib/chai/index.js';
import sinon from './js/lib/sinon/sinon-esm.js';

globalThis.expect = expect;
globalThis.sinon = sinon;
mocha.setup({ ui: 'bdd', timeout: 10000 });

await import('./api.browser.js');
await import('./components.browser.js');
await import('./app.browser.js');
await import('./citas.browser.js');
await import('./router-worker.browser.js');
await import('./personas.browser.js');
await import('./sw.browser.js');
await import('./offline.browser.js');
const runner = mocha.run();
const failures = [];
runner.on('fail', (test, error) => {
  failures.push({
    title: test.fullTitle(),
    message: error.stack || error.message || String(error),
  });
});
runner.once('end', () => {
  document.documentElement.dataset.mochaDone = 'true';
  document.documentElement.dataset.mochaFailures = String(runner.failures);
  document.documentElement.dataset.mochaPasses = String(runner.stats.passes);
  document.documentElement.dataset.mochaFailureDetails = JSON.stringify(failures);
});
