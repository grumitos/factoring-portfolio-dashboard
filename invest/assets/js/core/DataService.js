import { CONFIG } from '../config/appConfig.js';
import { dateUtils } from '../utils/dateUtils.js';
import { financeUtils } from '../utils/financeUtils.js';

export class DataService {
  constructor() {
    this.factoring = [];
    this.additionalFlows = []; // Kept for potential future use, currently not populated
    this.pendingContracts = [];
    this.paidContracts = [];
    this.currentTab = null;
    this.totalDepositosCalculado = 0; // Net deposits in PEN equivalent, used for projections
    this._jsonCache = {};
    this._penData = null; // movementsPEN.json
    this._usdData = null; // movementsUSD.json
    this._gananciaPENData = null; // earningsPEN.json
    this._gananciaUSDData = null; // earningsUSD.json
    this._rawFactoringData = null; // investmentDetails.json
    this._allGanancias = null; // Combined earningsPEN and earningsUSD
  }

  async loadAllData() {
    try {
      [
        this._rawFactoringData,
        this._gananciaUSDData,
        this._gananciaPENData,
        this._penData,
        this._usdData
      ] = await Promise.all([
        this.loadJsonFile('assets/data/investmentDetails.json'),
        this.loadJsonFile('assets/data/earningsUSD.json'),
        this.loadJsonFile('assets/data/earningsPEN.json'),
        this.loadJsonFile('assets/data/movementsPEN.json'),
        this.loadJsonFile('assets/data/movementsUSD.json')
      ]);

      this.totalDepositosCalculado = this.calculateTotalNetDepositsPENEquivalent(this._penData, this._usdData);

      const gananciasUSD = this.processGananciasData(this._gananciaUSDData);
      const gananciasPEN = this.processGananciasData(this._gananciaPENData);
      this._allGanancias = [...gananciasUSD, ...gananciasPEN];

      const initialData = {
        factoringRaw: this.processFactoringData(this._rawFactoringData),
        ganancias: this._allGanancias,
      };

      this.processContracts(initialData);
      
      const factoringDataSummary = this.buildFactoringDataSummary(); 
      const uiTotals = this.calculateUITotals(this._penData, this._usdData, this._allGanancias);

      return {
        factoring: this.factoring, // Full list of processed factoring contracts
        factoringData: factoringDataSummary, // Summary of factoring operations
        uiTotals: uiTotals, // Data for "Total en Soles/Dólares" cards
        pendingContracts: this.pendingContracts,
        paidContracts: this.paidContracts,
        totalDepositosNetPENeq: this.totalDepositosCalculado, // For meta calculation
        allGanancias: this._allGanancias
      };
    } catch (error) {
      console.error("Error loading all data:", error);
      throw error;
    }
  }

  async loadJsonFile(filepath) {
    if (this._jsonCache[filepath]) {
      return this._jsonCache[filepath];
    }
    try {
      const response = await fetch(filepath);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this._jsonCache[filepath] = data;
      return data;
    } catch (error) {
      console.error(`Error loading JSON file ${filepath}:`, error);
      return null;
    }
  }

