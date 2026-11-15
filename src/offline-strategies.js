export async function fetchPublicAppointmentSearch(request, fetcher = fetch, getOfflineFallback = null) {
  try {
    return await fetcher(request.clone());
  } catch {
    if (typeof getOfflineFallback === 'function') {
      try {
        const cachedFallback = await getOfflineFallback();
        if (cachedFallback instanceof Response) return cachedFallback;
      } catch (error) {
        console.warn('No se pudo recuperar el mensaje offline desde la caché.', error);
      }
    }
    return new Response(JSON.stringify({
      message: 'Se necesita conexión a internet para buscar citas públicas. Inténtalo nuevamente cuando estés en línea.',
      code: 'PUBLIC_APPOINTMENT_SEARCH_REQUIRES_CONNECTION',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
