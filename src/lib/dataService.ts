import { parseISO } from 'date-fns';
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

// ── Local JSON data ─────────────────────────────────────────

const dataModules = import.meta.glob('../data/*.json', { eager: true });

const getJsonRows = <T>(fileName: string): T[] => {
  const mod = dataModules[`../data/${fileName}`] as { default?: T[] } | T[] | undefined;
  if (!mod) return [];
  if (Array.isArray(mod)) return mod;
  return Array.isArray(mod.default) ? mod.default : [];
};

// ── JSON row types ──────────────────────────────────────────

interface InvestmentRow {
  'Código de subasta': string;
  'Cliente': string;
  'Fecha': string;
  'Hora': string;
  'Fecha de pago': string;
  'Inversion': number;
  'Moneda': 'PEN' | 'USD';
  'Retorno mensual (%)': number;
  'Estado': string;
  fxRate?: number;
}

interface EarningRow {
  'Código de subasta': string;
  'Monto': number;
  'Fecha': string;
  'Moneda': 'PEN' | 'USD';
  fxRate?: number;
}

interface MovementRow {
  'Movimiento': string;
  'Monto': number;
  'Moneda': 'PEN' | 'USD';
  fxRate?: number;
}

// ── Domain types ────────────────────────────────────────────

interface Movement {
  Movimiento: string;
  Monto: number;
  Moneda: 'PEN' | 'USD';
  fxRate?: number;
}

interface AllData {
  investments: InvestmentDetail[];
  earnings: Earning[];
  movements: Movement[];
  fxRate: number;
}

const STATUS_REJECTED = 'rechazado';
const STATUS_PAID = 'cobrado';
const MOVEMENT_INVESTMENT = 'inversion';
const MOVEMENT_CAPITAL_PAYMENT = 'pago capital';

const normalize = (value: string) => value.trim().toLowerCase();

const movementTypeSets = {
  PEN: {
    adds: new Set(MOVEMENT_TYPES.PEN.adds.map(normalize)),
    subs: new Set(MOVEMENT_TYPES.PEN.subs.map(normalize))
  },
  USD: {
    adds: new Set(MOVEMENT_TYPES.USD.adds.map(normalize)),
    subs: new Set(MOVEMENT_TYPES.USD.subs.map(normalize))
  }
} as const;

// ── Row mapping ─────────────────────────────────────────────

const mapInvestments = (rows: InvestmentRow[]): InvestmentDetail[] =>
  rows.map(e => ({
    codigo: e['Código de subasta'],
    cliente: e['Cliente'],
    fechaIngreso: `${e['Fecha']}T${e['Hora']}`,
    fechaPago: e['Fecha de pago'],
    inversion: e['Inversion'],
    moneda: e['Moneda'],
    retornoMensualPct: e['Retorno mensual (%)'],
    estado: e['Estado'],
    fxRate: e['Moneda'] === 'USD' ? e.fxRate : undefined
  }));

const mapEarnings = (rows: EarningRow[]): Earning[] =>
  rows.map(e => ({
    codigo: e['Código de subasta'],
    monto: e['Monto'],
    fecha: e['Fecha'],
    moneda: e['Moneda'],
    fxRate: e.fxRate
  }));

const mapMovements = (rows: MovementRow[]): Movement[] =>
  rows.map(e => ({
    Movimiento: e['Movimiento'],
    Monto: e['Monto'],
    Moneda: e['Moneda'],
    fxRate: e.fxRate
  }));

// ── Data loading (single entry point) ───────────────────────

/** Loads all data from local JSON + live FX rate.
 *  Cached at module level so multiple callers in the same build share one load. */
let _allDataCache: Promise<AllData> | null = null;

const fetchAllData = (): Promise<AllData> => {
  if (!_allDataCache) {
    _allDataCache = (async () => {
      const fxRate = await fetchLatestRate().catch(() => DEFAULT_FX_RATE);
      return {
        investments: mapInvestments(getJsonRows<InvestmentRow>('investmentDetails.json')),
        earnings: mapEarnings([
          ...getJsonRows<EarningRow>('earningsPEN.json'),
          ...getJsonRows<EarningRow>('earningsUSD.json')
        ]),
        movements: mapMovements([
          ...getJsonRows<MovementRow>('movementsPEN.json'),
          ...getJsonRows<MovementRow>('movementsUSD.json')
        ]),
        fxRate
      };
    })();
  }
  return _allDataCache;
};