  processFactoringData(data) {
    if (!data || data.length === 0) return [];
    return data.map(row => {
      const fechaIngreso = row["Fecha"] ? new Date(row["Fecha"]).toISOString().slice(0, 10) : "";
      const fechaPagoStr = row["Fecha de pago"];
      let fechaPago = "";
      if (fechaPagoStr) {
        if (fechaPagoStr.includes('T')) {
            fechaPago = new Date(fechaPagoStr).toISOString().slice(0,10);
        } else if (fechaPagoStr.includes('/')) {
            const parts = fechaPagoStr.split('/');
            if (parts.length === 3) {
                 fechaPago = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        } else {
            try {
                fechaPago = new Date(fechaPagoStr).toISOString().slice(0, 10);
            } catch (e) { /* ignore invalid date format here, will be caught later */ }
        }
      }
      return {
        "Cliente": row["Cliente"] || "", "Fecha": fechaIngreso, "Fecha de pago": fechaPago,
        "Inversion": Number(row["Inversion"] || 0), "Retorno mensual (%)": Number(row["Retorno mensual (%)"] || 0),
        "Moneda": row["Moneda"] || "PEN", "Codigo de subasta": row["Codigo de subasta"] || "",
        "EstadoOriginal": row["Estado"] || "por cobrar", "RUC": row["RUC"], "Riesgo": row["Riesgo"],
        "Fecha de cierre de subasta": row["Fecha de cierre de subasta"], "Hora": row["Hora"]
      };
    });
  }

  processGananciasData(data) {
    if (!data || data.length === 0) return [];
    return data.map(row => {
      const fecha = row["Fecha"] ? new Date(row["Fecha"]).toISOString().slice(0, 10) : "";
      return { "Código de subasta": row["Código de subasta"] || row["Codigo de subasta"] || "",
        "Monto": Number(row["Monto"] || 0), "Fecha": fecha };
    });
  }
  
  calculateTotalNetDepositsPENEquivalent(penMovements, usdMovements) {
    let netPEN = 0;
    if (Array.isArray(penMovements)) {
        penMovements.forEach(m => {
            const tipo = (m.Movimiento || "").toLowerCase();
            const monto = Number(m.Monto) || 0;
            if (tipo === 'deposito') netPEN += monto;
            else if (tipo === 'retiro') netPEN -= monto;
            else if (tipo === 'dolares a soles') netPEN += monto; // Recibido en PEN
            else if (tipo === 'soles a dolares') netPEN -= monto; // Enviado desde PEN
        });
    }
    let netUSDinPEN = 0;
     if (Array.isArray(usdMovements)) {
        usdMovements.forEach(m => {
            const tipo = (m.Movimiento || "").toLowerCase();
            const monto = Number(m.Monto) || 0;
            if (tipo === 'deposito') netUSDinPEN += financeUtils.convertirAPEN(monto, "USD");
            else if (tipo === 'retiro') netUSDinPEN -= financeUtils.convertirAPEN(monto, "USD");
            else if (tipo === 'soles a dolares') netUSDinPEN += financeUtils.convertirAPEN(monto, "USD"); // Recibido en USD
            else if (tipo === 'dolares a soles') netUSDinPEN -= financeUtils.convertirAPEN(monto, "USD"); // Enviado desde USD
        });
    }
    return netPEN + netUSDinPEN;
  }

  calculateUITotals(penMovements, usdMovements, allEarnings) {
    let netBalancePEN = 0;
    if (Array.isArray(penMovements)) {
        penMovements.forEach(m => {
            const tipo = (m.Movimiento || "").toLowerCase();
            const monto = Number(m.Monto) || 0;
            if (tipo === 'deposito') netBalancePEN += monto;
            else if (tipo === 'retiro') netBalancePEN -= monto;
            else if (tipo === 'dolares a soles') netBalancePEN += monto; // PEN received
            else if (tipo === 'soles a dolares') netBalancePEN -= monto; // PEN sent
        });
    }
    allEarnings.filter(e => (e.Moneda || "PEN").toUpperCase() === "PEN").forEach(e => netBalancePEN += (Number(e.Monto) || 0));

    let netBalanceUSD = 0;
    if (Array.isArray(usdMovements)) {
        usdMovements.forEach(m => {
            const tipo = (m.Movimiento || "").toLowerCase();
            const monto = Number(m.Monto) || 0;
            if (tipo === 'deposito') netBalanceUSD += monto;
            else if (tipo === 'retiro') netBalanceUSD -= monto;
            else if (tipo === 'soles a dolares') netBalanceUSD += monto; // USD received
            else if (tipo === 'dolares a soles') netBalanceUSD -= monto; // USD sent
        });
    }
    allEarnings.filter(e => (e.Moneda || "").toUpperCase() === "USD").forEach(e => netBalanceUSD += (Number(e.Monto) || 0));
    
    let gananciaUltimoMesPEN = 0;
    allEarnings.filter(e => (e.Moneda || "PEN").toUpperCase() === "PEN").forEach(row => {
        if (this.isWithinLastMonth(row.Fecha)) gananciaUltimoMesPEN += Number(row.Monto) || 0;
    });
    let gananciaUltimoMesUSD = 0;
    allEarnings.filter(e => (e.Moneda || "").toUpperCase() === "USD").forEach(row => {
        if (this.isWithinLastMonth(row.Fecha)) gananciaUltimoMesUSD += Number(row.Monto) || 0;
    });

    return {
        totalPEN: netBalancePEN,
        gananciaUltimoMesPEN: gananciaUltimoMesPEN,
        totalUSD: netBalanceUSD,
        gananciaUltimoMesUSD: gananciaUltimoMesUSD,
    };
  }

  processContracts(data) {
    const gananciaMapping = this.createGananciaMapping(data.ganancias);
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);

    this.factoring = (data.factoringRaw || []).map(contract => {
      if (contract["EstadoOriginal"] && contract["EstadoOriginal"].toLowerCase() === "rechazado") return null;
      return this.processSingleContract(contract, gananciaMapping, hoy);
    }).filter(contract => contract);
    this.updateDerivedLists();
  }

