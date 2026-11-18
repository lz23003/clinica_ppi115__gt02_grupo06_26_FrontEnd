export function esPrimerPaso(indice) {
  return indice === 0;
}

export function esUltimoPaso(indice, total) {
  return total > 0 && indice === total - 1;
}

export function pasoInicial(pasos, ejecutados = []) {
  if (!pasos?.length) return 0;
  const pendientes = pasos.findIndex((paso) => {
    const ejecutado = ejecutados.find((item) =>
      item.idProcedimientoPaso?.idProcedimientoPaso === paso.idProcedimientoPaso
      || item.idProcedimientoPaso === paso.idProcedimientoPaso
    );
    return !ejecutado || ejecutado.estado !== 'FINALIZADO';
  });
  return pendientes < 0 ? pasos.length - 1 : pendientes;
}

export function consultaYaAtendida(consulta) {
  const procedimientos = consulta?.procedimientos;
  if (!Array.isArray(procedimientos) || procedimientos.length === 0) return false;
  return Boolean(consulta.fechaFin) && procedimientos.every((procedimiento) => {
    const pasos = procedimiento.pasos;
    return Array.isArray(pasos) && pasos.length > 0
      && pasos[pasos.length - 1].estado === 'FINALIZADO';
  });
}
