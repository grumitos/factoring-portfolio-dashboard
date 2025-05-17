import { parseISO } from 'date-fns';
import investmentsJson from '../data/investmentDetails.json';
import earningsPenJson from '../data/earningsPEN.json';
import earningsUsdJson from '../data/earningsUSD.json';
import movementsPenJson from '../data/movementsPEN.json';
import movementsUsdJson from '../data/movementsUSD.json';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import { calculateAnnualizedPortfolioRate, toPen, monthsBetween } from './portfolioUtils';
import { fetchLatestRate } from './fxService';

/**
 * Movimiento de capital
 */
interface Movement {
  Movimiento: 'inversion' | 'pago capital' | string;
  Monto: number;
  fxRate?: number;
}

/**
 * Retorna el neto invertido en PEN y USD
 */
export const getNetInvestedByCurrency = () => {
  const calc = (movs: Movement[]) =>
    movs.filter(m => m.Movimiento === 'inversion')
      .reduce((sum, m) => sum + m.Monto * (m.fxRate ?? 1), 0)
    - movs.filter(m => m.Movimiento === 'pago capital')
      .reduce((sum, m) => sum + m.Monto * (m.fxRate ?? 1), 0);

  const netPen = calc(movementsPenJson as Movement[]);
  const netUsd = calc(movementsUsdJson as Movement[]);
  return { netPen, netUsd };
};

/**
 * Construye un array tipado de ganancias reales
 */
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

/**
 * Construye un array tipado de inversiones
 */
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

/**
 * Obtiene ganancias reales y proyectadas
 */
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

/**
 * Calcula ganancias (reales y esperadas) del último mes
 */
export const getMonthlyGains = (defaultFxRate = 3.7) => {
  const investments = buildInvestmentsArray();
  const earnings = buildEarningsArray();
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(now.getMonth() - 1);
  let realMonthlyPen = 0;
  let realMonthlyUsd = 0;
  let expectedMonthlyPen = 0;
  let expectedMonthlyUsd = 0;
  // sumar ingresos realizados en último mes por moneda
  earnings.forEach(e => {
    const date = parseISO(e.fecha);
    if (date >= oneMonthAgo && date <= now) {
      if (e.moneda === 'USD') {
        realMonthlyUsd += e.monto;
        realMonthlyPen += e.monto * (e.fxRate ?? defaultFxRate);
      } else {
        realMonthlyPen += e.monto;
      }
    }
  });
  // calcular ganancia esperada de un mes para contratos pendientes por moneda
  investments.forEach(inv => {
    const est = inv.estado.toLowerCase();
    if (est !== 'rechazado' && est !== 'cobrado') {
      if (inv.moneda === 'USD') {
        expectedMonthlyUsd += inv.inversion * (inv.retornoMensualPct / 100);
        expectedMonthlyPen += inv.inversion * (inv.fxRate ?? defaultFxRate) * (inv.retornoMensualPct / 100);
      } else {
        expectedMonthlyPen += inv.inversion * (inv.retornoMensualPct / 100);
      }
    }
  });
  return { realMonthlyPen, expectedMonthlyPen, realMonthlyUsd, expectedMonthlyUsd };
};

/**
 * Tipo de reporte de portafolio
 */
export type PortfolioReport = {
  netPen: number;
  netUsd: number;
  annualRatePct: number;
  gainRealPen: number;
  gainExpectedPen: number;
  gainTotalPen: number;
  // ganancias del último mes en PEN
  gainRealLastMonth: number;
  gainExpectedLastMonth: number;
  // ganancias del último mes en USD
  gainRealLastMonthUsd: number;
  gainExpectedLastMonthUsd: number;
};

/**
 * Genera el reporte completo de portafolio
 */
export const getPortfolioReport = async (
  defaultFxRate = 3.7
): Promise<PortfolioReport> => {
  // obtener tasa real de USD→PEN
  try {
    defaultFxRate = await fetchLatestRate();
  } catch {
    // fallback a tasa estática
  }
  const { netPen, netUsd } = getNetInvestedByCurrency();
  const earnings = buildEarningsArray();
  const investments = buildInvestmentsArray();
  const annualRatePct = calculateAnnualizedPortfolioRate(
    investments,
    earnings,
    defaultFxRate
  );
  const { real, expected, total } = getGains(defaultFxRate);
  const {
    realMonthlyPen,
    expectedMonthlyPen,
    realMonthlyUsd,
    expectedMonthlyUsd
  } = getMonthlyGains(defaultFxRate);

  return {
    netPen,
    netUsd,
    annualRatePct,
    gainRealPen: real,
    gainExpectedPen: expected,
    gainTotalPen: total,
    gainRealLastMonth: realMonthlyPen,
    gainExpectedLastMonth: expectedMonthlyPen,
    gainRealLastMonthUsd: realMonthlyUsd,
    gainExpectedLastMonthUsd: expectedMonthlyUsd
  };
};

/**
 * Calcula el tiempo estimado (meses y años) para alcanzar una meta
 * con aportes periódicos de S/6 000 a mitad de cada mes.
 */
export const getTimeToGoalWithInjection = (
  report: PortfolioReport,
  goalPen: number,
  injection: number = 6000,
  defaultFxRate: number = 3.7
): { months: number; years: number } => {
  // derivar tasa mensual efectiva
  const rMonth = Math.pow(1 + report.annualRatePct / 100, 1 / 12) - 1;
  // factor de crecimiento en medio mes
  const halfFactor = Math.pow(1 + rMonth, 0.5);

  // incluir capital en USD convertido a PEN
  let balance = report.netPen + report.netUsd * defaultFxRate;
  let k = 0; // contador de medio meses

  while (balance < goalPen && k < 5000) {
    k++;
    // aplicar crecimiento de medio mes
    balance *= halfFactor;
    // inyección de S/6 000 en cada medio mes impar
    if (k % 2 === 1) balance += injection;
  }

  const months = k * 0.5;
  const years  = months / 12;
  return { months, years };
};

/**
 * Calcula porcentaje de avance y fecha estimada sin inyección
 */
export const getGoalProjection = (
  report: PortfolioReport,
  goalPen: number
): { progressPct: number; trendLabel: string } => {
  const progressPct = (report.netPen / goalPen) * 100;
  const rAnnual = report.annualRatePct / 100;
  const yearsToGoal = Math.log(goalPen / report.netPen) / Math.log(1 + rAnnual);
  const projected = new Date();
  projected.setMonth(projected.getMonth() + Math.round(yearsToGoal * 12));
  const trendLabel = new Intl.DateTimeFormat('es-PE', {
    month: 'long',
    year: 'numeric',
  }).format(projected);
  return { progressPct, trendLabel };
};

/**
 * Obtiene el reporte de portafolio y calcula el % de avance (sin considerar inyección)
 */
export const getReportMetrics = async (
  goalPen: number,
  defaultFxRate = 3.7
): Promise<{ report: PortfolioReport; progressPct: number }> => {
  const report = await getPortfolioReport(defaultFxRate);
  // incluir inversiones en USD convertidas a PEN al calcular avance
  const totalInvestedPen = report.netPen + report.netUsd * defaultFxRate;
  const progressPct = (totalInvestedPen / goalPen) * 100;
  return { report, progressPct };
};

/**
 * Calcula la etiqueta de fecha proyectada para la meta con inyección
 */
export const getInjectionTrendLabel = (months: number) => {
	const projectedDateInjection = new Date();
	projectedDateInjection.setMonth(projectedDateInjection.getMonth() + Math.round(months));
	return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(projectedDateInjection);
};