  createGananciaMapping(ganancias) {
    const mapping = {};
    (ganancias || []).forEach(row => {
      const codigo = (row["Código de subasta"] || '').toString().trim();
      if (codigo) mapping[codigo] = row;
    });
    return mapping;
  }

  processSingleContract(contract, gananciaMapping, hoy) {
    let fechaIngreso, fechaPagoEstimadaDate;
    try {
        fechaIngreso = dateUtils.parse(contract["Fecha"]);
        fechaPagoEstimadaDate = dateUtils.parse(contract["Fecha de pago"] || contract["Fecha"]);
    } catch (e) {
        console.warn(`Skipping contract due to date parsing error: ${contract["Codigo de subasta"]}. Error: ${e.message}`);
        return null;
    }

    const monto = Number(contract["Inversion"]) || 0;
    const retornoMensual = Number(contract["Retorno mensual (%)"]) || 0;
    const diffTime = Math.max(0, fechaPagoEstimadaDate.getTime() - fechaIngreso.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const meses = Math.max(0, diffDays / 30.4375);
    let montoPagoNeto = parseFloat((monto * (Math.pow(1 + retornoMensual / 100, meses) - 1)).toFixed(2));

    const result = {
      nombre: contract["Cliente"], monto, moneda: contract["Moneda"] || "PEN",
      fechaIngreso: fechaIngreso.toISOString().slice(0, 10),
      fechaPagoEstimado: fechaPagoEstimadaDate.toISOString().slice(0, 10),
      montoPagoNeto, codigoSubasta: contract["Codigo de subasta"],
      tc: contract["TC"] || null, originalRow: contract,
      isPaid: false, isPending: fechaPagoEstimadaDate >= hoy
    };

    const codigo = (result.codigoSubasta || '').toString().trim();
    if (codigo && gananciaMapping[codigo]) {
      const gananciaInfo = gananciaMapping[codigo];
      try {
        result.fechaPagoReal = dateUtils.parse(gananciaInfo["Fecha"]).toISOString().slice(0,10);
        result.montoPagoNeto = Number(gananciaInfo["Monto"]) || montoPagoNeto; // Prioritize actual gain
        result.isPaid = true;
        result.isPending = false;
      } catch (e) {
        console.warn(`Error parsing payment_real_date for paid contract ${codigo}`);
      }
    }
    return result;
  }

  updateDerivedLists() {
    this.paidContracts = this.factoring.filter(c => c.isPaid);
    this.pendingContracts = this.factoring.filter(c => !c.isPaid && c.isPending);
  }

  isWithinLastMonth(dateStr) {
    if (!dateStr) return false;
    try {
      const date = dateUtils.parse(dateStr);
      const today = new Date(); today.setUTCHours(0,0,0,0);
      const oneMonthAgo = new Date(today); oneMonthAgo.setUTCMonth(today.getUTCMonth() - 1);
      return date >= oneMonthAgo && date <= today;
    } catch (e) { return false; }
  }

  calcularRentabilidadConFlujosGlobal() {
    // Depósitos y Retiros (todos convertidos a PEN)
    const movementFlows = [];
    (this._penData || []).forEach(m => {
        try {
            const fecha = dateUtils.parse(m.Fecha.split("T")[0]);
            const monto = Number(m.Monto) || 0;
            const tipo = (m.Movimiento || "").toLowerCase();
            if (tipo === 'deposito' || tipo === 'dolares a soles') movementFlows.push({ date: fecha, amount: -monto });
            else if (tipo === 'retiro' || tipo === 'soles a dolares') movementFlows.push({ date: fecha, amount: monto });
        } catch (e) { console.warn("Skipping PEN movement due to date error:", m, e); }
    });
    (this._usdData || []).forEach(m => {
        try {
            const fecha = dateUtils.parse(m.Fecha.split("T")[0]);
            const monto = Number(m.Monto) || 0;
            const montoPEN = financeUtils.convertirAPEN(monto, "USD");
            const tipo = (m.Movimiento || "").toLowerCase();
            if (tipo === 'deposito' || tipo === 'soles a dolares') movementFlows.push({ date: fecha, amount: -montoPEN });
            else if (tipo === 'retiro' || tipo === 'dolares a soles') movementFlows.push({ date: fecha, amount: montoPEN });
        } catch (e) { console.warn("Skipping USD movement due to date error:", m, e); }
    });
    
    // Inversiones de Factoring (salidas) y Pagos de Factoring (entradas)
    const factoringInvestmentFlows = this.factoring.map(c => {
        try {
            return { date: dateUtils.parse(c.fechaIngreso), amount: -financeUtils.convertirAPEN(c.monto, c.moneda) };
        } catch(e) { return null; }
    }).filter(f => f);

    const factoringPaymentFlows = this.paidContracts.map(c => { // Solo considerar contratos pagados para entradas
        try {
            return { date: dateUtils.parse(c.fechaPagoReal), amount: financeUtils.convertirAPEN(c.monto + c.montoPagoNeto, c.moneda) };
        } catch(e) { return null; }
    }).filter(f => f);
    
    // Considerar el valor actual de los contratos pendientes como un flujo de entrada al día de hoy
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const pendingValueFlows = this.pendingContracts.map(c => {
        return { date: today, amount: financeUtils.convertirAPEN(c.monto + c.montoPagoNeto, c.moneda) };
    });

    const allFlows = [...movementFlows, ...factoringInvestmentFlows, ...factoringPaymentFlows, ...pendingValueFlows];
    allFlows.sort((a, b) => a.date.getTime() - b.date.getTime());

    if (allFlows.length < 2) return 0;
    try {
      const rate = financeUtils.calcularTasaAnualizada(allFlows);
      return isNaN(rate) || !isFinite(rate) ? 0 : rate;
    } catch (error) {
      console.error("Error calculating global XIRR:", error, allFlows);
      return 0;
    }
  }

  changeTab(tabType) {
    this.currentTab = tabType;
    switch (tabType) {
      case 'pending': return this.pendingContracts;
      case 'paid': return this.paidContracts;
      case 'potential-earnings': case 'all': default: return this.factoring;
    }
  }

  buildFactoringDataSummary() {
    if (!this.factoring || this.factoring.length === 0) {
      return { totalInvertido: 0, totalRecibido: 0, montoGanado: 0, tasa: 0, contratos: 0,
        contratosPagados: 0, contratosPendientes: 0, gananciaUltimoMes: 0, gananciaUltimoMesPEN: 0,
        gananciaUltimoMesUSD: 0, tasaReal: 0, tasaEsperada: 0, totalGananciaPotencialPENeq: 0,
        gananciaEstimadaPendientesPENeq: 0, gananciaRealPagadosPENeq: 0,
        totalInvertidoOriginalPEN: 0, totalGanadoRealPEN: 0, totalInvertidoOriginalUSD: 0, totalGanadoRealUSD: 0,
      };
    }

    const hoy = new Date(); hoy.setUTCHours(0,0,0,0);
    const fechaHaceUnMes = new Date(hoy); fechaHaceUnMes.setUTCMonth(hoy.getUTCMonth() - 1);

    let totalFactoringInvertidoPENeq = 0;
    let totalFactoringGanadoPENeq = 0; // Ganancia total (pagada + pendiente) de factoring
    let gananciaEstimadaPendientesPENeq = 0;
    let gananciaRealPagadosPENeq = 0;
    let gananciaUltimoMesPEN = 0;
    let gananciaUltimoMesUSD = 0;
    
    let sumTotalInvertidoOriginalPEN = 0;
    let sumTotalGanadoRealPEN = 0;
    let sumTotalInvertidoOriginalUSD = 0;
    let sumTotalGanadoRealUSD = 0;

    this.factoring.forEach(c => {
      const principalOriginal = Number(c.monto) || 0;
      const interestEstimadoORReal = Number(c.montoPagoNeto) || 0;
      const principalPENeq = financeUtils.convertirAPEN(principalOriginal, c.moneda);
      const interestPENeq = financeUtils.convertirAPEN(interestEstimadoORReal, c.moneda);

      totalFactoringInvertidoPENeq += principalPENeq;
      totalFactoringGanadoPENeq += interestPENeq;

      if (c.moneda.toUpperCase() === 'PEN') {
          sumTotalInvertidoOriginalPEN += principalOriginal;
          if (c.isPaid) sumTotalGanadoRealPEN += interestEstimadoORReal;
      } else if (c.moneda.toUpperCase() === 'USD') {
          sumTotalInvertidoOriginalUSD += principalOriginal;
          if (c.isPaid) sumTotalGanadoRealUSD += interestEstimadoORReal;
      }

      if (c.isPaid) {
        gananciaRealPagadosPENeq += interestPENeq;
        try {
            const fechaPago = dateUtils.parse(c.fechaPagoReal);
            if (fechaPago >= fechaHaceUnMes && fechaPago <= hoy) {
                if (c.moneda.toUpperCase() === 'PEN') gananciaUltimoMesPEN += interestEstimadoORReal;
                else if (c.moneda.toUpperCase() === 'USD') gananciaUltimoMesUSD += interestEstimadoORReal;
            }
        } catch(e){}
      } else if (c.isPending) {
        gananciaEstimadaPendientesPENeq += interestPENeq;
      }
    });
    
    const tasaGlobalXIRR = this.calcularRentabilidadConFlujosGlobal();
    const paidFactoringFlows = financeUtils.buildCashFlowData(this.paidContracts);
    const tasaRealFactoringXIRR = financeUtils.calcularTasaAnualizada(paidFactoringFlows);

    return {
      totalInvertido: totalFactoringInvertidoPENeq, // Capital invertido solo en factoring (PENeq)
      totalRecibido: totalFactoringInvertidoPENeq + gananciaRealPagadosPENeq, // Capital + Ganancias Pagadas de Factoring (PENeq)
      montoGanado: totalFactoringGanadoPENeq, // Ganancia Total (Pagada + Pendiente) de Factoring (PENeq)
      tasa: tasaGlobalXIRR, // Tasa XIRR Global de la aplicación
      contratos: this.factoring.length,
      contratosPagados: this.paidContracts.length,
      contratosPendientes: this.pendingContracts.length,
      gananciaUltimoMes: financeUtils.convertirAPEN(gananciaUltimoMesUSD, "USD") + gananciaUltimoMesPEN,
      gananciaUltimoMesPEN,
      gananciaUltimoMesUSD,
      tasaReal: tasaRealFactoringXIRR, // XIRR de contratos de factoring pagados
      tasaEsperada: tasaGlobalXIRR, // Tasa XIRR Global de la aplicación
      totalGananciaPotencialPENeq: totalFactoringGanadoPENeq, // Suma de todos los montoPagoNeto de factoring en PENeq
      gananciaEstimadaPendientesPENeq,
      gananciaRealPagadosPENeq,
      totalInvertidoOriginalPEN: sumTotalInvertidoOriginalPEN,
      totalGanadoRealPEN: sumTotalGanadoRealPEN,
      totalInvertidoOriginalUSD: sumTotalInvertidoOriginalUSD,
      totalGanadoRealUSD: sumTotalGanadoRealUSD,
    };
  }
}