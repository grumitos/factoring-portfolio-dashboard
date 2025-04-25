class DataService {
  constructor() {
    this.factoring = [];
    this.additionalFlows = [];
    this.pendingContracts = [];
    this.paidContracts = [];
    this.currentTab = null; 
    this.totalDepositosCalculado = 0; 
    this._jsonCache = {};  // nuevo caché para JSON
  }
  
  async loadAllData() {
    try {
      const [factoringData, gananciasUSDData, gananciasPENData, penData, usdData] = await Promise.all([
        this.loadJsonFile('assets/mis-inversiones.json'),
        this.loadJsonFile('assets/gananciaUSD.json'),
        this.loadJsonFile('assets/gananciaPEN.json'),
        this.loadJsonFile('assets/pen.json'),
        this.loadJsonFile('assets/usd.json')
      ]);
      
      // no se usa aquí para el dashboard summary, pero queda calculado por si se necesita
      this.totalDepositosCalculado = this.calculateTotalDeposits(penData, usdData);

      const saldoPEN = this.extractSaldo(penData) || 0;
      const saldoUSD = this.extractSaldo(usdData) || 0;
      
      const gananciasUSD = this.processGananciasData(gananciasUSDData);
      const gananciasPEN = this.processGananciasData(gananciasPENData);
      const allGanancias = [...gananciasUSD, ...gananciasPEN]; 
      
      const initialData = {
        factoringRaw: this.processFactoringData(factoringData), 
        ganancias: allGanancias, 
        saldoPEN,
        saldoUSD
      };
      
      this.processContracts(initialData); 
      
      const TASA_CAMBIO_USD_PEN = typeof CONFIG !== "undefined" ? CONFIG.TASAS.CAMBIO_USD_PEN : 3.7; // Asegúrate que TASA_CAMBIO_USD_PEN esté definida o usa un valor por defecto
      const capitalTotal = saldoPEN + saldoUSD * TASA_CAMBIO_USD_PEN;
      
      return {
        factoring: this.factoring, 
        factoringData: this.buildFactoringData(),
        capitalTotal,
        pendingContracts: this.pendingContracts,
        paidContracts: this.paidContracts,
        totalDepositos: this.totalDepositosCalculado 
      };
    } catch (error) {
      console.error("Error loading all data:", error); // Añadir log de error
      throw error;
    }
  }

  async loadJsonFile(filepath) {
    if (this._jsonCache[filepath]) {
      return this._jsonCache[filepath];
    }
    const promise = (async () => {
      try {
        const response = await fetch(filepath);
        if (!response.ok) throw new Error(`Error al cargar ${filepath}: ${response.statusText}`);
        return await response.json();
      } catch (error) {
        console.error(`Failed to load JSON file ${filepath}:`, error);
        return [];
      }
    })();
    this._jsonCache[filepath] = promise;
    return promise;
  }
  
  processFactoringData(data) {
    if (!data || data.length === 0) return [];
    
    return data.map(row => {
      const fechaIngreso = row["Fecha"] ? new Date(row["Fecha"]).toISOString().slice(0, 10) : "";
      const fechaPago = row["Fecha de pago"] ? new Date(row["Fecha de pago"]).toISOString().slice(0, 10) : "";

      return {
        "Cliente": row["Cliente"] || "",
        "Fecha": fechaIngreso,
        "Fecha de pago": fechaPago,
        "Inversion": Number(row["Inversion"] || 0),
        "Retorno mensual (%)": Number(row["Retorno mensual (%)"] || 0),
        "Moneda": row["Moneda"] || "PEN",
        "Codigo de subasta": row["Codigo de subasta"] || ""
      };
    });
  }
  
  processGananciasData(data) {
    if (!data || data.length === 0) return [];
    
    return data.map(row => {
       const fecha = row["Fecha"] ? new Date(row["Fecha"]).toISOString().slice(0, 10) : "";
      return {
        "Código de subasta": row["Código de subasta"] || row["Codigo de subasta"] || "",
        "Monto": Number(row["Monto"] || 0),
        "Fecha": fecha
      };
    });
  }
  
  extractSaldo(data) {
    if (!data || data.length === 0) return 0;
    
    const saldoRow = data.find(row => row["Saldo"] !== undefined);
    return saldoRow ? Number(saldoRow["Saldo"]) : 0;
  }
  
  static _netAmount(data, depositTypes = [], withdrawTypes = [], movimientoKey = "Movimiento", montoKey = "Monto") {
    let total = 0;
    if (Array.isArray(data)) {
      data.forEach(row => {
        if (row && row[movimientoKey] && row[montoKey] != null) {
          const tipo = String(row[movimientoKey]).toLowerCase();
          const monto = Number(row[montoKey]) || 0;
          if (depositTypes.includes(tipo)) total += monto;
          else if (withdrawTypes.includes(tipo)) total -= monto;
        }
      });
    }
    return total;
  }

  calculateTotalDeposits(penData, usdData) {
    const totalPEN = DataService._netAmount(penData, ["deposito"], ["retiro"]);
    const totalUSD = DataService._netAmount(usdData, ["deposito"], ["retiro"]);
    return totalPEN + (totalUSD * TASA_CAMBIO_USD_PEN);
  }

  async calculateTotalDepositsConAjuste(penData, usdData, gananciaPEN, gananciaUSD, conversiones) {
    let totalPEN = DataService._netAmount(penData, ["deposito"], ["retiro"]);
    let totalUSD = DataService._netAmount(usdData, ["deposito"], ["retiro"]);

    if (Array.isArray(conversiones)) {
      conversiones.forEach(conv => {
        totalUSD -= Number(conv["Monto Enviado"] || 0);
        totalPEN += Number(conv["Monto Recibido"] || 0);
      });
    }

    let totalGananciaPEN = 0, totalGananciaUSD = 0;
    if (Array.isArray(gananciaPEN)) {
      gananciaPEN.forEach(row => {
        totalGananciaPEN += Number(row["Monto"] || 0);
      });
    }
    if (Array.isArray(gananciaUSD)) {
      gananciaUSD.forEach(row => {
        totalGananciaUSD += Number(row["Monto"] || 0);
      });
    }

    return {
      saldoPEN: totalPEN + totalGananciaPEN,
      saldoUSD: totalUSD + totalGananciaUSD
    };
  }
  
  processContracts(data) { 
    const gananciaMapping = this.createGananciaMapping(data.ganancias);
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    this.factoring = (data.factoringRaw || []).map(contract => {
      return this.processContract(contract, gananciaMapping, hoy);
    }).filter(contract => contract); 
    
    this.updateDerivedLists();
  }
  
  createGananciaMapping(ganancias) {
    const mapping = {};
    (ganancias || []).forEach(row => {
      const codigo = (row["Código de subasta"] || row["Codigo de subasta"] || '').toString().trim();
      if (codigo) mapping[codigo] = row;
    });
    return mapping;
  }
  
  processContract(contract, gananciaMapping, hoy) {
    if (!contract) return null;
    
    const fechaIngresoRaw = contract["Fecha"];
    const fechaPagoRaw = contract["Fecha de pago"] || fechaIngresoRaw;
    const fechaIngreso = new Date(fechaIngresoRaw);
    const fechaPago = new Date(fechaPagoRaw);
    
    if (isNaN(fechaIngreso.getTime()) || isNaN(fechaPago.getTime())) {
      return null;
    }
    
    const monto = Number(contract["Inversion"]) || 0;
    const retornoMensual = Number(contract["Retorno mensual (%)"]) || 0;
    const diffTime = Math.abs(fechaPago - fechaIngreso);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const meses = diffDays / 30.4375;
    const montoPagoNeto = parseFloat(
      (
        monto *
        (Math.pow(1 + retornoMensual / 100, meses) - 1)   // interés compuesto mensual
      ).toFixed(2)
    );
    
    const result = {
      nombre: contract["Cliente"],
      monto,
      moneda: contract["Moneda"] || "PEN",
      fechaIngreso: fechaIngreso.toISOString().slice(0, 10),
      fechaPagoEstimado: fechaPago.toISOString().slice(0, 10),
      montoPagoNeto,
      codigoSubasta: contract["Codigo de subasta"],
      tc: contract["TC"] || null // Capturamos el tipo de cambio si existe
    };
    
    const codigo = (result.codigoSubasta || '').toString().trim();
    if (codigo && gananciaMapping[codigo]) {
      return this.processPaidContract(result, gananciaMapping[codigo]);
    } else {
      const fechaPagoEstimado = new Date(result.fechaPagoEstimado);
      return {
        ...result,
        isPaid: false,
        isPending: fechaPagoEstimado > hoy
      };
    }
  }
  
  processPaidContract(contract, gananciaRow) {
    const fechaPagoRealRaw = gananciaRow["Fecha"];
    const fechaPagoReal = new Date(fechaPagoRealRaw);
    
    if (fechaPagoReal && !isNaN(fechaPagoReal.getTime())) {
      return {
        ...contract,
        fechaPagoReal: fechaPagoReal.toISOString().slice(0, 10),
        montoPagoNeto: Number(gananciaRow["Monto"]) || contract.montoPagoNeto,
        isPaid: true,
        isPending: false
      };
    } else {
      const fechaPagoEstimado = new Date(contract.fechaPagoEstimado);
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      return {
        ...contract,
        isPaid: false,
        isPending: fechaPagoEstimado > hoy
      };
    }
  }
  
  updateDerivedLists() {
    this.paidContracts = this.factoring.filter(c => c.isPaid);
    this.pendingContracts = this.factoring.filter(c => !c.isPaid && c.isPending);
  }
  
  buildFactoringData() {
    if (!this.factoring || this.factoring.length === 0) {
      return {
        totalInvertido: 0,
        totalRecibido: 0,
        montoGanado: 0,
        tasa: 0,
        contratos: 0,
        contratosPagados: 0,
        contratosPendientes: 0,
        gananciaUltimoMes: 0
      };
    }

    const hoy = new Date();
    const fechaHaceUnMes = new Date();
    fechaHaceUnMes.setDate(hoy.getDate() - 30);

    const result = this.factoring.reduce((acc, contrato) => {
      if (!contrato || typeof contrato.monto === 'undefined' || typeof contrato.montoPagoNeto === 'undefined' || !contrato.fechaIngreso || (!contrato.fechaPagoReal && !contrato.fechaPagoEstimado)) {
        return acc;
      }
      const moneda = contrato.moneda ? contrato.moneda.toUpperCase() : "PEN";
      const principal = Number(contrato.monto) || 0;
      const interest = Number(contrato.montoPagoNeto) || 0; 
      
      const tcPago = Number(contrato.tc) || TASA_CAMBIO_USD_PEN;
      const principalPEN = moneda === 'USD' ? principal * tcPago : principal;
      const interestPEN = moneda === 'USD' ? interest * tcPago : interest;

      acc.totalPrincipalConverted += principalPEN;
      acc.totalInterestConverted += interestPEN; 
      acc.numContratos++;
      if (contrato.isPaid) {
        acc.contratosPagados++;
      } else if (contrato.isPending) {
        acc.contratosPendientes++;
      }

      const fechaIngreso = dateUtils.parse(contrato.fechaIngreso);
      const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
      const fechaPago = dateUtils.parse(fechaPagoStr);

      if (fechaPago >= fechaHaceUnMes && fechaPago <= hoy) {
        acc.gananciaUltimoMes += interestPEN;
      }

      if (isNaN(fechaIngreso.getTime()) || isNaN(fechaPago.getTime())) {
        acc.totalPrincipalConverted -= principalPEN;
        acc.totalInterestConverted -= interestPEN;
        acc.numContratos--;
        if (contrato.isPaid) acc.contratosPagados--;
        else if (contrato.isPending) acc.contratosPendientes--;
        return acc;
      }

      if (principalPEN > 0) { 
        const flows = [
          { date: fechaIngreso, amount: -principalPEN }, 
          { date: fechaPago, amount: principalPEN + interestPEN } 
        ];

        try {
          const contractTIR = financeUtils.calcularTasaAnualizada(flows);
          if (!isNaN(contractTIR) && isFinite(contractTIR) && contractTIR > -99 && contractTIR < 500) {
            acc.weightedRateSum += (contractTIR / 100) * principalPEN;
            acc.totalPrincipalForRate += principalPEN; 
          } else {
          }
        } catch (e) {
        }
      } else {
      }

      return acc;
    }, {
      totalPrincipalConverted: 0, 
      weightedRateSum: 0,         
      totalInterestConverted: 0,  
      numContratos: 0,            
      contratosPagados: 0,        
      contratosPendientes: 0,     
      totalPrincipalForRate: 0,   
      gananciaUltimoMes: 0
    });

    // === Tasas anualizadas ===
    const contractsPaid      = this.paidContracts;
    const contractsAll       = this.factoring.filter(c => c);
    
    const flowsReal    = financeUtils.buildCashFlowData(contractsPaid);
    const flowsEsper   = financeUtils.buildCashFlowData(contractsAll);
    
    const teaReal      = financeUtils.calcularTasaAnualizada(flowsReal);
    const teaEsperada  = financeUtils.calcularTasaAnualizada(flowsEsper);
    
    const overallRate = isNaN(teaEsperada) ? 0 : teaEsperada;

    const actualPagados = this.paidContracts.length; 
    const actualPendientes = this.pendingContracts.length;
    return {
      totalInvertido: result.totalPrincipalConverted, 
      totalRecibido: result.totalPrincipalConverted + result.totalInterestConverted, 
      montoGanado: result.totalInterestConverted, 
      tasa: isNaN(overallRate) ? 0 : overallRate, 
      contratos: result.numContratos,
      contratosPagados: actualPagados,
      contratosPendientes: actualPendientes,
      gananciaUltimoMes: result.gananciaUltimoMes,
      tasaReal:    isNaN(teaReal)     ? 0 : teaReal,
      tasaEsperada: isNaN(teaEsperada) ? 0 : teaEsperada
    };
  }
  
  calcularRentabilidadConFlujos() {
    const validFactoring = this.factoring.filter(contrato =>
        contrato &&
        !isNaN(Number(contrato.monto)) &&
        !isNaN(Number(contrato.montoPagoNeto)) &&
        contrato.fechaIngreso &&
        (contrato.fechaPagoReal || contrato.fechaPagoEstimado) &&
        !isNaN(dateUtils.parse(contrato.fechaIngreso).getTime()) &&
        !isNaN(dateUtils.parse(contrato.fechaPagoReal || contrato.fechaPagoEstimado).getTime())
    );
    if (validFactoring.length === 0 && this.additionalFlows.length === 0) {
      return 0;
    }
    const cashFlows = financeUtils.buildCashFlowData(validFactoring, this.additionalFlows);
    if (!cashFlows || cashFlows.length < 2) {
      return 0;
    }
    try {
      const rate = financeUtils.calcularTasaAnualizada(cashFlows);
      return isNaN(rate) || !isFinite(rate) ? 0 : rate;
    } catch (error) {
      return 0;
    }
  }
  
  changeTab(tab) {
    this.currentTab = tab;
    let contractsToShow = [];
    switch (tab) {
      case 'pending':
        contractsToShow = this.pendingContracts;
        break;
      case 'paid':
        contractsToShow = this.paidContracts;
        break;
      case 'all':
      default:
        contractsToShow = this.factoring.filter(c => c); 
        tab = 'all'; 
        this.currentTab = 'all';
        break;
    }

    return [...contractsToShow].sort((a, b) => {
      const fechaStrA = a.isPaid && a.fechaPagoReal ? a.fechaPagoReal : a.fechaPagoEstimado;
      const fechaStrB = b.isPaid && b.fechaPagoReal ? b.fechaPagoReal : b.fechaPagoEstimado;
      const fechaA = dateUtils.parse(fechaStrA); 
      const fechaB = dateUtils.parse(fechaStrB);

      const timeA = !isNaN(fechaA?.getTime()) ? fechaA.getTime() : Infinity;
      const timeB = !isNaN(fechaB?.getTime()) ? fechaB.getTime() : Infinity;

      return timeA - timeB;
    });
  }

  async calcularTotalManualSoles() {
    const [penData, gananciaPEN] = await Promise.all([
      this.loadJsonFile('assets/pen.json'),
      this.loadJsonFile('assets/gananciaPEN.json')
    ]);
    let totalDepositos = 0;
    let totalRetiros = 0;
    let totalGanancias = 0;

    if (Array.isArray(penData)) {
      penData.forEach(row => {
        const tipo = (row.Movimiento || '').toLowerCase();
        const monto = Number(row.Monto) || 0;
        // Consideramos 'deposito', 'inversion' y 'dolares a soles' como entradas a PEN
        if (['deposito', 'inversion', 'dolares a soles'].includes(tipo)) {
          totalDepositos += monto;
        } else if (['retiro', 'soles a dolares'].includes(tipo)) {
          // Consideramos 'retiro' y 'soles a dolares' como salidas de PEN
          totalRetiros += monto;
        }
        // Otros tipos como 'interes ganado' se manejan por separado con gananciaPEN.json
      });
    }

    if (Array.isArray(gananciaPEN)) {
      gananciaPEN.forEach(row => {
        totalGanancias += Number(row.Monto) || 0;
      });
    }

    // Total = (Depósitos + Conversiones a Soles) - (Retiros + Conversiones desde Soles) + Ganancias en Soles
    return Number((totalDepositos - totalRetiros + totalGanancias).toFixed(2));
  }

  async calcularTotalManualUSD() {
    const [usdData, gananciaUSD] = await Promise.all([
      this.loadJsonFile('assets/usd.json'),
      this.loadJsonFile('assets/gananciaUSD.json')
    ]);
    let totalUSDNeto = 0; // Usamos una sola variable para simplificar
    let totalGanancias = 0;

    if (Array.isArray(usdData)) {
      usdData.forEach(row => {
        const tipo = (row.Movimiento || '').toLowerCase();
        const monto = Number(row.Monto) || 0;
        // Consideramos 'deposito', 'inversion' y 'soles a dolares' como entradas a USD
        if (['deposito', 'inversion', 'soles a dolares'].includes(tipo)) {
          totalUSDNeto += monto;
        } else if (['retiro', 'dolares a soles'].includes(tipo)) {
          // Consideramos 'retiro' y 'dolares a soles' como salidas de USD
          totalUSDNeto -= monto;
        }
         // Otros tipos como 'interes ganado' se manejan por separado con gananciaUSD.json
      });
    }

    if (Array.isArray(gananciaUSD)) {
      gananciaUSD.forEach(row => {
        totalGanancias += Number(row.Monto) || 0;
      });
    }

    // Total = (Depósitos + Conversiones a USD) - (Retiros + Conversiones desde USD) + Ganancias en USD
    return Number((totalUSDNeto + totalGanancias).toFixed(2));
  }

  async calcularInteresManual() {
    const [penData, gananciaPEN, usdData, gananciaUSD] = await Promise.all([
        this.loadJsonFile('assets/pen.json'),
        this.loadJsonFile('assets/gananciaPEN.json'),
        this.loadJsonFile('assets/usd.json'),
        this.loadJsonFile('assets/gananciaUSD.json')
    ]);

    let capitalPEN = 0;
    let retirosPEN = 0;
    let conversionesNetasPEN = 0; // (dolares a soles) - (soles a dolares)

    if (Array.isArray(penData)) {
        penData.forEach(row => {
            const tipo = (row.Movimiento || '').toLowerCase();
            const monto = Number(row.Monto) || 0;
            if (tipo === 'deposito') capitalPEN += monto;
            else if (tipo === 'retiro') retirosPEN += monto;
            else if (tipo === 'dolares a soles') conversionesNetasPEN += monto;
            else if (tipo === 'soles a dolares') conversionesNetasPEN -= monto;
            // 'inversion' e 'interes ganado' no son capital inicial ni retiros directos
        });
    }

    let capitalUSD = 0;
    let retirosUSD = 0;
    let conversionesNetasUSD = 0; // (soles a dolares) - (dolares a soles)

    if (Array.isArray(usdData)) {
        usdData.forEach(row => {
            const tipo = (row.Movimiento || '').toLowerCase();
            const monto = Number(row.Monto) || 0;
            if (tipo === 'deposito') capitalUSD += monto;
            else if (tipo === 'retiro') retirosUSD += monto;
            else if (tipo === 'soles a dolares') conversionesNetasUSD += monto;
            else if (tipo === 'dolares a soles') conversionesNetasUSD -= monto;
             // 'inversion' e 'interes ganado' no son capital inicial ni retiros directos
        });
    }

    let totalGananciaPEN = 0;
    if (Array.isArray(gananciaPEN)) {
        gananciaPEN.forEach(row => {
            totalGananciaPEN += Number(row.Monto) || 0;
        });
    }

    let totalGananciaUSD = 0;
    if (Array.isArray(gananciaUSD)) {
        gananciaUSD.forEach(row => {
            totalGananciaUSD += Number(row.Monto) || 0;
        });
    }

    // Capital Invertido Neto = (Depósitos - Retiros) + Conversiones Netas
    const totalInvertidoPEN = capitalPEN - retirosPEN + conversionesNetasPEN;
    const totalInvertidoUSD = capitalUSD - retirosUSD + conversionesNetasUSD;

    const TASA_CAMBIO_USD_PEN = typeof CONFIG !== "undefined" ? CONFIG.TASAS.CAMBIO_USD_PEN : 3.7;

    const totalInvertidoPENeq = totalInvertidoPEN + (totalInvertidoUSD * TASA_CAMBIO_USD_PEN);
    const totalGanadoPENeq = totalGananciaPEN + (totalGananciaUSD * TASA_CAMBIO_USD_PEN);

    // Evitar división por cero o por capital negativo/cero si no hubo inversión neta
    const interesPorcentaje = totalInvertidoPENeq > 0
        ? (totalGanadoPENeq / totalInvertidoPENeq) * 100
        : 0;

    return {
        totalInvertidoPEN: Number(totalInvertidoPEN.toFixed(2)),
        totalGanadoPEN: Number(totalGananciaPEN.toFixed(2)),
        totalInvertidoUSD: Number(totalInvertidoUSD.toFixed(2)),
        totalGanadoUSD: Number(totalGananciaUSD.toFixed(2)),
        totalInvertidoPENeq: Number(totalInvertidoPENeq.toFixed(2)),
        totalGanadoPENeq: Number(totalGanadoPENeq.toFixed(2)),
        interesPorcentaje: Number(interesPorcentaje.toFixed(2))
    };
  }
}

window.mostrarDineroTotalEnSoles = async function() {
  const dataService = new DataService();
  const total = await dataService.calcularTotalManualSoles();
  alert('Dinero total en soles (PEN): ' + total);
};

window.mostrarDineroTotalEnDolares = async function() {
  const dataService = new DataService();
  const total = await dataService.calcularTotalManualUSD();
  alert('Dinero total en dólares (USD): ' + total);
};

window.mostrarInteresManual = async function() {
  const dataService = new DataService();
  const res = await dataService.calcularInteresManual();
  alert(
    'Interés total ganado (PEN eq): ' + res.totalGanadoPENeq.toFixed(2) +
    '\nCapital invertido (PEN eq): ' + res.totalInvertidoPENeq.toFixed(2) +
    '\nPorcentaje de interés: ' + res.interesPorcentaje.toFixed(2) + '%'
  );
};