// ── Pure computation functions ──────────────────────────────

const buildEarningsMap = (earnings: Earning[], fxRate: number) => {
  const map = new Map<string, number[]>();
  for (const e of earnings) {
    const fx = e.moneda === 'USD' ? (e.fxRate ?? fxRate) : 1;
    const amountPen = toPen(e.monto, fx);
    const list = map.get(e.codigo);
    if (list) {
      list.push(amountPen);
    } else {
      map.set(e.codigo, [amountPen]);
    }
  }
  return map;
};

/** Calcula el neto invertido en PEN y USD a partir de movimientos */
const computeNetInvested = (movements: Movement[]) => {
  let investedPen = 0;
  let investedUsd = 0;
  let freePen = 0;
  let freeUsd = 0;

  for (const movement of movements) {
    const currency = movement.Moneda;
    const amount = movement.Monto * (movement.fxRate ?? 1);
    const type = normalize(movement.Movimiento);

    if (currency === 'PEN') {
      if (type === MOVEMENT_INVESTMENT) investedPen += amount;
      if (type === MOVEMENT_CAPITAL_PAYMENT) investedPen -= amount;
      if (movementTypeSets.PEN.adds.has(type)) freePen += amount;
      if (movementTypeSets.PEN.subs.has(type)) freePen -= amount;
      continue;
    }

    if (type === MOVEMENT_INVESTMENT) investedUsd += amount;
    if (type === MOVEMENT_CAPITAL_PAYMENT) investedUsd -= amount;
    if (movementTypeSets.USD.adds.has(type)) freeUsd += amount;
    if (movementTypeSets.USD.subs.has(type)) freeUsd -= amount;
  }

  return {
    netPen: investedPen + freePen + EXTERNAL_CAPITAL.pen,
    netUsd: investedUsd + freeUsd + EXTERNAL_CAPITAL.usd,
    investedPen,
    investedUsd,
    freePen,
    freeUsd
  };
};

/** Calcula ganancias reales y esperadas */
const computeGains = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  fxRate: number
) => {
  let real = 0;
  let expected = 0;
  const earnMap = buildEarningsMap(earnings, fxRate);

  for (const inv of investments) {
    const fxInv = inv.moneda === 'USD' ? (inv.fxRate ?? fxRate) : 1;
    const principalPen = toPen(inv.inversion, fxInv);
    const start = parseISO(inv.fechaIngreso);
    const planned = parseISO(inv.fechaPago);
    const status = normalize(inv.estado);

    if (status === STATUS_PAID) {
      for (const amountPen of earnMap.get(inv.codigo) || []) {
        real += amountPen;
      }
    } else if (status !== STATUS_REJECTED) {
      const months = monthsBetween(start, planned);
      if (months > 0) {
        expected += principalPen * (Math.pow(1 + inv.retornoMensualPct / 100, months) - 1);
      }
    }
  }

  return { real, expected, total: real + expected };
};

/** Calcula ganancias del último mes */
const computeMonthlyGains = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  fxRate: number
) => {
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(now.getMonth() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let realMonthlyPen = 0;
  let realMonthlyUsd = 0;
  let expectedMonthlyPen = 0;
  let expectedMonthlyUsd = 0;

  for (const e of earnings) {
    const date = parseISO(e.fecha);
    if (date >= oneMonthAgo && date <= now) {
      if (e.moneda === 'USD') {
        realMonthlyUsd += e.monto;
        realMonthlyPen += e.monto * (e.fxRate ?? fxRate);
      } else {
        realMonthlyPen += e.monto;
      }
    }
  }

  for (const inv of investments) {
    const est = normalize(inv.estado);
    const payment = parseISO(inv.fechaPago);
    if (est !== STATUS_REJECTED && est !== STATUS_PAID && payment >= thisMonthStart && payment < nextMonthStart) {
      if (inv.moneda === 'USD') {
        expectedMonthlyUsd += inv.inversion * (inv.retornoMensualPct / 100);
        expectedMonthlyPen += inv.inversion * (inv.fxRate ?? fxRate) * (inv.retornoMensualPct / 100);
      } else {
        expectedMonthlyPen += inv.inversion * (inv.retornoMensualPct / 100);
      }
    }
  }

  return { realMonthlyPen, expectedMonthlyPen, realMonthlyUsd, expectedMonthlyUsd };
};

/** Calcula contratos con ganancia en PEN */
const computeFactoringContracts = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  fxRate: number
): FactoringContract[] => {
  const earnMap = buildEarningsMap(earnings, fxRate);

  return investments.map(inv => {
    const fxInv = inv.moneda === 'USD' ? (inv.fxRate ?? fxRate) : 1;
    const principalPen = toPen(inv.inversion, fxInv);
    const start = parseISO(inv.fechaIngreso);
    const end = parseISO(inv.fechaPago);

    let gainPen = 0;
    const real = earnMap.get(inv.codigo);
    if (real) {
      for (const amountPen of real) gainPen += amountPen;
    } else {
      const months = monthsBetween(start, end);
      gainPen = months > 0
        ? principalPen * (Math.pow(1 + inv.retornoMensualPct / 100, months) - 1)
        : 0;
    }

    return { ...inv, gainPen };
  });
};

