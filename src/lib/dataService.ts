import { parseISO, subMonths } from 'date-fns';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import { calculateAnnualizedPortfolioRate, expectedGain, resolveFx, toPen } from './portfolioUtils';
import { monthsToGoal } from './projection';
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
  'Hora'?: string;
  'Fecha de pago': string;
  'Inversion': number;
  'Moneda': 'PEN' | 'USD';
  'Retorno mensual (%)': number;
  'Estado': string;
  'Riesgo'?: string;
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
  'Fecha': string;
  'Movimiento': string;
  'Monto': number;
  'Moneda': 'PEN' | 'USD';
  fxRate?: number;
}

// ── Domain types ────────────────────────────────────────────

interface Movement {
  Fecha: string;
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
  /** true si no se pudo obtener la tasa en vivo y se usó DEFAULT_FX_RATE */
  fxIsFallback: boolean;
  /** Fecha (ISO) del registro más reciente en los datos locales, o null si no hay datos */
  dataAsOf: string | null;
}

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
    fechaIngreso: e['Hora'] ? `${e['Fecha']}T${e['Hora']}` : e['Fecha'],
    fechaPago: e['Fecha de pago'],
    inversion: e['Inversion'],
    moneda: e['Moneda'],
    retornoMensualPct: e['Retorno mensual (%)'],
    estado: e['Estado'],
    riesgo: e['Riesgo'],
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
    Fecha: e['Fecha'],
    Movimiento: e['Movimiento'],
    Monto: e['Monto'],
    Moneda: e['Moneda'],
    fxRate: e.fxRate
  }));

/** Fecha más reciente entre inversiones, ganancias y movimientos (ISO con zona horaria) */
const computeDataAsOf = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  movements: Movement[]
): string | null => {
  let latest = -Infinity;
  const consider = (value: string | undefined) => {
    if (!value) return;
    const ts = parseISO(value).getTime();
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  };

  investments.forEach(inv => consider(inv.fechaIngreso));
  earnings.forEach(e => consider(e.fecha));
  movements.forEach(m => consider(m.Fecha));

  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
};

// ── Data loading (single entry point) ───────────────────────

/** Loads all data from local JSON + live FX rate.
 *  Cached at module level so multiple callers in the same build share one load. */
let _allDataCache: Promise<AllData> | null = null;

const fetchAllData = (): Promise<AllData> => {
  if (!_allDataCache) {
    _allDataCache = (async () => {
      const fx = await fetchLatestRate().then(
        rate => ({ rate, isFallback: false }),
        (err: unknown) => {
          console.warn(`[fx] Usando tasa por defecto (${DEFAULT_FX_RATE}):`, err instanceof Error ? err.message : err);
          return { rate: DEFAULT_FX_RATE, isFallback: true };
        }
      );
      const investments = mapInvestments(getJsonRows<InvestmentRow>('investmentDetails.json'));
      const earnings = mapEarnings([
        ...getJsonRows<EarningRow>('earningsPEN.json'),
        ...getJsonRows<EarningRow>('earningsUSD.json')
      ]);
      const movements = mapMovements([
        ...getJsonRows<MovementRow>('movementsPEN.json'),
        ...getJsonRows<MovementRow>('movementsUSD.json')
      ]);

      return {
        investments,
        earnings,
        movements,
        fxRate: fx.rate,
        fxIsFallback: fx.isFallback,
        dataAsOf: computeDataAsOf(investments, earnings, movements)
      };
    })();
  }
  return _allDataCache;
};

// ── Pure computation functions ──────────────────────────────

const buildEarningsMap = (earnings: Earning[], fxRate: number) => {
  const map = new Map<string, number[]>();
  for (const e of earnings) {
    const amountPen = toPen(e.monto, resolveFx(e.moneda, e.fxRate, fxRate));
    const list = map.get(e.codigo);
    if (list) {
      list.push(amountPen);
    } else {
      map.set(e.codigo, [amountPen]);
    }
  }
  return map;
};

