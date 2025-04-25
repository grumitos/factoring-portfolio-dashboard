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
      return null;
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
    return moneda.toUpperCase() === "USD" ? monto * CONFIG.TASAS.CAMBIO_USD_PEN : monto;
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
    if (isNaN(capitalInicial) || isNaN(tasaAnual) || isNaN(metaMillones) || isNaN(aporteMensual)) {
        console.warn("Inputs inválidos para calcularTiempoHastaMeta:", { capitalInicial, tasaAnual, metaMillones, aporteMensual });
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    const tasaMensual = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;

    if (capitalInicial >= metaMillones) {
        return { años: 0, meses: 0, fechaEstimada: dateUtils.calcularFechaFutura(0, 0) };
    }
    if (isNaN(tasaMensual) || (tasaMensual <= 0 && aporteMensual <= 0)) {
        console.warn("Tasa o aportes insuficientes para alcanzar la meta:", { tasaAnual, tasaMensual, aporteMensual });
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    let saldo = capitalInicial;
    let meses = 0;
    const MAX_MESES = 1200; // ~100 años

    while (saldo < metaMillones && meses < MAX_MESES) {
      saldo = saldo * (1 + tasaMensual) + aporteMensual;
      meses++;

      if (isNaN(saldo)) {
          console.warn("Saldo se volvió NaN durante el cálculo de la meta.");
          return { años: Infinity, meses: Infinity, fechaEstimada: null };
      }
    }

    if (meses >= MAX_MESES || saldo < metaMillones) {
      return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    const años = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    return {
      años,
      meses: mesesRestantes,
      fechaEstimada: dateUtils.calcularFechaFutura(años, mesesRestantes)
    };
  }
};