// ── Exported types ──────────────────────────────────────────

export type PortfolioReport = {
  netPen: number;
  netUsd: number;
  annualRatePct: number;
  gainRealPen: number;
  gainExpectedPen: number;
  gainTotalPen: number;
  gainRealLastMonth: number;
  gainExpectedLastMonth: number;
  gainRealLastMonthUsd: number;
  gainExpectedLastMonthUsd: number;
};

export type FactoringContract = InvestmentDetail & { gainPen: number };

// ── Public API ──────────────────────────────────────────────

/** Genera el reporte completo de portafolio (un solo fetch) */
export const getPortfolioReport = async (): Promise<PortfolioReport & { fxRate: number }> => {
  const { investments, earnings, movements, fxRate } = await fetchAllData();
  const { netPen, netUsd } = computeNetInvested(movements);
  const annualRatePct = calculateAnnualizedPortfolioRate(investments, earnings, fxRate);
  const { real, expected, total } = computeGains(investments, earnings, fxRate);
  const { realMonthlyPen, expectedMonthlyPen, realMonthlyUsd, expectedMonthlyUsd } =
    computeMonthlyGains(investments, earnings, fxRate);

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
    gainExpectedLastMonthUsd: expectedMonthlyUsd,
    fxRate
  };
};

/** Calcula tiempo para alcanzar meta con aportes periódicos */
export const getTimeToGoalWithInjection = (
  report: PortfolioReport,
  fxRate: number,
  goalPen: number,
  injection: number = PERIODIC_INJECTION
): { months: number; years: number } => {
  const rMonth = Math.pow(1 + report.annualRatePct / 100, 1 / 12) - 1;
  const halfFactor = Math.pow(1 + rMonth, 0.5);

  let balance = report.netPen + report.netUsd * fxRate;
  let k = 0;

  while (balance < goalPen && k < INJECTION_ITER_LIMIT) {
    k++;
    balance *= halfFactor;
    if (k % 2 === 1) balance += injection;
  }

  const months = k * 0.5;
  return { months, years: months / 12 };
};

/** Obtiene reporte + porcentaje de avance hacia la meta */
export const getReportMetrics = async (
  goalPen: number
): Promise<{ report: PortfolioReport; progressPct: number; fxRate: number }> => {
  const { fxRate, ...report } = await getPortfolioReport();
  const totalInvestedPen = report.netPen + report.netUsd * fxRate;
  const progressPct = (totalInvestedPen / goalPen) * 100;
  return { report, progressPct, fxRate };
};

/** Obtiene contratos de factoring con métricas */
export const getFactoringMetrics = async () => {
  const { investments, earnings, fxRate } = await fetchAllData();
  const contracts = computeFactoringContracts(investments, earnings, fxRate);
  const valid = contracts.filter(c => normalize(c.estado) !== STATUS_REJECTED);
  const pending = valid.filter(c => normalize(c.estado) !== STATUS_PAID).length;
  const paid = valid.filter(c => normalize(c.estado) === STATUS_PAID).length;
  const totalGain = valid.reduce((s, c) => s + c.gainPen, 0);
  return { contracts, pending, paid, total: valid.length, totalGain };
};

/** Calcula la etiqueta de fecha proyectada para la meta con inyección */
export const getInjectionTrendLabel = (months: number) => {
  const projected = new Date();
  projected.setMonth(projected.getMonth() + Math.round(months));
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(projected);
};
