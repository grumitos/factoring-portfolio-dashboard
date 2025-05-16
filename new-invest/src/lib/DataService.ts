import type { CashFlow } from './financeUtils';
import { convertirAPEN, calcularTasaAnualizada, buildCashFlowData } from './financeUtils';
import { parseDate, formatDate } from './dateUtils';
import { CONFIG } from './config';
import investmentDetails from '../data/investmentDetails.json';
import earningsUSD from '../data/earningsUSD.json';
import earningsPEN from '../data/earningsPEN.json';
import movementsPEN from '../data/movementsPEN.json';
import movementsUSD from '../data/movementsUSD.json';

export interface FactoringRaw { [key: string]: any; }
export interface Movement { Fecha: string; Movimiento: string; Monto: number; }
export interface Ganancia { ['Código de subasta']: string; Monto: number; Fecha: string; }

export class DataService {
  private jsonCache = new Map<string, any>();
  private penData: Movement[] = [];
  private usdData: Movement[] = [];
  private earningPEN: Ganancia[] = [];
  private earningUSD: Ganancia[] = [];
  private rawFactoring: FactoringRaw[] = [];

  async loadAll() {
    // JSON data imported statically
    this.rawFactoring = investmentDetails;
    this.earningUSD = earningsUSD;
    this.earningPEN = earningsPEN;
    this.penData = movementsPEN;
    this.usdData = movementsUSD;
    return this.processAll();
  }

  private processAll() {
    const totalDeposits = this.calcTotalDeposits();
    const ganancias = [...this.processEarn(this.earningUSD), ...this.processEarn(this.earningPEN)];
    const factoring = this.processFactoring(this.rawFactoring, ganancias);
    const summary = this.buildSummary(factoring, ganancias, totalDeposits);
    return { factoring, ganancias, summary };
  }

  private processEarn(data: Ganancia[]) {
    return data.map(r => ({ code: r['Código de subasta'], amount: r.Monto, date: parseDate(r.Fecha) }));
  }

  private processFactoring(raw: FactoringRaw[], earnings: any[]) {
    return raw.map(r => {
      const ingreso = r.Fecha ? parseDate(r.Fecha) : new Date();
      const pagoEst = r['Fecha de pago'] ? parseDate(r['Fecha de pago']) : ingreso;
      const monto = Number(r.Inversion) || 0;
      const retorno = Number(r['Retorno mensual (%)']) || 0;
      const code = r['Codigo de subasta'];
      let isPaid = false;
      let realDate = pagoEst;
      let pagoNeto = monto * (Math.pow(1 + retorno/100, 1) - 1);
      const match = earnings.find(e => e.code === code);
      if (match) {
        isPaid = true;
        realDate = match.date;
        pagoNeto = match.amount;
      }
      return { ...r, fechaIngreso: ingreso, fechaPagoEstimado: pagoEst, fechaPagoReal: realDate, pagoNeto, isPaid };
    });
  }

  private calcTotalDeposits() {
    let pen = 0, usd = 0;
    this.penData.forEach(m => pen += m.Monto);
    this.usdData.forEach(m => usd += convertirAPEN(m.Monto, 'USD'));
    return pen + usd;
  }

  private buildSummary(factoring: any[], earnings: any[], totalDeposits: number) {
    const flows: CashFlow[] = [];
    factoring.forEach(c => {
      flows.push({ date: c.fechaIngreso, amount: -convertirAPEN(c.Inversion, c.Moneda) });
      flows.push({ date: c.fechaPagoReal, amount: convertirAPEN(c.Inversion + c.pagoNeto, c.Moneda) });
    });
    const tasa = calcularTasaAnualizada(flows);
    return { totalDeposits, tasa };
  }
}
