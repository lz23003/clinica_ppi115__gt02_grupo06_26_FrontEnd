

console.info('[ClinicaSV] Arrancando app...');

// ---------- SERVICE WORKER ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js', { scope: './' })
      .then((reg) => {
        console.info('[SW] Registrado con scope:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          });
        });
      })
      .catch((err) => console.warn('[SW] Error al registrar:', err));
  });
} else {
  console.warn('[SW] Service Worker no soportado en este navegador');
}

// ---------- CARGA DIFERIDA DE CAPAS ----------
import('./boundary/layout/app-root.js').catch((err) => {
  console.error('[ClinicaSV] Error al cargar <app-root>:', err);
  document.body.innerHTML =
    '<p style="padding:2rem;color:#c0392b">Error al cargar la aplicación. Revisa la consola.</p>';
});

// ---------- ERRORES GLOBALES ----------
window.addEventListener('error', (e) => {
  console.error('[ClinicaSV] Error no manejado:', e.error ?? e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[ClinicaSV] Promesa rechazada no manejada:', e.reason);
});

// ---------- TOAST GLOBAL ----------
window.addEventListener('ui-toast', (e) => {
  const toastRoot = document.getElementById('toast-root');
  if (!toastRoot) return;
  const { type = 'info', message = '', timeout = 4000 } = e.detail ?? {};

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toast.style.cssText = `
    background: var(--color-surface);
    border-left: 4px solid var(--color-${type});
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    font-size: var(--fs-sm);
    min-width: 240px;
    animation: toast-in 220ms ease;
  `;

  toastRoot.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 220ms ease';
    setTimeout(() => toast.remove(), 240);
  }, timeout);
});

const style = document.createElement('style');
style.textContent = `
  @keyframes toast-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
`;
document.head.appendChild(style);

// ---------- PWA: FLUJO DE INSTALACIÓN ----------
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Creamos un botón flotante para instalar
  const btn = document.createElement('button');
  btn.id = 'btn-install';
  btn.textContent = '📲 Instalar ClinicaSV';
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #1e5fa8;
    color: white;
    border: none;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    cursor: pointer;
    font-weight: bold;
    font-size: 14px;
    z-index: 9999;
    font-family: sans-serif;
  `;

  btn.addEventListener('click', async () => {
    btn.remove();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Resultado de instalación:', outcome);
      deferredPrompt = null;
    }
  });

  document.body.appendChild(btn);
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Aplicación instalada correctamente');
  const btn = document.getElementById('btn-install');
  if (btn) btn.remove();
});



console.info('[ClinicaSV] Bootstrap listo');