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
      const [rawFactoringData, gananciasUSDData, gananciasPENData, penData, usdData] = await Promise.all([
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
        factoringRaw: this.processFactoringData(rawFactoringData), 
        ganancias: allGanancias, 
        saldoPEN,
        saldoUSD
      };
      
      this.processContracts(initialData); 
      
      // Usar CONFIG directamente
      const capitalTotal = saldoPEN + saldoUSD * CONFIG.TASAS.CAMBIO_USD_PEN;
      
      // Verificamos que buildFactoringData existe antes de llamarlo
      const factoringData = typeof this.buildFactoringData === 'function' 
        ? this.buildFactoringData()
        : { 
            totalInvertido: 0, totalRecibido: 0, montoGanado: 0, tasa: 0,
            contratos: 0, contratosPagados: 0, contratosPendientes: 0, gananciaUltimoMes: 0
          };
            
      return {
        factoring: this.factoring, 
        factoringData: factoringData,
        capitalTotal,
        pendingContracts: this.pendingContracts,
        paidContracts: this.paidContracts,
        totalDepositos: this.totalDepositosCalculado 
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
    // Usar CONFIG directamente
    return totalPEN + (totalUSD * CONFIG.TASAS.CAMBIO_USD_PEN);
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
      // Filtramos inmediatamente los contratos rechazados
      if (contract["Estado"] && contract["Estado"].toLowerCase() === "rechazado") {
        return null;
      }
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
    
    // Doble verificación para asegurar que los contratos rechazados nunca pasen
    if (contract["Estado"] && contract["Estado"].toLowerCase() === "rechazado") {
      return null;
    }
    
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
  
  isWithinLastMonth(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    
    return date >= oneMonthAgo && date <= today;
  }

  async calcularTotalManualSoles() {
    const [penData, gananciaPEN] = await Promise.all([
      this.loadJsonFile('assets/pen.json'),
      this.loadJsonFile('assets/gananciaPEN.json')
    ]);
    let totalDepositos = 0;
    let totalRetiros = 0;
    let totalGanancias = 0;
    let gananciasAntiguas = 0;

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
        const monto = Number(row.Monto) || 0;
        // Solo consideramos como ganancias los montos del último mes
        if (this.isWithinLastMonth(row.Fecha)) {
          totalGanancias += monto;
        } else {
          // Las ganancias antiguas se consideran como parte del capital
          gananciasAntiguas += monto;
        }
      });
    }

    // Agregamos las ganancias antiguas al capital
    totalDepositos += gananciasAntiguas;

    // Total = (Depósitos + Ganancias antiguas + Conversiones a Soles) - (Retiros + Conversiones desde Soles) + Ganancias recientes
    return Number((totalDepositos - totalRetiros + totalGanancias).toFixed(2));
  }

  async calcularTotalManualUSD() {
    const [usdData, gananciaUSD] = await Promise.all([
      this.loadJsonFile('assets/usd.json'),
      this.loadJsonFile('assets/gananciaUSD.json')
    ]);
    let totalUSDNeto = 0; // Usamos una sola variable para simplificar
    let totalGanancias = 0;
    let gananciasAntiguas = 0;

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
        const monto = Number(row.Monto) || 0;
        // Solo consideramos como ganancias los montos del último mes
        if (this.isWithinLastMonth(row.Fecha)) {
          totalGanancias += monto;
        } else {
          // Las ganancias antiguas se consideran como parte del capital
          gananciasAntiguas += monto;
        }
      });
    }

    // Agregamos las ganancias antiguas al capital
    totalUSDNeto += gananciasAntiguas;

    // Total = (Depósitos + Ganancias antiguas + Conversiones a USD) - (Retiros + Conversiones desde USD) + Ganancias recientes
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
    let gananciasAntiguasPEN = 0;

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
    let gananciasAntiguasUSD = 0;

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
            const monto = Number(row.Monto) || 0;
            if (this.isWithinLastMonth(row.Fecha)) {
                totalGananciaPEN += monto;
            } else {
                gananciasAntiguasPEN += monto;
            }
        });
    }

    let totalGananciaUSD = 0;
    if (Array.isArray(gananciaUSD)) {
        gananciaUSD.forEach(row => {
            const monto = Number(row.Monto) || 0;
            if (this.isWithinLastMonth(row.Fecha)) {
                totalGananciaUSD += monto;
            } else {
                gananciasAntiguasUSD += monto;
            }
        });
    }

    // Añadimos las ganancias antiguas al capital invertido
    capitalPEN += gananciasAntiguasPEN;
    capitalUSD += gananciasAntiguasUSD;

    // Capital Invertido Neto = (Depósitos - Retiros) + Conversiones Netas + Ganancias Antiguas
    const totalInvertidoPEN = capitalPEN - retirosPEN + conversionesNetasPEN;
    const totalInvertidoUSD = capitalUSD - retirosUSD + conversionesNetasUSD;

    // Usar CONFIG directamente
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

// Agregamos el método calcularRentabilidadConFlujos que falta
DataService.prototype.calcularRentabilidadConFlujos = function() {
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
};

