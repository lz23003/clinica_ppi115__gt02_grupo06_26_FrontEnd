function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function esDoctor(nombreRol) {
  const rol = normalizar(nombreRol);
  return rol.includes('doctor') || rol.includes('medico');
}

export function puedeOperarPaso({ nombreRol, idPersonaLogueada, pasoEjecutado } = {}) {
  if (esDoctor(nombreRol)) return true;
  const idAsignado = pasoEjecutado?.idPersonaRol?.idPersona?.idPersona
    ?? pasoEjecutado?.idPersonaRol?.idPersona;
  return !idAsignado || idAsignado === idPersonaLogueada;
}

export function camposVisibles(nombreRol) {
  if (esDoctor(nombreRol)) {
    return {
      diagnostico: true,
      plan: true,
      examenes: true,
      etiquetaNotas: 'Notas de la Consulta Médica'
    };
  }

  if (normalizar(nombreRol).includes('enfermer')) {
    return {
      diagnostico: false,
      plan: false,
      examenes: false,
      etiquetaNotas: 'Notas de Signos Vitales'
    };
  }

  return {
    diagnostico: false,
    plan: false,
    examenes: false,
    etiquetaNotas: 'Notas de Recepción'
  };
}
