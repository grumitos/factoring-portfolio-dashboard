import { parseISO } from 'date-fns';
import { supabase } from './supabaseClient';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import { calculateAnnualizedPortfolioRate, toPen, monthsBetween } from './portfolioUtils';
import { fetchLatestRate } from './fxService';
import {
  DEFAULT_FX_RATE,
  MOVEMENT_TYPES,
  PERIODIC_INJECTION,
  INJECTION_ITER_LIMIT,
  EXTERNAL_CAPITAL
} from './config';

/**
 * Movimiento de capital
 */
interface Movement {
  Movimiento: 'inversion' | 'pago capital' | string;
  Monto: number;
  Moneda: 'PEN' | 'USD';
  fxRate?: number;
}


const getInvestments = async (): Promise<InvestmentDetail[]> => {
  try {
    const { data, error } = await supabase.from('investments').select('*');
    if (error || !data) throw error;
    return (data as any[]).map(e => ({
      codigo: e['Código de subasta'],
      cliente: e['Cliente'],
      fechaIngreso: `${e['Fecha']}T${e['Hora']}`,
      fechaPago: e['Fecha de pago'],
      inversion: e['Inversion'],
      moneda: e['Moneda'] as 'PEN' | 'USD',
      retornoMensualPct: e['Retorno mensual (%)'],
      estado: e['Estado'],
      fxRate: e['Moneda'] === 'USD' ? (e as any).fxRate : undefined
    }));
  } catch {
    throw new Error('Failed to load investments from Supabase');
  }
};

const getEarnings = async (): Promise<Earning[]> => {
  try {
    const { data, error } = await supabase.from('earnings').select('*');
    if (error || !data) throw error;
    return (data as any[]).map(e => ({
      codigo: e['Código de subasta'],
      monto: e['Monto'],
      fecha: e['Fecha'],
      moneda: e['Moneda'] as 'PEN' | 'USD',
      fxRate: (e as any).fxRate
    }));
  } catch {
    throw new Error('Failed to load earnings from Supabase');
  }
};

const buildEarningsMap = (
  earnings: Earning[],
  fxRate: number
) => {
  const map = new Map<string, { monto: number; fx: number }[]>();
  earnings.forEach(e => {
    const fx = e.moneda === 'USD' ? (e.fxRate ?? fxRate) : 1;
    map.set(e.codigo, [
      ...(map.get(e.codigo) || []),
      { monto: e.monto, fx }
    ]);
  });
  return map;
};

const getMovements = async (): Promise<Movement[]> => {
  try {
    const { data, error } = await supabase.from('movements').select('*');
    if (error || !data) throw error;
    return (data as any[]).map(e => ({
      Movimiento: e['Movimiento'],
      Monto: e['Monto'],
      Moneda: e['Moneda'] as 'PEN' | 'USD',
      fxRate: (e as any).fxRate
    }));
  } catch {
    throw new Error('Failed to load movements from Supabase');
  }
};


/**
 * Retorna el neto invertido en PEN y USD
 */
export const getNetInvestedByCurrency = async () => {
  const invested = (movs: Movement[]) =>
    movs.filter(m => m.Movimiento === 'inversion')
        .reduce((s, m) => s + m.Monto * (m.fxRate ?? 1), 0) -
    movs.filter(m => m.Movimiento === 'pago capital')
        .reduce((s, m) => s + m.Monto * (m.fxRate ?? 1), 0);

  const free = (movs: Movement[], currency: 'PEN' | 'USD') => {
    const adds = MOVEMENT_TYPES[currency].adds;
    const subs = MOVEMENT_TYPES[currency].subs;
    return movs.reduce((acc, m) => {
      if (adds.includes(m.Movimiento)) return acc + m.Monto * (m.fxRate ?? 1);
      if (subs.includes(m.Movimiento)) return acc - m.Monto * (m.fxRate ?? 1);
      return acc;
    }, 0);
  };

  const allMovs = await getMovements();
  const penMovs = allMovs.filter(m => m.Moneda === 'PEN');
  const usdMovs = allMovs.filter(m => m.Moneda === 'USD');

  const investedPen = invested(penMovs);
  const investedUsd = invested(usdMovs);
  const freePen     = free(penMovs, 'PEN');
  const freeUsd     = free(usdMovs, 'USD');

  return {
    netPen: investedPen + freePen + EXTERNAL_CAPITAL.pen,
    netUsd: investedUsd + freeUsd + EXTERNAL_CAPITAL.usd,
    investedPen,
    investedUsd,
    freePen,
    freeUsd
  };
};


/**
 * Obtiene ganancias reales y proyectadas
 */
