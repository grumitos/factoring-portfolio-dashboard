import investmentsJson from '../data/investmentDetails.json';
import earningsPenJson from '../data/earningsPEN.json';
import earningsUsdJson from '../data/earningsUSD.json';
import movementsPenJson from '../data/movementsPEN.json';
import movementsUsdJson from '../data/movementsUSD.json';
import {
  InvestmentDetail,
  Earning,
  calculateAnnualizedPortfolioRate,
} from './portfolioUtils';

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

/**
 * Devuelve la tasa anualizada ponderada del portafolio.
 */
export const getAnnualizedRate = (defaultFxRate: number): number => {
  const investments = investmentsJson as InvestmentDetail[];
  const earnings = buildEarningsArray();
  return calculateAnnualizedPortfolioRate(
    investments,
    earnings,
    defaultFxRate
  );
};