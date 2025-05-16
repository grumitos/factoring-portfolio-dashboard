/* DataService.ts */
import { parseISO } from 'date-fns';
import investmentsJson from '../data/investmentDetails.json';
import earningsPenJson from '../data/earningsPEN.json';
import earningsUsdJson from '../data/earningsUSD.json';
import movementsPenJson from '../data/movementsPEN.json';
import movementsUsdJson from '../data/movementsUSD.json';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import {
  calculateAnnualizedPortfolioRate,
  toPen,
  monthsBetween
} from './portfolioUtils';

interface Movement {
  Movimiento: 'inversion' | 'pago capital' | string;
  Monto: number;
  fxRate?: number;
}

// Neto invertido por divisa
export const getNetInvestedByCurrency = () => {
  const calc = (movs: Movement[]) =>
    movs.filter(m => m.Movimiento === 'inversion')
      .reduce((sum, m) => sum + m.Monto * (m.fxRate ?? 1), 0) -
    movs.filter(m => m.Movimiento === 'pago capital')
      .reduce((sum, m) => sum + m.Monto * (m.fxRate ?? 1), 0);

  const netPen = calc(movementsPenJson as Movement[]);
  const netUsd = calc(movementsUsdJson as Movement[]);
  return { netPen, netUsd };
};

// Construye array tipado de ganancias
const buildEarningsArray = (): Earning[] => [
  ...earningsPenJson.map((e: any) => ({
    codigo: e['Código de subasta'],
    monto: e['Monto'],
    fecha: e['Fecha'],
    moneda: 'PEN' as 'PEN'
  })),
  ...earningsUsdJson.map((e: any) => ({
    codigo: e['Código de subasta'],
    monto: e['Monto'],
    fecha: e['Fecha'],
    moneda: 'USD' as 'USD',
    fxRate: (e as any).fxRate
  }))
];

// Construye array tipado de inversiones
const buildInvestmentsArray = (): InvestmentDetail[] =>
  (investmentsJson as any[]).map((e: any) => ({
    codigo: e['Codigo de subasta'],
    fechaIngreso: `${e['Fecha']}T${e['Hora']}`,
    fechaPago: e['Fecha de pago'],
    inversion: e['Inversion'],
    moneda: e['Moneda'] as 'PEN' | 'USD',
    retornoMensualPct: e['Retorno mensual (%)'],
    estado: e['Estado'],
    fxRate: e['Moneda'] === 'USD' ? (e as any).fxRate : undefined
  }));

// Obtiene ganancias reales + esperadas
export const getGains = (defaultFxRate = 3.7) => {
  const investments = buildInvestmentsArray();
  const earnings = buildEarningsArray();
  let real = 0;
  let expected = 0;

  const earnMap = new Map<string, { monto: number; fx: number }[]>();
  earnings.forEach(e => {
    const fx = e.moneda === 'USD' ? (e.fxRate ?? defaultFxRate) : 1;
    earnMap.set(e.codigo, [
      ...(earnMap.get(e.codigo) || []),
      { monto: e.monto, fx }
    ]);
  });

  investments.forEach(inv => {
    const fxInv = inv.moneda === 'USD' ? (inv.fxRate ?? defaultFxRate) : 1;
    const principalPen = toPen(inv.inversion, fxInv);
    const start = parseISO(inv.fechaIngreso);
    const planned = parseISO(inv.fechaPago);

    if (inv.estado.toLowerCase() === 'cobrado') {
      (earnMap.get(inv.codigo) || []).forEach(r => {
        real += toPen(r.monto, r.fx);
      });
    } else if (inv.estado.toLowerCase() !== 'rechazado') {
      const months = monthsBetween(start, planned);
      expected += principalPen * (Math.pow(1 + inv.retornoMensualPct / 100, months) - 1);
    }
  });

  return { real, expected, total: real + expected };
};

// Reporte completo de portafolio
export type PortfolioReport = {
  netPen: number;
  netUsd: number;
  annualRatePct: number;
  gainRealPen: number;
  gainExpectedPen: number;
  gainTotalPen: number;
};

export const getPortfolioReport = (
  defaultFxRate = 3.7
): PortfolioReport => {
  const { netPen, netUsd } = getNetInvestedByCurrency();
  const earnings = buildEarningsArray();
  const investments = buildInvestmentsArray();
  const annualRatePct = calculateAnnualizedPortfolioRate(
    investments,
    earnings,
    defaultFxRate
  );
  const { real, expected, total } = getGains(defaultFxRate);

  return {
    netPen,
    netUsd,
    annualRatePct,
    gainRealPen: real,
    gainExpectedPen: expected,
    gainTotalPen: total
  };
};