export const getGains = async (defaultFxRate = DEFAULT_FX_RATE) => {
  const investments = await getInvestments();
  const earnings = await getEarnings();
  let real = 0;
  let expected = 0;

  const earnMap = buildEarningsMap(earnings, defaultFxRate);

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
export const getMonthlyGains = async (defaultFxRate = DEFAULT_FX_RATE) => {
  const investments = await getInvestments();
  const earnings = await getEarnings();
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(now.getMonth() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
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
    const payment = parseISO(inv.fechaPago);
    if (
      est !== 'rechazado' &&
      est !== 'cobrado' &&
      payment >= thisMonthStart &&
      payment < nextMonthStart
    ) {
      if (inv.moneda === 'USD') {
        expectedMonthlyUsd += inv.inversion * (inv.retornoMensualPct / 100);
        expectedMonthlyPen +=
          inv.inversion * (inv.fxRate ?? defaultFxRate) * (inv.retornoMensualPct / 100);
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
  defaultFxRate = DEFAULT_FX_RATE
): Promise<PortfolioReport> => {
  // obtener tasa real de USD→PEN
  try {
    defaultFxRate = await fetchLatestRate();
  } catch {
    // fallback a tasa estática
  }
  const { netPen, netUsd } = await getNetInvestedByCurrency();
  const earnings = await getEarnings();
  const investments = await getInvestments();
  const annualRatePct = calculateAnnualizedPortfolioRate(
    investments,
    earnings,
    defaultFxRate
  );
  const { real, expected, total } = await getGains(defaultFxRate);
  const {
    realMonthlyPen,
    expectedMonthlyPen,
    realMonthlyUsd,
    expectedMonthlyUsd
  } = await getMonthlyGains(defaultFxRate);

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
export const getTimeToGoalWithInjection = async (
  report: PortfolioReport,
  goalPen: number,
  injection: number = PERIODIC_INJECTION,
  defaultFxRate: number = DEFAULT_FX_RATE
): Promise<{ months: number; years: number }> => {
  try {
    defaultFxRate = await fetchLatestRate();
  } catch {
    // mantener valor por defecto
  }

  // derivar tasa mensual efectiva
  const rMonth = Math.pow(1 + report.annualRatePct / 100, 1 / 12) - 1;
  // factor de crecimiento en medio mes
  const halfFactor = Math.pow(1 + rMonth, 0.5);

  // incluir capital en USD convertido a PEN
  let balance = report.netPen + report.netUsd * defaultFxRate;
  let k = 0; // contador de medio meses

  while (balance < goalPen && k < INJECTION_ITER_LIMIT) {
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
 * considerando el capital en USD convertido a PEN.
 */
/**
 * Obtiene el reporte de portafolio y calcula el % de avance (sin considerar inyección)
 */
export const getReportMetrics = async (
  goalPen: number,
  defaultFxRate = DEFAULT_FX_RATE
): Promise<{ report: PortfolioReport; progressPct: number }> => {
  const report = await getPortfolioReport(defaultFxRate);
  // incluir inversiones en USD convertidas a PEN al calcular avance
  const totalInvestedPen = report.netPen + report.netUsd * defaultFxRate;
  const progressPct = (totalInvestedPen / goalPen) * 100;
  return { report, progressPct };
};

export type FactoringContract = InvestmentDetail & { gainPen: number };

export const getFactoringContracts = async (
  defaultFxRate = DEFAULT_FX_RATE
): Promise<FactoringContract[]> => {
  const investments = await getInvestments();
  const earnings = await getEarnings();

  const earnMap = buildEarningsMap(earnings, defaultFxRate);

  return investments.map(inv => {
    const fxInv = inv.moneda === 'USD' ? (inv.fxRate ?? defaultFxRate) : 1;
    const principalPen = toPen(inv.inversion, fxInv);
    const start = parseISO(inv.fechaIngreso);
    const end = parseISO(inv.fechaPago);

    let gainPen = 0;
    const real = earnMap.get(inv.codigo);
    if (real) {
      real.forEach(r => {
        gainPen += toPen(r.monto, r.fx);
      });
    } else {
      const months = monthsBetween(start, end);
      gainPen = principalPen * (Math.pow(1 + inv.retornoMensualPct / 100, months) - 1);
    }

    return { ...inv, gainPen };
  });
};

export const getFactoringMetrics = async (defaultFxRate = DEFAULT_FX_RATE) => {
  const contracts = await getFactoringContracts(defaultFxRate);
  const valid = contracts.filter(c => c.estado.toLowerCase() !== 'rechazado');
  const pending = valid.filter(c => c.estado.toLowerCase() !== 'cobrado').length;
  const paid = valid.filter(c => c.estado.toLowerCase() === 'cobrado').length;
  const totalGain = valid.reduce((s, c) => s + c.gainPen, 0);
  return { contracts, pending, paid, total: valid.length, totalGain };
};

/**
 * Calcula la etiqueta de fecha proyectada para la meta con inyección
 */
export const getInjectionTrendLabel = (months: number) => {
	const projectedDateInjection = new Date();
	projectedDateInjection.setMonth(projectedDateInjection.getMonth() + Math.round(months));
	return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(projectedDateInjection);
};
