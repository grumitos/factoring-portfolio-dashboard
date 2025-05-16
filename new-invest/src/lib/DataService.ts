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
    const ganancias = [...this.processEarn(this.earningUSD, 'USD'), ...this.processEarn(this.earningPEN, 'PEN')];
    const factoring = this.processFactoring(this.rawFactoring, ganancias);
    
    // Calculate UI Totals (similar to old DataService.calculateUITotals)
    const uiTotals = this.calculateUITotals(this.penData, this.usdData, ganancias);
    
    // Calculate Factoring Data Summary (similar to old DataService.buildFactoringDataSummary)
    const factoringData = this.buildFactoringDataSummary(factoring, ganancias);

    // Calculate Meta (similar to old financeUtils.calcularTiempoHastaMeta)
    // Assuming totalDeposits is the current capital for projection
    const meta = this.calculateMetaProjection(totalDeposits, factoringData.tasa); 

    return { factoring, ganancias, uiTotals, factoringData, meta };
  }

  private processEarn(data: Ganancia[], moneda: 'PEN' | 'USD') {
    return data.map(r => ({ 
      code: r['Código de subasta'], 
      amount: r.Monto, 
      date: parseDate(r.Fecha),
      moneda // Add currency to processed earnings
    }));
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
    let netPEN = 0;
    this.penData.forEach(m => {
        const tipo = (m.Movimiento || "").toLowerCase();
        const monto = Number(m.Monto) || 0;
        if (tipo === 'deposito') netPEN += monto;
        else if (tipo === 'retiro') netPEN -= monto;
        else if (tipo === 'dolares a soles') netPEN += monto;
        else if (tipo === 'soles a dolares') netPEN -= monto;
    });
    let netUSDinPEN = 0;
    this.usdData.forEach(m => {
        const tipo = (m.Movimiento || "").toLowerCase();
        const monto = Number(m.Monto) || 0;
        if (tipo === 'deposito') netUSDinPEN += convertirAPEN(monto, "USD");
        else if (tipo === 'retiro') netUSDinPEN -= convertirAPEN(monto, "USD");
        else if (tipo === 'soles a dolares') netUSDinPEN += convertirAPEN(monto, "USD");
        else if (tipo === 'dolares a soles') netUSDinPEN -= convertirAPEN(monto, "USD");
    });
    return netPEN + netUSDinPEN;
  }

  private calculateUITotals(penMovements: Movement[], usdMovements: Movement[], allEarnings: any[]) {
    let netBalancePEN = 0;
    penMovements.forEach(m => {
        const tipo = (m.Movimiento || "").toLowerCase();
        const monto = Number(m.Monto) || 0;
        if (tipo === 'deposito') netBalancePEN += monto;
        else if (tipo === 'retiro') netBalancePEN -= monto;
        else if (tipo === 'dolares a soles') netBalancePEN += monto;
        else if (tipo === 'soles a dolares') netBalancePEN -= monto;
    });
    allEarnings.filter(e => e.moneda === "PEN").forEach(e => netBalancePEN += (Number(e.amount) || 0));

    let netBalanceUSD = 0;
    usdMovements.forEach(m => {
        const tipo = (m.Movimiento || "").toLowerCase();
        const monto = Number(m.Monto) || 0;
        if (tipo === 'deposito') netBalanceUSD += monto;
        else if (tipo === 'retiro') netBalanceUSD -= monto;
        else if (tipo === 'soles a dolares') netBalanceUSD += monto;
        else if (tipo === 'dolares a soles') netBalanceUSD -= monto;
    });
    allEarnings.filter(e => e.moneda === "USD").forEach(e => netBalanceUSD += (Number(e.amount) || 0));
    
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const oneMonthAgo = new Date(today); oneMonthAgo.setUTCMonth(today.getUTCMonth() - 1);

    let gananciaUltimoMesPEN = 0;
    allEarnings.filter(e => e.moneda === "PEN").forEach(row => {
        if (row.date >= oneMonthAgo && row.date <= today) gananciaUltimoMesPEN += Number(row.amount) || 0;
    });
    let gananciaUltimoMesUSD = 0;
    allEarnings.filter(e => e.moneda === "USD").forEach(row => {
        if (row.date >= oneMonthAgo && row.date <= today) gananciaUltimoMesUSD += Number(row.amount) || 0;
    });

    return {
        totalPEN: netBalancePEN,
        gananciaUltimoMesPEN: gananciaUltimoMesPEN,
        totalUSD: netBalanceUSD,
        gananciaUltimoMesUSD: gananciaUltimoMesUSD,
    };
  }

  private buildFactoringDataSummary(factoring: any[], allEarnings: any[]) {
    // This is a simplified version. The original had more complex XIRR calculations for paid/pending.
    // For now, we'll use a global XIRR for factoring.
    const factoringFlows = buildCashFlowData(factoring);
    const tasaFactoring = calcularTasaAnualizada(factoringFlows);
    
    // Placeholder for other summary data if needed later
    return {
        tasa: tasaFactoring, // This is the XIRR for factoring operations
        // ... other factoring summary fields can be added here
    };
  }

  private calculateMetaProjection(capitalInicial: number, tasaAnual: number) {
    const tasaMensualEfectiva = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;
    const metaMillones = CONFIG.METAS.MILLONES;
    const aporteMensual = CONFIG.METAS.APORTE_MENSUAL;

    if (capitalInicial >= metaMillones) {
        return { años: 0, meses: 0, fechaEstimada: new Date() };
    }
    if (tasaMensualEfectiva <= 0 && aporteMensual <= 0 && capitalInicial < metaMillones) {
        return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    let saldo = capitalInicial;
    let meses = 0;
    const MAX_MESES = 1200; // ~100 years

    while (saldo < metaMillones && meses < MAX_MESES) {
      saldo = saldo * (1 + tasaMensualEfectiva) + aporteMensual;
      meses++;
      if (isNaN(saldo) || !isFinite(saldo)) {
          return { años: Infinity, meses: Infinity, fechaEstimada: null };
      }
    }

    if (meses >= MAX_MESES || saldo < metaMillones) {
      return { años: Infinity, meses: Infinity, fechaEstimada: null };
    }

    const años = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    const hoy = new Date();
    const fechaEstimada = new Date(hoy.getFullYear() + años, hoy.getMonth() + mesesRestantes, hoy.getDate());
    
    return {
      años,
      meses: mesesRestantes,
      fechaEstimada
    };
  }
}
