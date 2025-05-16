import { parseISO, differenceInMilliseconds } from 'date-fns';

export interface InvestmentDetail {
  codigo: string;
  fechaIngreso: string;   
  fechaPago: string;
  inversion: number;
  moneda: 'PEN' | 'USD';
  retornoMensualPct: number;
  estado: string;
  fxRate?: number;
}

export interface Earning {
  codigo: string;
  monto: number;
  fecha: string;
  moneda: 'PEN' | 'USD';
}

const DAYS_PER_MONTH = 30.4375;

/** Convierte un monto en USD a PEN usando fxRate */
export const toPen = (amount: number, fxRate: number): number => amount * fxRate;

/** Calcula meses aproximados entre dos fechas */
export const monthsBetween = (start: Date, end: Date): number => {
  const ms = differenceInMilliseconds(end, start);
  return ms / (1000 * 60 * 60 * 24) / DAYS_PER_MONTH;
};

/** Calcula tasa anualizada de un contrato dado principal y ganancia */
export const annualRateForContract = (
  principal: number,
  gain: number,
  startDate: Date,
  endDate: Date
): number => {
  const months = monthsBetween(startDate, endDate);
  if (months <= 0) return 0;
  const finalAmount = principal + gain;
  const rMonth = Math.pow(finalAmount / principal, 1 / months) - 1;
  return Math.pow(1 + rMonth, 12) - 1;
};

/**
 * Calcula la tasa anual promedio ponderada de un portafolio de inversiones.
 * - Convierte flujos a PEN usando fxRate histórico o default.
 * - Usa ganancias reales si existen, sino retorno mensual esperado.
 */
export const calculateAnnualizedPortfolioRate = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  defaultFxRate: number
): number => {
  // Crear mapa de ganancias reales por código
  const earningMap = new Map<string, { amountPen: number; date: Date }>();
  earnings.forEach(e => {
    const date = parseISO(e.fecha);
    const amountPen = e.moneda === 'USD' ? toPen(e.monto, defaultFxRate) : e.monto;
    earningMap.set(e.codigo, { amountPen, date });
  });

  let weightedSum = 0;
  let totalPrincipalPen = 0;

  investments.forEach(inv => {
    if (inv.estado.toLowerCase() === 'rechazado') return;

    const start = parseISO(inv.fechaIngreso);
    const planned = parseISO(inv.fechaPago);
    const fx = inv.moneda === 'USD' ? (inv.fxRate ?? defaultFxRate) : 1;
    const principalPen = toPen(inv.inversion, fx);

    let gainPen: number;
    let endDate: Date;
    const real = earningMap.get(inv.codigo);

    if (real) {
      gainPen = real.amountPen;
      endDate = real.date;
    } else {
      const months = monthsBetween(start, planned);
      gainPen = principalPen * (Math.pow(1 + inv.retornoMensualPct / 100, months) - 1);
      endDate = planned;
    }

    const tasaAnual = annualRateForContract(principalPen, gainPen, start, endDate);
    weightedSum += principalPen * tasaAnual;
    totalPrincipalPen += principalPen;
  });

  return totalPrincipalPen > 0 ? (weightedSum / totalPrincipalPen) * 100 : 0;
};