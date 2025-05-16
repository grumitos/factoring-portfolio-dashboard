import { CONFIG } from './config';
import { parseDate } from './dateUtils';

export interface CashFlow { date: Date; amount: number; }

export function convertirAPEN(monto: number, moneda: 'PEN' | 'USD' = 'PEN'): number {
  return moneda === 'USD' ? monto * CONFIG.TASAS.CAMBIO_USD_PEN : monto;
}

function xnpv(r: number, flows: CashFlow[]): number {
  if (!flows.length) return 0;
  const d0 = flows[0].date;
  const msYear = 1000 * 3600 * 24 * 365.25;
  return flows.reduce((sum, f) => {
    const t = (f.date.getTime() - d0.getTime()) / msYear;
    return sum + f.amount / Math.pow(1 + r, t);
  }, 0);
}

function dxnpv(r: number, flows: CashFlow[]): number {
  if (!flows.length) return 0;
  const d0 = flows[0].date;
  const msYear = 1000 * 3600 * 24 * 365.25;
  return flows.reduce((sum, f) => {
    const t = (f.date.getTime() - d0.getTime()) / msYear;
    return sum - (t * f.amount) / Math.pow(1 + r, t + 1);
  }, 0);
}

export function calcularTasaAnualizada(flows: CashFlow[]): number {
  if (flows.length < 2) return 0;
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = xnpv(r, flows);
    const fp = dxnpv(r, flows);
    if (Math.abs(fp) < 1e-14) break;
    const nr = r - f / fp;
    if (Math.abs(nr - r) < 1e-7) { r = nr; break; }
    r = nr;
  }
  return isNaN(r) ? 0 : r * 100;
}

export function buildCashFlowData(contracts: any[]): CashFlow[] {
  const flows: CashFlow[] = [];
  contracts.forEach(c => {
    try {
      const fechaIn = parseDate(c.fechaIngreso);
      flows.push({ date: fechaIn, amount: -convertirAPEN(c.monto, c.moneda) });
      const fechaOut = parseDate(c.fechaPagoReal || c.fechaPagoEstimado);
      const total = c.monto + c.montoPagoNeto;
      flows.push({ date: fechaOut, amount: convertirAPEN(total, c.moneda) });
    } catch {
      // skip invalid
    }
  });
  flows.sort((a,b) => a.date.getTime() - b.date.getTime());
  return flows;
}
