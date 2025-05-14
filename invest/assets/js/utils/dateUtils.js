export const dateUtils = {
  parse: (fechaStr) => {
    if (!fechaStr) throw new Error('Fecha no puede ser vacía o nula.');
    
    // Intenta detectar formato yyyy-MM-ddTHH:mm:ss.sssZ (ISO) o yyyy-MM-dd
    if (fechaStr.includes('T') && fechaStr.includes('Z')) {
        const date = new Date(fechaStr);
        if (isNaN(date.getTime())) throw new Error(`Formato de fecha ISO inválido: ${fechaStr}`);
        // Ajustar a UTC para consistencia si es necesario, o extraer solo la parte de la fecha.
        // Por ahora, asumimos que la parte de la fecha es lo que importa y que es UTC.
        return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }
    
    // Intenta yyyy-MM-dd
    const isoParts = fechaStr.split('-');
    if (isoParts.length === 3 && isoParts[0].length === 4) {
        const year = parseInt(isoParts[0], 10);
        const month = parseInt(isoParts[1], 10) - 1; // Meses son 0-indexados
        const day = parseInt(isoParts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const date = new Date(Date.UTC(year, month, day)); // Usar UTC para evitar problemas de timezone
            if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
                return date;
            }
        }
    }
    
    // Intenta dd/MM/yyyy
    const slashParts = fechaStr.split('/');
if (slashParts.length === 3) {
        const day = parseInt(slashParts[0], 10);
        const month = parseInt(slashParts[1], 10) - 1; // Meses son 0-indexados
        const year = parseInt(slashParts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const date = new Date(Date.UTC(year, month, day)); // Usar UTC
             if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
                return date;
            }
        }
    }

    // Si nada funciona, intenta el constructor de Date como último recurso (puede ser inconsistente)
    const genericDate = new Date(fechaStr);
    if (!isNaN(genericDate.getTime())) {
        // Para asegurar consistencia, reconstruir con UTC si es una fecha simple sin hora
        if (!fechaStr.includes('T')) {
             return new Date(Date.UTC(genericDate.getFullYear(), genericDate.getMonth(), genericDate.getDate()));
        }
        return genericDate; // Podría tener problemas de timezone si incluye hora
    }

    throw new Error(`Formato de fecha inválido o no reconocido: ${fechaStr}`);
  },

  calcularFechaFutura: (años, meses) => {
    if (!isFinite(años) || !isFinite(meses)) {
      return null;
    }
    const hoy = new Date();
    const fechaFutura = new Date(hoy);
    fechaFutura.setFullYear(hoy.getFullYear() + años);
    fechaFutura.setMonth(hoy.getMonth() + meses);
    return fechaFutura;
  },

  format: (date, format = 'short') => {
    if (!date || isNaN(date.getTime())) return '';
    
    // Asegurarse que la fecha es interpretada como UTC si no tiene información de timezone
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    if (format === 'short') {
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
    } else if (format === 'long') {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
    }
    
    return d.toLocaleDateString('es-ES', { timeZone: 'UTC' }); // Default to es-ES format for consistency
  }
};