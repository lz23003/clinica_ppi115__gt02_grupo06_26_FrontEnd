export class RegistroPaso {
  constructor({ notas = '', diagnostico = '', plan = '' } = {}) {
    this.notas = notas;
    this.diagnostico = diagnostico;
    this.plan = plan;
  }

  serializar() {
    return JSON.stringify({
      notas: this.notas,
      diagnostico: this.diagnostico,
      plan: this.plan
    });
  }

  static parsear(valor) {
    if (!valor) return new RegistroPaso();

    try {
      const registro = JSON.parse(valor);
      if (registro && typeof registro === 'object' && !Array.isArray(registro)) {
        return new RegistroPaso({
          notas: typeof registro.notas === 'string' ? registro.notas : '',
          diagnostico: typeof registro.diagnostico === 'string' ? registro.diagnostico : '',
          plan: typeof registro.plan === 'string' ? registro.plan : ''
        });
      }
    } catch {
      // Los registros anteriores al formato JSON se leen abajo.
    }

    const texto = String(valor);
    const antiguo = texto.match(
      /^NOTAS:\s*([\s\S]*?)\s*\|\s*DIAGNÓSTICO:\s*([\s\S]*?)\s*\|\s*PLAN:\s*([\s\S]*)$/i
    );
    if (!antiguo) return new RegistroPaso({ notas: texto });

    return new RegistroPaso({
      notas: antiguo[1].trim(),
      diagnostico: antiguo[2].trim(),
      plan: antiguo[3].trim()
    });
  }
}
