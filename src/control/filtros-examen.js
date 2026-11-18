function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export function filtrarExamenes(examenes, consulta) {
  const termino = normalizar(consulta).trim();
  if (!termino) return [...(examenes ?? [])];
  return (examenes ?? []).filter((examen) =>
    normalizar(examen.nombre).includes(termino)
  );
}
