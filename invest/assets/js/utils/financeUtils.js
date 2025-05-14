import { CONFIG } from '../config/appConfig.js';
import { dateUtils } from '../utils/dateUtils.js';

export const financeUtils = {
  convertirAPEN: (monto, moneda = "PEN") => {
    return moneda.toUpperCase() === "USD" ? monto * CONFIG.TASAS.CAMBIO_USD_PEN : monto;
  },

  xnpv: (r, flujos) => {
    if (!flujos || flujos.length === 0) return 0;
    const d0 = flujos[0].date;
    const msPorAno = 1000 * 3600 * 24 * 365.25; // Consider leap years
    return flujos.reduce((acum, flujo) => {
      const t = (flujo.date.getTime() - d0.getTime()) / msPorAno;
      return acum + flujo.amount / Math.pow(1 + r, t);
    }, 0);
  },

  dxnpv: (r, flujos) => {
    if (!flujos || flujos.length === 0) return 0;
    const d0 = flujos[0].date;
    const msPorAno = 1000 * 3600 * 24 * 365.25;
    return flujos.reduce((acum, flujo) => {
      const t = (flujo.date.getTime() - d0.getTime()) / msPorAno;
      if (t === 0 && flujo.amount === 0) return acum; // Avoid division by zero or NaN for first 0 amount flow
      return acum - (t * flujo.amount) / Math.pow(1 + r, t + 1);
    }, 0);
  },

  xirr: (flujos, g = 0.1) => {
    if (!flujos || flujos.length < 2) return NaN; // Need at least one inflow and one outflow

    let r = g;
    for (let i = 0; i < 100; i++) { // Max 100 iterations for Newton-Raphson
      const f = financeUtils.xnpv(r, flujos);
      const fp = financeUtils.dxnpv(r, flujos);
      
      if (Math.abs(fp) < 1e-14) { // Derivative is too small, cannot proceed
          // If f is also small, we might be at a solution
          if (Math.abs(f) < 1e-7) break; 
          return NaN; // Otherwise, no solution found
      }
      
      const nr = r - f / fp;
      if (Math.abs(nr - r) <= 1e-7) { // Converged
        r = nr;
        break;
      }
      r = nr;
      if (i === 99) return NaN; // Did not converge
    }
    return r;
  },

  calcularTasaAnualizada: (flujos) => {
    if (!flujos || flujos.length < 2) return 0;
    const irr = financeUtils.xirr(flujos);
    return isNaN(irr) || !isFinite(irr) ? 0 : irr * 100;
  },

  buildCashFlowData: (factoringList, additionalFlows = []) => {
    let flows = [];
    factoringList.forEach(contrato => {
      if (!contrato || !contrato.fechaIngreso || (!contrato.fechaPagoReal && !contrato.fechaPagoEstimado)) {
        return; // Skip invalid contracts
      }
      
      const moneda = contrato.moneda ? contrato.moneda.toUpperCase() : "PEN";
      const principal = Number(contrato.monto) || 0;
      const principalPEN = financeUtils.convertirAPEN(principal, moneda);

      try {
        const fechaInversion = dateUtils.parse(contrato.fechaIngreso);
        flows.push({ date: fechaInversion, amount: -principalPEN });

        const fechaPagoStr = contrato.fechaPagoReal || contrato.fechaPagoEstimado;
        const fechaPago = dateUtils.parse(fechaPagoStr);
        const ganancia = Number(contrato.montoPagoNeto) || 0;
        const gananciaPEN = financeUtils.convertirAPEN(ganancia, moneda);
        flows.push({ date: fechaPago, amount: principalPEN + gananciaPEN });
      } catch (e) {
        console.warn(`Error procesando fechas para contrato ${contrato.codigoSubasta}: ${e.message}`);
      }
    });

    additionalFlows.forEach(flow => {
      try {
        flows.push({
          date: dateUtils.parse(flow.date),
          amount: flow.amount
        });
      } catch (e) {
         console.warn(`Error procesando fechas para flujo adicional: ${e.message}`);
      }
    });

    flows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return flows;
  },

  calcularTiempoHastaMeta: (capitalInicial, tasaAnual, metaMillones = CONFIG.METAS.MILLONES, aporteMensual = CONFIG.METAS.APORTE_MENSUAL) => {
    if (isNaN(capitalInicial) || isNaN(tasaAnual) || isNaN(metaMillones) || isNaN(aporteMensual)) {
        console.warn("Inputs inválidos para calcularTiempoHastaMeta:", { capitalInicial, tasaAnual, metaMillones, aporteMensual });
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    const tasaMensualEfectiva = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;

    if (capitalInicial >= metaMillones) {
        return { años: 0, meses: 0, fechaEstimada: dateUtils.calcularFechaFutura(0, 0) };
    }
    // If rate is non-positive and no monthly contributions, goal is unreachable unless already met
    if (tasaMensualEfectiva <= 0 && aporteMensual <= 0 && capitalInicial < metaMillones) {
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }


    let saldo = capitalInicial;
    let meses = 0;
    const MAX_MESES = 1200; // Limit to ~100 years

    while (saldo < metaMillones && meses < MAX_MESES) {
      saldo = saldo * (1 + tasaMensualEfectiva) + aporteMensual;
      meses++;

      if (isNaN(saldo) || !isFinite(saldo)) { // Check for NaN or Infinity
          console.warn("Saldo se volvió NaN o Infinito durante el cálculo de la meta.");
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