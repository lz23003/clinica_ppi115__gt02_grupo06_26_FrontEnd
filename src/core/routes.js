const placeholderModule = () => import('../pages/galeno-placeholder.js');

export const routes = [
  {
    path: '/citas',
    title: 'Búsqueda de citas',
    element: 'galeno-citas',
    load: () => import('../components/citas.component.js'),
    description: 'HU1 · Búsqueda pública de citas por documento, clínica y rango de fechas.',
  },
  {
    path: '/empleados/login',
    title: 'Acceso de empleados',
    element: 'galeno-login',
    load: () => import('../components/login.component.js'),
    description: 'HU2 · Inicio de sesión para validar la identidad del personal.',
  },
  {
    path: '/empleados/dashboard',
    title: 'Agenda del personal',
    element: 'galeno-dashboard',
    load: () => import('../components/dashboard.component.js'),
    requiresAuth: true,
    description: 'HU3 · Selección de clínica y rol, filtros y consultas del día.',
  },
  {
    path: '/consultas/:consultaId',
    title: 'Seguimiento de consulta',
    element: 'galeno-consulta-activa',
    load: () => import('../components/consulta.component.js'),
    requiresAuth: true,
    description: 'HU4 · Flujo de atención, notas, diagnóstico, tratamiento y exámenes.',
  },
  {
    path: '/personas',
    title: 'Personas',
    element: 'persona-app',
    load: () => import('../persona-app.js'),
    description: 'Directorio de personas.',
  },
];

export function normalizeRoutePath(hash) {
  const route = String(hash ?? '').replace(/^#/, '').split('?')[0] || '/';
  const normalized = `/${route.split('/').filter(Boolean).join('/')}`;
  if (normalized === '/') return normalized;

  return normalized.replace(/\/+$/, '') || '/';
}

export function findRoute(path, routeList = routes) {
  const requestedSegments = normalizeRoutePath(path).split('/').filter(Boolean);

  for (const route of routeList) {
    const routeSegments = route.path.split('/').filter(Boolean);
    if (routeSegments.length !== requestedSegments.length) continue;

    const params = {};
    const matches = routeSegments.every((segment, index) => {
      if (segment.startsWith(':')) {
        try {
          params[segment.slice(1)] = decodeURIComponent(requestedSegments[index]);
          return true;
        } catch {
          return false;
        }
      }
      return segment === requestedSegments[index];
    });

    if (matches) return { route, params };
  }

  return {
    route: {
      path: '/not-found',
      title: 'Página no encontrada',
      element: 'galeno-placeholder',
      load: placeholderModule,
      description: 'La ruta solicitada no existe.',
    },
    params: {},
  };
}
