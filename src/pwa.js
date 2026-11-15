export function registerServiceWorker(container, scriptUrl, options) {
  if (!container || typeof container.register !== 'function') {
    return Promise.reject(new Error('Este navegador no permite registrar Service Workers.'));
  }
  return container.register(scriptUrl, options);
}
