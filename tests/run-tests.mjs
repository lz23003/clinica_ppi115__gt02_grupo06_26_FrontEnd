import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const testFiles = readdirSync('tests')
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => resolve('tests', file));

if (testFiles.length === 0) {
  throw new Error('No se encontraron archivos tests/*.test.js.');
}

for (const args of [
  ['--test', ...testFiles],
  ['tests/run-browser.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
