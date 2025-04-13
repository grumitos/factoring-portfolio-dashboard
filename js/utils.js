const CONFIG = {
  TASAS: {
    CAMBIO_USD_PEN: 3.7
  },
  METAS: {
    MILLONES: 2000000,
    APORTE_MENSUAL: 6000
  },
  AJUSTES: {
    PENDING_GAIN_DISCOUNT_FACTOR: 0.95
  }
};

const TASA_CAMBIO_USD_PEN = CONFIG.TASAS.CAMBIO_USD_PEN;
const META_MILLONES = CONFIG.METAS.MILLONES;
const APORTE_MENSUAL = CONFIG.METAS.APORTE_MENSUAL;
const PENDING_GAIN_DISCOUNT_FACTOR = CONFIG.AJUSTES.PENDING_GAIN_DISCOUNT_FACTOR;

const formatUtils = {
  currencyFormatter: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }),
  
  percentFormatter: new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }),
  
  currency: (value, moneda = "PEN") => {
    const symbol = moneda.toUpperCase() === "USD" ? "$" : "S/";
    return `${symbol}${formatUtils.currencyFormatter.format(value || 0)}`;
  },

  percentage: (value) => {
    return `${formatUtils.percentFormatter.format(value || 0)}%`;
  },

  compactNumber: (value, currency = 'PEN') => {
    const symbol = currency === 'USD' ? '$' : 'S/';
    if (value >= 1000000) return `${symbol} ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${symbol} ${(value / 1000).toFixed(0)}k`;
    return `${symbol} ${value}`;
  },

  date: (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
      return adjustedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Fecha Inválida';
    }
  },

  dateShort: (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString + 'T00:00:00Z');
      if (isNaN(date.getTime())) throw new Error("Invalid date");
      return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', timeZone: 'UTC' }); 
    } catch (e) {
      console.warn("Error formateando fecha corta:", dateString, e);
      return 'Fecha Inv.';
    }
  },

  dateForMeta: (date) => {
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
};

const dateUtils = {
  parse: (fechaStr) => {
    const partes = fechaStr.split('-').map(Number);
    if (partes.length !== 3 || partes.some(isNaN))
      throw new Error(`Formato de fecha inválido: ${fechaStr}`);
    return new Date(partes[0], partes[1] - 1, partes[2]);
  },

  calcularFechaFutura: (años, meses) => {
    if (!isFinite(años) || !isFinite(meses)) {
      return null; // No se puede calcular fecha si el tiempo es infinito
    }
    const hoy = new Date();
    const fechaFutura = new Date(hoy);
    fechaFutura.setFullYear(hoy.getFullYear() + años);
    fechaFutura.setMonth(hoy.getMonth() + meses);
    return fechaFutura;
  },

  format: (date, format = 'short') => {
    if (!date) return '';
    
    if (format === 'short') {
      return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    } else if (format === 'long') {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
    }
    
    return date.toLocaleDateString();
  }
};

