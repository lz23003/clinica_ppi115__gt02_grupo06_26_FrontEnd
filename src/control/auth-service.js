import { ApiClient } from './api-client.js';
import { Persona } from '../entity/persona.js';
import { PersonaRol } from '../entity/persona-rol.js';

export class AuthService {
  constructor() {
    this.api = new ApiClient();
  }

    async login(tipoDocumentoId, valorDocumento) {
    // 1. Buscar la persona por documento
    const personaJson = await this.api.get(
      `/personas/buscar?tipoDocumento=${tipoDocumentoId}&valorDocumento=${encodeURIComponent(valorDocumento)}`
    );
    
    if (!personaJson) throw new Error('No se encontró la persona');
    const persona = Persona.fromJSON(personaJson);

    // 2. Obtener sus roles
    const rolesJson = await this.api.get(`/personas-roles/persona/${persona.idPersona}`);
    
    if (!rolesJson || rolesJson.length === 0) {
      throw new Error('El usuario no tiene roles asignados en ninguna clínica.');
    }

    //  3. FILTRO DE SEGURIDAD: Excluir a los pacientes del portal de empleados
    // Buscamos si tiene algún rol que NO sea "Paciente"
    const rolesEmpleado = rolesJson.filter(r => 
      r.idRol && r.idRol.nombre && r.idRol.nombre.toLowerCase() !== 'paciente'
    );

    if (rolesEmpleado.length === 0) {
      throw new Error('Acceso denegado. Este portal es exclusivo para empleados de la clínica.');
    }

    // Devolvemos solo los roles de empleado para que el dashboard no muestre el rol de paciente
    return { persona, roles: rolesEmpleado };
  }
}