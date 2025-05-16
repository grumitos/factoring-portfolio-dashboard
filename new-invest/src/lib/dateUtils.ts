export function parseDate(fechaStr: string): Date {
  if (!fechaStr) throw new Error('Fecha no puede ser vacía o nula.');
  // ISO con zona
  if (fechaStr.includes('T') && fechaStr.includes('Z')) {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) throw new Error(`Formato de fecha ISO inválido: ${fechaStr}`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  // yyyy-MM-dd
  const isoParts = fechaStr.split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const [y, m, day] = isoParts.map((v,i)=>(i===0?parseInt(v,10):i===1?parseInt(v,10)-1:parseInt(v,10)));
    if ([y,m,day].every(v=>!isNaN(v))) {
      return new Date(Date.UTC(y, m, day));
    }
  }
  // dd/MM/yyyy
  const slash = fechaStr.split('/');
  if (slash.length===3) {
    const [d, m, y] = slash.map((v,i)=>(i===2?parseInt(v,10):i===1?parseInt(v,10)-1:parseInt(v,10)));
    if ([y,m,d].every(v=>!isNaN(v))) {
      return new Date(Date.UTC(y, m, d));
    }
  }
  // Fallback
  const generic = new Date(fechaStr);
  if (!isNaN(generic.getTime())) {
    return new Date(Date.UTC(generic.getFullYear(), generic.getMonth(), generic.getDate()));
  }
  throw new Error(`Formato de fecha inválido o no reconocido: ${fechaStr}`);
}

export function calcularFechaFutura(años: number, meses: number): Date | null {
  if (!isFinite(años) || !isFinite(meses)) return null;
  const hoy = new Date();
  const futura = new Date(hoy);
  futura.setFullYear(hoy.getFullYear()+años);
  futura.setMonth(hoy.getMonth()+meses);
  return futura;
}

export function formatDate(date: Date, format: 'short' | 'long' = 'short'): string {
  if (!date || isNaN(date.getTime())) return '';
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  if (format === 'short') {
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
