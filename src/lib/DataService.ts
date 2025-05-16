import investmentsJson from '../data/investmentDetails.json';
import earningsPenJson from '../data/earningsPEN.json';
import earningsUsdJson from '../data/earningsUSD.json';
import movementsPenJson from '../data/movementsPEN.json';
import movementsUsdJson from '../data/movementsUSD.json';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import { calculateAnnualizedPortfolioRate } from './portfolioUtils';

/** Tipo de movimiento financiero */
interface Movement {
  Movimiento: 'inversion' | 'pago capital' | string;
  Monto: number;
}

/**
 * Suma inversiones menos pagos de capital para obtener el neto invertido.
 */
export const getNetInvested = (movements: Movement[]): number => {
  const invested = movements
    .filter(m => m.Movimiento === 'inversion')
    .reduce((sum, m) => sum + m.Monto, 0);
  const returned = movements
    .filter(m => m.Movimiento === 'pago capital')
    .reduce((sum, m) => sum + m.Monto, 0);
  return invested - returned;
};

/**
 * Obtiene el neto invertido en PEN y USD.
 */
export const getNetInvestedByCurrency = () => {
   const netPEN = getNetInvested(movementsPenJson as Movement[]);
   const netUSD = getNetInvested(movementsUsdJson as Movement[]);
   return { netPEN, netUSD };
 };

/**
 * Construye el array de ganancias combinado para cálculo de tasa.
 */
const buildEarningsArray = (): Earning[] => {
  const arr: Earning[] = [];
  (earningsPenJson as any[]).forEach(e =>
    arr.push({
      codigo: e['Código de subasta'],
      monto: e['Monto'],
      fecha: e['Fecha'],
      moneda: 'PEN',
    })
  );
  (earningsUsdJson as any[]).forEach(e =>
    arr.push({
      codigo: e['Código de subasta'],
      monto: e['Monto'],
      fecha: e['Fecha'],
      moneda: 'USD',
    })
  );
  return arr;
};

/** Construye el array de inversiones tipado */
const buildInvestmentsArray = (): InvestmentDetail[] => {
  return (investmentsJson as any[]).map(e => ({
    codigo: e['Codigo de subasta'],
    fechaIngreso: `${e['Fecha']}T${e['Hora']}`,
    fechaPago: e['Fecha de pago'],
    inversion: e['Inversion'],
    moneda: e['Moneda'],
    retornoMensualPct: e['Retorno mensual (%)'],
    estado: e['Estado'],
  }));
};

/**
 * Devuelve la tasa anualizada ponderada del portafolio.
 */
export const getAnnualizedRate = (defaultFxRate: number): number => {
  const investments = buildInvestmentsArray();
  const earnings = buildEarningsArray();
  return calculateAnnualizedPortfolioRate(
    investments,
    earnings,
    defaultFxRate
  );
};

/**
 * Obtiene el reporte completo del portafolio incluyendo neto y tasa.
 */
export const getPortfolioReport = (defaultFxRate = 3.8) => {
  const { netPEN, netUSD } = getNetInvestedByCurrency();
  const annualRatePct = getAnnualizedRate(defaultFxRate);
  return { netPen: netPEN, netUsd: netUSD, annualRatePct };
};