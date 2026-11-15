import test from 'node:test';
import assert from 'node:assert/strict';
import { findRoute, normalizeRoutePath } from '../src/core/routes.js';

const routeDefinitions = [
  { path: '/citas' },
  { path: '/consultas/:consultaId' },
];

test('normalizes empty, root, query, and trailing slash routes', () => {
  assert.equal(normalizeRoutePath(''), '/');
  assert.equal(normalizeRoutePath('#/'), '/');
  assert.equal(normalizeRoutePath('#/citas/?pagina=2'), '/citas');
  assert.equal(normalizeRoutePath('/empleados//login/'), '/empleados/login');
});

test('finds a static route without route parameters', () => {
  const match = findRoute('/citas', routeDefinitions);

  assert.equal(match.route.path, '/citas');
  assert.deepEqual(match.params, {});
});

test('uses the application route table when no custom definitions are supplied', () => {
  const match = findRoute('/citas');

  assert.equal(match.route.path, '/citas');
  assert.equal(match.route.element, 'galeno-citas');
});

test('extracts and decodes dynamic route parameters', () => {
  const match = findRoute('/consultas/consulta%2F123', routeDefinitions);

  assert.equal(match.route.path, '/consultas/:consultaId');
  assert.deepEqual(match.params, { consultaId: 'consulta/123' });
});

test('returns a not-found route when no path matches', () => {
  const match = findRoute('/ruta-inexistente', routeDefinitions);

  assert.equal(match.route.path, '/not-found');
  assert.deepEqual(match.params, {});
});

test('rejects a malformed percent-encoded route parameter', () => {
  const match = findRoute('/consultas/%E0%A4%A', routeDefinitions);

  assert.equal(match.route.path, '/not-found');
  assert.deepEqual(match.params, {});
});