const financeUtils = {
  convertirAPEN: (monto, moneda = "PEN") => {
    return moneda.toUpperCase() === "USD" ? monto * TASA_CAMBIO_USD_PEN : monto;
  },

  xnpv: (r, flujos) => {
    const d0 = flujos[0].date;
    const msPorAno = 1000 * 3600 * 24 * 365.25;
    return flujos.reduce((acum, flujo) => {
      const t = (flujo.date - d0) / msPorAno;
      return acum + flujo.amount / Math.pow(1 + r, t);
    }, 0);
  },

  dxnpv: (r, flujos) => {
    const d0 = flujos[0].date;
    const msPorAno = 1000 * 3600 * 24 * 365.25;
    return flujos.reduce((acum, flujo) => {
      const t = (flujo.date - d0) / msPorAno;
      return acum - (t * flujo.amount) / Math.pow(1 + r, t + 1);
    }, 0);
  },

  xirr: (flujos, g = 0.1) => {
    let r = g;
    for (let i = 0; i < 100; i++) {
      const f = financeUtils.xnpv(r, flujos);
      const fp = financeUtils.dxnpv(r, flujos);
      if (Math.abs(fp) < 1e-14) break;
      const nr = r - f / fp;
      if (Math.abs(nr - r) <= 1e-7) {
        r = nr;
        break;
      }
      r = nr;
    }
    return r;
  },

  calcularTasaAnualizada: (flujos) => {
    const irr = financeUtils.xirr(flujos);
    return isNaN(irr) ? 0 : irr * 100;
  },

  buildCashFlowData: (factoringList, additionalFlows = []) => {
    let flows = [];
    factoringList.forEach(contrato => {
      const moneda = contrato.moneda ? contrato.moneda.toUpperCase() : "PEN";
      const principal = Number(contrato.monto) || 0;
      const principalPEN = financeUtils.convertirAPEN(principal, moneda);

      const fechaInversion = dateUtils.parse(contrato.fechaIngreso);
      flows.push({ date: fechaInversion, amount: -principalPEN });

      const fechaPago = dateUtils.parse(contrato.fechaPagoReal || contrato.fechaPagoEstimado);
      const ganancia = Number(contrato.montoPagoNeto) || 0;
      const gananciaPEN = financeUtils.convertirAPEN(ganancia, moneda);
      flows.push({ date: fechaPago, amount: principalPEN + gananciaPEN });
    });

    additionalFlows.forEach(flow => {
      flows.push({
        date: dateUtils.parse(flow.date),
        amount: flow.amount
      });
    });

    flows.sort((a, b) => a.date - b.date);
    return flows;
  },

  calcularTiempoHastaMeta: (capitalInicial, tasaAnual, metaMillones = CONFIG.METAS.MILLONES, aporteMensual = CONFIG.METAS.APORTE_MENSUAL) => {
    // Validar entradas iniciales
    if (isNaN(capitalInicial) || isNaN(tasaAnual) || isNaN(metaMillones) || isNaN(aporteMensual)) {
        console.warn("Inputs inválidos para calcularTiempoHastaMeta:", { capitalInicial, tasaAnual, metaMillones, aporteMensual });
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    const tasaMensual = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;

    // Validar tasa mensual calculada
    if (isNaN(tasaMensual)) {
        console.warn("Tasa mensual calculada es NaN:", { tasaAnual });
        // Si la tasa es NaN pero hay aportes y el capital es menor a la meta, podría ser alcanzable,
        // pero la fórmula actual no lo soporta. Devolvemos Inalcanzable por seguridad.
        // Si no hay aportes o el capital ya es mayor, el resultado es trivial.
        if (aporteMensual <= 0 && capitalInicial < metaMillones) {
             return { años: Infinity, meses: Infinity, fechaEstimada: null };
        }
         // Si ya se alcanzó o hay aportes, la tasa NaN no impide el cálculo (se tratará como 0 en la iteración)
         // aunque esto es matemáticamente impreciso. Mejor devolver inalcanzable si la tasa es inválida.
         return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }


    let saldo = capitalInicial;
    let meses = 0;
    const MAX_MESES = 1200; // Límite de 100 años

    // Casos base
    if (saldo >= metaMillones) {
        return { años: 0, meses: 0, fechaEstimada: dateUtils.calcularFechaFutura(0, 0) };
    }
    // Si la tasa es no positiva, no hay aportes, y no se ha alcanzado la meta, es inalcanzable.
    if (tasaMensual <= 0 && aporteMensual <= 0) {
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }


    while (saldo < metaMillones && meses < MAX_MESES) {
      // Aplicar interés (si la tasa es válida) y luego aporte
      if (!isNaN(tasaMensual)) {
          saldo = saldo * (1 + tasaMensual);
      }
      saldo += aporteMensual;
      meses++;

      // Seguridad contra bucles infinitos si algo sale mal (ej. saldo se vuelve NaN)
      if (isNaN(saldo)) {
          console.warn("Saldo se volvió NaN durante el cálculo de la meta.");
          return { años: Infinity, meses: Infinity, fechaEstimada: null };
      }
    }

    // Verificar si se alcanzó la meta al salir del bucle
    if (saldo < metaMillones || meses >= MAX_MESES) {
      // Si el saldo sigue siendo menor O se alcanzó el límite de meses, es inalcanzable
      return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    // Si se alcanzó la meta
    const años = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    return {
      años,
      meses: mesesRestantes,
      fechaEstimada: dateUtils.calcularFechaFutura(años, mesesRestantes)
    };
  }
};