// Agregamos el método changeTab para permitir cambiar entre pestañas
DataService.prototype.changeTab = function(tabType) {
  // Actualizamos el tab actual
  this.currentTab = tabType;
  
  // Devolvemos la lista de contratos según el tipo de tab
  switch (tabType) {
    case 'pending':
      return this.pendingContracts;
    case 'paid':
      return this.paidContracts;
    case 'potential-earnings': // Manejar nuevo tipo de tab
    case 'all':
    default:
      return this.factoring; // Devuelve todos los contratos para 'all' y 'potential-earnings'
  }
};


// Asegurándonos que el método buildFactoringData exista y esté correctamente definido
DataService.prototype.buildFactoringData = function() {
  if (!this.factoring || this.factoring.length === 0) {
    return {
      totalInvertido: 0,
      totalRecibido: 0,
      montoGanado: 0,
      tasa: 0,
      contratos: 0,
      contratosPagados: 0,
      contratosPendientes: 0,
      gananciaUltimoMes: 0,
      tasaReal: 0,
      tasaEsperada: 0,
      totalGananciaPotencialPENeq: 0 // Inicializar nuevo campo
    };
  }

  const hoy = new Date();
  const fechaHaceUnMes = new Date();
  fechaHaceUnMes.setDate(hoy.getDate() - 30);

  let totalGananciaPotencialPENeq = 0; // Variable para sumar ganancias potenciales

  const result = this.factoring.reduce((acc, contrato) => {
    if (!contrato || typeof contrato.monto === 'undefined' || typeof contrato.montoPagoNeto === 'undefined' || !contrato.fechaIngreso || (!contrato.fechaPagoReal && !contrato.fechaPagoEstimado)) {
      return acc;
    }
    const moneda = contrato.moneda ? contrato.moneda.toUpperCase() : "PEN";
    const principal = Number(contrato.monto) || 0;
    const interest = Number(contrato.montoPagoNeto) || 0;

    // Usar CONFIG directamente
    const tcPago = Number(contrato.tc) || CONFIG.TASAS.CAMBIO_USD_PEN;
    const principalPEN = moneda === 'USD' ? principal * tcPago : principal;
    const interestPEN = moneda === 'USD' ? interest * tcPago : interest;

    // Sumar la ganancia (interés) en PEN a la ganancia potencial total
    totalGananciaPotencialPENeq += interestPEN;

    acc.totalPrincipalConverted += principalPEN;
    acc.totalInterestConverted += interestPEN; // Esto suma solo las ganancias ya consideradas (puede diferir de la potencial si hay lógica adicional)
    acc.numContratos++;
    if (contrato.isPaid) {
      acc.contratosPagados++;
    } else if (contrato.isPending) {
      acc.contratosPendientes++;
    }

    const fechaIngreso = dateUtils.parse(contrato.fechaIngreso);
    const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
    const fechaPago = dateUtils.parse(fechaPagoStr);

    if (fechaPago >= fechaHaceUnMes && fechaPago <= hoy && contrato.isPaid) { // Asegurarse que solo ganancias pagadas en el último mes
      acc.gananciaUltimoMes += interestPEN;
    }

    // ... resto del código de reduce ...
    // ... (cálculo de weightedRateSum, etc.) ...
     if (isNaN(fechaIngreso.getTime()) || isNaN(fechaPago.getTime())) {
      // Revertir sumas si las fechas son inválidas
      acc.totalPrincipalConverted -= principalPEN;
      acc.totalInterestConverted -= interestPEN;
      totalGananciaPotencialPENeq -= interestPEN; // Revertir suma potencial
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
        }
      } catch (e) {
        // Error silencioso
      }
    }

    return acc;
  }, {
    totalPrincipalConverted: 0,
    weightedRateSum: 0,
    totalInterestConverted: 0, // Mantenemos la lógica original aquí para otras métricas
    numContratos: 0,
    contratosPagados: 0,
    contratosPendientes: 0,
    totalPrincipalForRate: 0,
    gananciaUltimoMes: 0
  });

  // === Tasas anualizadas ===
  const contractsPaid = this.paidContracts;
  const contractsAll = this.factoring.filter(c => c);

  const flowsReal = financeUtils.buildCashFlowData(contractsPaid);
  const flowsEsper = financeUtils.buildCashFlowData(contractsAll);

  const teaReal = financeUtils.calcularTasaAnualizada(flowsReal);
  const teaEsperada = financeUtils.calcularTasaAnualizada(flowsEsper);

  const overallRate = isNaN(teaEsperada) ? 0 : teaEsperada;

  // Usamos los contadores reales de las listas filtradas
  const actualPagados = this.paidContracts.length;
  const actualPendientes = this.pendingContracts.length;
  return {
    totalInvertido: result.totalPrincipalConverted,
    totalRecibido: result.totalPrincipalConverted + result.totalInterestConverted, // Esto podría necesitar revisión si 'totalInterestConverted' no incluye todo
    montoGanado: result.totalInterestConverted, // Ganancia realizada o basada en la lógica existente
    tasa: isNaN(overallRate) ? 0 : overallRate,
    contratos: result.numContratos,
    contratosPagados: actualPagados,
    contratosPendientes: actualPendientes,
    gananciaUltimoMes: result.gananciaUltimoMes,
    tasaReal: isNaN(teaReal) ? 0 : teaReal,
    tasaEsperada: isNaN(teaEsperada) ? 0 : teaEsperada,
    totalGananciaPotencialPENeq: Number(totalGananciaPotencialPENeq.toFixed(2)) // Añadir el nuevo campo calculado
  };
};