/** Calcula el neto en PEN y USD a partir de movimientos (cada libro en su propia moneda) */
const computeNetBalances = (movements: Movement[]) => {
  let investedPen = 0;
  let investedUsd = 0;
  let freePen = 0;
  let freeUsd = 0;

  for (const movement of movements) {
    const amount = movement.Monto;
    const type = normalize(movement.Movimiento);

    if (movement.Moneda === 'PEN') {
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
    netUsd: investedUsd + freeUsd + EXTERNAL_CAPITAL.usd
  };
};

/** Calcula las ganancias reales cobradas durante el último mes */
const computeRealMonthlyGains = (earnings: Earning[], fxRate: number) => {
  const now = new Date();
  const oneMonthAgo = subMonths(now, 1);

  let realMonthlyPen = 0;
  let realMonthlyUsd = 0;

  for (const e of earnings) {
    const date = parseISO(e.fecha);
    if (date < oneMonthAgo || date > now) continue;
    if (e.moneda === 'USD') {
      realMonthlyUsd += e.monto;
      realMonthlyPen += toPen(e.monto, e.fxRate ?? fxRate);
    } else {
      realMonthlyPen += e.monto;
    }
  }

  return { realMonthlyPen, realMonthlyUsd };
};

/** Calcula contratos con ganancia en PEN */
const computeFactoringContracts = (
  investments: InvestmentDetail[],
  earnings: Earning[],
  fxRate: number
): FactoringContract[] => {
  const earnMap = buildEarningsMap(earnings, fxRate);

  return investments.map(inv => {
    const principalPen = toPen(inv.inversion, resolveFx(inv.moneda, inv.fxRate, fxRate));
    const real = earnMap.get(inv.codigo);
    const gainPen = real
      ? real.reduce((sum, amountPen) => sum + amountPen, 0)
      : expectedGain(principalPen, inv.retornoMensualPct, parseISO(inv.fechaIngreso), parseISO(inv.fechaPago));

    return { ...inv, gainPen };
  });
};

// ── Exported types ──────────────────────────────────────────

export type PortfolioReport = {
  netPen: number;
  netUsd: number;
  annualRatePct: number;
  gainRealLastMonth: number;
  gainRealLastMonthUsd: number;
};

export type FactoringContract = InvestmentDetail & { gainPen: number };

type DataContext = {
  fxRate: number;
  fxIsFallback: boolean;
  dataAsOf: string | null;
};

// ── Public API ──────────────────────────────────────────────

/** Genera el reporte completo de portafolio (un solo fetch) */
export const getPortfolioReport = async (): Promise<PortfolioReport & DataContext> => {
  const { investments, earnings, movements, fxRate, fxIsFallback, dataAsOf } = await fetchAllData();
  const { netPen, netUsd } = computeNetBalances(movements);
  const annualRatePct = calculateAnnualizedPortfolioRate(investments, earnings, fxRate);
  const { realMonthlyPen, realMonthlyUsd } = computeRealMonthlyGains(earnings, fxRate);

  return {
    netPen,
    netUsd,
    annualRatePct,
    gainRealLastMonth: realMonthlyPen,
    gainRealLastMonthUsd: realMonthlyUsd,
    fxRate,
    fxIsFallback,
    dataAsOf
  };
};

/** Calcula los meses hasta alcanzar la meta con aportes periódicos (null si no se alcanza) */
export const getTimeToGoalWithInjection = (
  report: PortfolioReport,
  fxRate: number,
  goalPen: number,
  injection: number = PERIODIC_INJECTION
): { months: number | null; years: number | null } => {
  const months = monthsToGoal(
    {
      startBalance: report.netPen + report.netUsd * fxRate,
      annualRatePct: report.annualRatePct,
      monthlyInjection: injection
    },
    goalPen,
    INJECTION_ITER_LIMIT
  );
  return { months, years: months === null ? null : months / 12 };
};

/** Obtiene reporte + porcentaje de avance hacia la meta */
export const getReportMetrics = async (
  goalPen: number
): Promise<{ report: PortfolioReport; progressPct: number } & DataContext> => {
  const { fxRate, fxIsFallback, dataAsOf, ...report } = await getPortfolioReport();
  const totalInvestedPen = report.netPen + report.netUsd * fxRate;
  const progressPct = (totalInvestedPen / goalPen) * 100;
  return { report, progressPct, fxRate, fxIsFallback, dataAsOf };
};

/** Obtiene contratos de factoring con su ganancia en PEN y la fecha de corte de los datos */
export const getFactoringMetrics = async (): Promise<{ contracts: FactoringContract[]; dataAsOf: string | null }> => {
  const { investments, earnings, fxRate, dataAsOf } = await fetchAllData();
  return { contracts: computeFactoringContracts(investments, earnings, fxRate), dataAsOf };
};
