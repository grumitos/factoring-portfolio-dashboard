import { describe, it, expect } from 'vitest';
import { toPen, annualRateForContract, calculateAnnualizedPortfolioRate } from './portfolioUtils';
import { getTimeToGoalWithInjection, getGoalProjection, getInjectionTrendLabel } from './dataService';
import type { InvestmentDetail, Earning } from './portfolioUtils';
import type { PortfolioReport } from './dataService';

// Tests for helper calculations

describe('toPen', () => {
  it('converts USD amounts using fxRate', () => {
    expect(toPen(10, 3.5)).toBeCloseTo(35);
  });
});

describe('annualRateForContract', () => {
  it('computes annualized rate from principal and gain', () => {
    const principal = 1000;
    const gain = 61.21; // after 3 months at 2% monthly
    const start = new Date('2024-01-01');
    const end = new Date('2024-04-01');
    const r = annualRateForContract(principal, gain, start, end);
    // expected around 26.9%
    expect(r).toBeCloseTo(0.269, 3);
  });
});

describe('calculateAnnualizedPortfolioRate', () => {
  it('computes weighted annualized rate for a portfolio', () => {
    const investments: InvestmentDetail[] = [
      {
        codigo: 'A1',
        cliente: 'c',
        fechaIngreso: '2024-01-01T00:00:00',
        fechaPago: '2024-03-01',
        inversion: 1000,
        moneda: 'PEN',
        retornoMensualPct: 2,
        estado: 'pendiente'
      },
      {
        codigo: 'A2',
        cliente: 'c',
        fechaIngreso: '2024-05-01T00:00:00',
        fechaPago: '2024-08-01',
        inversion: 2000,
        moneda: 'PEN',
        retornoMensualPct: 1,
        estado: 'pendiente'
      }
    ];

    const earnings: Earning[] = [
      {
        codigo: 'A1',
        monto: 50,
        fecha: '2024-03-01',
        moneda: 'PEN'
      }
    ];

    const rate = calculateAnnualizedPortfolioRate(investments, earnings, 1);
    expect(rate).toBeCloseTo(19.98, 2);
  });
});

describe('getTimeToGoalWithInjection', () => {
  it('estimates months to goal with zero growth', () => {
    const report: PortfolioReport = {
      netPen: 1000,
      netUsd: 0,
      annualRatePct: 0,
      gainRealPen: 0,
      gainExpectedPen: 0,
      gainTotalPen: 0,
      gainRealLastMonth: 0,
      gainExpectedLastMonth: 0,
      gainRealLastMonthUsd: 0,
      gainExpectedLastMonthUsd: 0
    };
    const { months } = getTimeToGoalWithInjection(report, 10000, 6000, 3.7);
    expect(months).toBeCloseTo(1.5, 1);
  });
});

describe('getGoalProjection', () => {
  it('computes progress percentage and trend label', () => {
    const report: PortfolioReport = {
      netPen: 5000,
      netUsd: 0,
      annualRatePct: 12,
      gainRealPen: 0,
      gainExpectedPen: 0,
      gainTotalPen: 0,
      gainRealLastMonth: 0,
      gainExpectedLastMonth: 0,
      gainRealLastMonthUsd: 0,
      gainExpectedLastMonthUsd: 0
    };
    const goalPen = 10000;
    const expectedProgress = 50;
    const rAnnual = report.annualRatePct / 100;
    const years = Math.log(goalPen / report.netPen) / Math.log(1 + rAnnual);
    const projected = new Date();
    projected.setMonth(projected.getMonth() + Math.round(years * 12));
    const expectedLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(projected);

    const result = getGoalProjection(report, goalPen, 3.7);
    expect(result.progressPct).toBeCloseTo(expectedProgress);
    expect(result.trendLabel).toBe(expectedLabel);
  });
});

describe('getInjectionTrendLabel', () => {
  it('formats projected month-year correctly', () => {
    const label = getInjectionTrendLabel(0);
    const expected = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date());
    expect(label).toBe(expected);
  });
});
