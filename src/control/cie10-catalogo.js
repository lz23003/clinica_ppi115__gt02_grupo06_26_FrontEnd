function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export function buscarCie10(catalogo, consulta) {
  const termino = normalizar(consulta).trim();
  if (!termino) return [...(catalogo ?? [])];
  return (catalogo ?? []).filter((entrada) =>
    normalizar(`${entrada.codigo ?? ''} ${entrada.descripcion ?? ''}`).includes(termino)
  );
}
