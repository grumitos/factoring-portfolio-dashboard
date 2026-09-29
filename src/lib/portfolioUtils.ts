import { parseISO, differenceInMilliseconds } from 'date-fns';

export interface InvestmentDetail {
  codigo: string;
  cliente: string;
  fechaIngreso: string;
  fechaPago: string;
  inversion: number;
  moneda: 'PEN' | 'USD';
  retornoMensualPct: number;
  estado: string;
  /** Calificación de riesgo de la subasta (A+, A, B, C) */
  riesgo?: string;
  fxRate?: number;
}

export interface Earning {
  codigo: string;
  monto: number;
  fecha: string;
  moneda: 'PEN' | 'USD';
  fxRate?: number;
}

const DAYS_PER_MONTH = 30.4375;

/** Convierte un monto en USD a PEN usando fxRate */
export const toPen = (amount: number, fxRate: number): number => amount * fxRate;

/** Tipo de cambio aplicable a un registro: 1 para PEN, el propio o el por defecto para USD */
export const resolveFx = (
  currency: 'PEN' | 'USD',
  ownFxRate: number | undefined,
  defaultFxRate: number
): number => (currency === 'USD' ? (ownFxRate ?? defaultFxRate) : 1);

/** Calcula meses exactos entre dos fechas incluyendo horas */
export const monthsBetween = (start: Date, end: Date): number => {
  const ms = differenceInMilliseconds(end, start);
  return ms / (1000 * 60 * 60 * 24) / DAYS_PER_MONTH;
};

/** Ganancia compuesta esperada de un contrato entre dos fechas (mismas unidades que el principal) */
export const expectedGain = (
  principal: number,
  monthlyPct: number,
  startDate: Date,
  endDate: Date
): number => principal * (Math.pow(1 + monthlyPct / 100, monthsBetween(startDate, endDate)) - 1);

/** Calcula tasa anualizada de un contrato */
export const annualRateForContract = (
  principal: number,
  gain: number,
  startDate: Date,
  endDate: Date
): number => {
  if (principal <= 0) return 0;
  const months = monthsBetween(startDate, endDate);
  if (months <= 0) return 0;
  const finalAmount = principal + gain;
  if (finalAmount <= 0) return 0;
  const rMonth = Math.pow(finalAmount / principal, 1 / months) - 1;
  if (!Number.isFinite(rMonth)) return 0;
  return Math.pow(1 + rMonth, 12) - 1;
};

/**
 * Calcula tasa anual promedio ponderada de contratos
 * (cobrados y pendientes, omitiendo los rechazados).
 */
export const calculateAnnualizedPortfolioRate = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  defaultFxRate: number
): number => {
  const earningMap = new Map<string, { amountPen: number; latestDate: Date }>();
  earnings.forEach(e => {
    const date = parseISO(e.fecha);
    const amountPen = toPen(e.monto, resolveFx(e.moneda, e.fxRate, defaultFxRate));
    const existing = earningMap.get(e.codigo);
    if (existing) {
      existing.amountPen += amountPen;
      if (date > existing.latestDate) existing.latestDate = date;
      return;
    }
    earningMap.set(e.codigo, { amountPen, latestDate: date });
  });

  let weightedSum = 0;
  let totalPrincipalPen = 0;

  investments.forEach(inv => {
    const est = inv.estado.trim().toLowerCase();
    if (est === 'rechazado') return;

    const start = parseISO(inv.fechaIngreso);
    const planned = parseISO(inv.fechaPago);
    const principalPen = toPen(inv.inversion, resolveFx(inv.moneda, inv.fxRate, defaultFxRate));

    let gainPen: number;
    let endDate: Date;
    const real = earningMap.get(inv.codigo);

    if (real) {
      gainPen = real.amountPen;
      endDate = real.latestDate;
    } else {
      gainPen = expectedGain(principalPen, inv.retornoMensualPct, start, planned);
      endDate = planned;
    }

    const tasaAnual = annualRateForContract(principalPen, gainPen, start, endDate);
    weightedSum += principalPen * tasaAnual;
    totalPrincipalPen += principalPen;
  });

  return totalPrincipalPen > 0 ? (weightedSum / totalPrincipalPen) * 100 : 0;
};
