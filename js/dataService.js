class DataService {
  constructor() {
    this.factoring = [];
    this.additionalFlows = [];
    this.pendingContracts = [];
    this.paidContracts = [];
    this.currentTab = null; 
    this.totalDepositosCalculado = 0; 
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
      throw error;
    }
  }

  async loadJsonFile(filepath) {
    try {
      const response = await fetch(filepath);
      if (!response.ok) throw new Error(`Error al cargar ${filepath}: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      return [];
    }
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
  
  calculateTotalDeposits(penData, usdData) {
    let totalPEN = 0, totalUSD = 0;
    const movimientoKey = "Movimiento", montoKey = "Monto";
    const tipoDeposito = "deposito", tipoRetiro = "retiro";

    if (Array.isArray(penData)) {
      penData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const tipo = row[movimientoKey].toLowerCase();
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            if (tipo === tipoDeposito) totalPEN += monto;
            else if (tipo === tipoRetiro) totalPEN -= monto;
          }
        }
      });
    }

    if (Array.isArray(usdData)) {
      usdData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const tipo = row[movimientoKey].toLowerCase();
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            if (tipo === tipoDeposito) totalUSD += monto;
            else if (tipo === tipoRetiro) totalUSD -= monto;
          }
        }
      });
    }

    const totalDepositosEnPEN = totalPEN + (totalUSD * TASA_CAMBIO_USD_PEN);
    return totalDepositosEnPEN;
  }

  async calculateTotalDepositsConAjuste(penData, usdData, gananciaPEN, gananciaUSD, conversiones) {
    // Sumar depósitos y restar retiros
    let totalPEN = 0, totalUSD = 0;
    const movimientoKey = "Movimiento", montoKey = "Monto";
    const tipoDeposito = "deposito", tipoRetiro = "retiro";

    if (Array.isArray(penData)) {
      penData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const tipo = row[movimientoKey].toLowerCase();
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            if (tipo === tipoDeposito) totalPEN += monto;
            else if (tipo === tipoRetiro) totalPEN -= monto;
          }
        }
      });
    }

    if (Array.isArray(usdData)) {
      usdData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const tipo = row[movimientoKey].toLowerCase();
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            if (tipo === tipoDeposito) totalUSD += monto;
            else if (tipo === tipoRetiro) totalUSD -= monto;
          }
        }
      });
    }

    // Ajustar por conversiones reales USD->PEN
    if (Array.isArray(conversiones)) {
      conversiones.forEach(conv => {
        totalUSD -= Number(conv["Monto Enviado"] || 0);
        totalPEN += Number(conv["Monto Recibido"] || 0);
      });
    }

    // Sumar ganancias efectivas
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

    // El saldo final es el capital + ganancias efectivas
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
    const montoPagoNeto = parseFloat((monto * (retornoMensual / 100) * meses).toFixed(2));
    
    const result = {
      nombre: contract["Cliente"],
      monto,
      moneda: contract["Moneda"] || "PEN",
      fechaIngreso: fechaIngreso.toISOString().slice(0, 10),
      fechaPagoEstimado: fechaPago.toISOString().slice(0, 10),
      montoPagoNeto,
      codigoSubasta: contract["Codigo de subasta"]
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
      const principalPEN = !isNaN(principal) ? financeUtils.convertirAPEN(principal, moneda) : 0;
      const interestPEN = !isNaN(interest) ? financeUtils.convertirAPEN(interest, moneda) : 0; 

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

    const overallRate = result.totalPrincipalForRate > 0 ? (result.weightedRateSum / result.totalPrincipalForRate) * 100 : 0;

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
      gananciaUltimoMes: result.gananciaUltimoMes
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

  // Lógica exacta para saldo PEN igual a la plataforma
  async calcularSaldoPENPlataforma() {
    // Cargar los archivos necesarios
    const [pen, gananciaPEN] = await Promise.all([
      this.loadJsonFile('assets/pen.json'),
      this.loadJsonFile('assets/gananciaPEN.json')
    ]);
    let totalDepositos = 0;
    let totalRetiros = 0;
    let totalConversiones = 0;
    let totalGanancias = 0;
    // Sumar depósitos y conversiones a PEN
    pen.forEach(row => {
      if (row.Movimiento && typeof row.Movimiento === 'string' && row.Monto !== undefined && row.Monto !== null) {
        const tipo = row.Movimiento.toLowerCase();
        const monto = Number(row.Monto);
        if (!isNaN(monto)) {
          if (tipo === 'deposito') totalDepositos += monto;
          else if (tipo === 'retiro') totalRetiros += monto;
          else if (tipo === 'dolares a soles') totalConversiones += monto;
        }
      }
    });
    // Sumar ganancias efectivas en PEN
    gananciaPEN.forEach(row => {
      totalGanancias += Number(row.Monto || 0);
    });
    // Aplicar la lógica: depósitos + conversiones - retiros + ganancias
    return totalDepositos + totalConversiones - totalRetiros + totalGanancias;
  }

  /**
   * Suma manualmente depósitos, ganancias en soles y cambios a soles.
   * Devuelve el total en PEN.
   */
  async calcularTotalManualSoles() {
    const [pen, gananciaPEN, conversiones] = await Promise.all([
      this.loadJsonFile('assets/pen.json'),
      this.loadJsonFile('assets/gananciaPEN.json'),
      this.loadJsonFile('assets/dolares-a-soles.json')
    ]);
    let totalDepositos = 0;
    let totalRetiros = 0;
    let totalGanancias = 0;
    let totalConversiones = 0;

    if (Array.isArray(pen)) {
      pen.forEach(row => {
        if (row.Movimiento && typeof row.Movimiento === 'string' && row.Monto !== undefined && row.Monto !== null) {
          const tipo = row.Movimiento.toLowerCase();
          const monto = Number(row.Monto);
          if (!isNaN(monto)) {
            if (tipo === 'deposito') totalDepositos += monto;
            else if (tipo === 'retiro') totalRetiros += monto;
          }
        }
      });
    }

    if (Array.isArray(gananciaPEN)) {
      gananciaPEN.forEach(row => {
        totalGanancias += Number(row.Monto || 0);
      });
    }

    if (Array.isArray(conversiones)) {
      conversiones.forEach(conv => {
        totalConversiones += Number(conv["Monto Recibido"] || 0);
      });
    }

    // Suma manual: depósitos + ganancias + conversiones - retiros
    const total = totalDepositos + totalGanancias + totalConversiones - totalRetiros;
    return total;
  }

  /**
   * Suma manualmente depósitos y ganancias en dólares.
   * Devuelve el total en USD.
   */
  async calcularTotalManualUSD() {
    const [usd, gananciaUSD, conversiones] = await Promise.all([
      this.loadJsonFile('assets/usd.json'),
      this.loadJsonFile('assets/gananciaUSD.json'),
      this.loadJsonFile('assets/dolares-a-soles.json')
    ]);
    
    let totalUSD = 0; // Inicia el total en 0

    // Sumar depósitos y restar retiros
    if (Array.isArray(usd)) {
      usd.forEach(row => {
        if (row.Movimiento && typeof row.Movimiento === 'string' && row.Monto !== undefined && row.Monto !== null) {
          const tipo = row.Movimiento.toLowerCase();
          const monto = Number(row.Monto);
          if (!isNaN(monto)) {
            if (tipo === 'deposito') {
              totalUSD += monto; // Suma depósitos
            } else if (tipo === 'retiro') {
              totalUSD -= monto; // Resta retiros
            }
          }
        }
      });
    }

    // Sumar ganancias
    if (Array.isArray(gananciaUSD)) {
      gananciaUSD.forEach(row => {
        const montoGanancia = Number(row.Monto || 0);
        if (!isNaN(montoGanancia)) {
          totalUSD += montoGanancia; // Suma ganancias
        }
      });
    }

    // Restar los dólares enviados en conversiones a soles
    if (Array.isArray(conversiones)) {
      conversiones.forEach(conv => {
        // Asegúrate que la clave "Monto Enviado" es correcta
        const montoEnviado = Number(conv["Monto Enviado"] || 0); 
        if (!isNaN(montoEnviado)) {
          totalUSD -= montoEnviado; // Resta directamente el monto enviado de la conversión
        }
      });
    }

    return totalUSD; // Devuelve el total calculado
  }

  /**
   * Calcula el interés total ganado (ganancias PEN + USD) y el porcentaje de interés respecto al capital invertido.
   * Devuelve un objeto con los totales y el interés.
   */
  async calcularInteresManual() {
    const [pen, gananciaPEN, conversiones, usd, gananciaUSD] = await Promise.all([
      this.loadJsonFile('assets/pen.json'),
      this.loadJsonFile('assets/gananciaPEN.json'),
      this.loadJsonFile('assets/dolares-a-soles.json'),
      this.loadJsonFile('assets/usd.json'),
      this.loadJsonFile('assets/gananciaUSD.json')
    ]);
    // Calcular capital invertido (sin ganancias)
    let capitalPEN = 0, capitalUSD = 0;
    let retirosPEN = 0, retirosUSD = 0;
    let conversionesPEN = 0;
    if (Array.isArray(pen)) {
      pen.forEach(row => {
        if (row.Movimiento && typeof row.Movimiento === 'string' && row.Monto !== undefined && row.Monto !== null) {
          const tipo = row.Movimiento.toLowerCase();
          const monto = Number(row.Monto);
          if (!isNaN(monto)) {
            if (tipo === 'deposito') capitalPEN += monto;
            else if (tipo === 'retiro') retirosPEN += monto;
          }
        }
      });
    }
    if (Array.isArray(conversiones)) {
      conversiones.forEach(conv => {
        conversionesPEN += Number(conv["Monto Recibido"] || 0);
      });
    }
    if (Array.isArray(usd)) {
      usd.forEach(row => {
        if (row.Movimiento && typeof row.Movimiento === 'string' && row.Monto !== undefined && row.Monto !== null) {
          const tipo = row.Movimiento.toLowerCase();
          const monto = Number(row.Monto);
          if (!isNaN(monto)) {
            if (tipo === 'deposito') capitalUSD += monto;
            else if (tipo === 'retiro') retirosUSD += monto;
          }
        }
      });
    }
    // Ganancias
    let gananciasPEN = 0, gananciasUSD = 0;
    if (Array.isArray(gananciaPEN)) {
      gananciaPEN.forEach(row => {
        gananciasPEN += Number(row.Monto || 0);
      });
    }
    if (Array.isArray(gananciaUSD)) {
      gananciaUSD.forEach(row => {
        gananciasUSD += Number(row.Monto || 0);
      });
    }
    // Totales
    const totalInvertidoPEN = capitalPEN + conversionesPEN - retirosPEN;
    const totalInvertidoUSD = capitalUSD - retirosUSD;
    const TASA_CAMBIO_USD_PEN = typeof CONFIG !== "undefined" ? CONFIG.TASAS.CAMBIO_USD_PEN : 3.7;
    const totalInvertidoPENeq = totalInvertidoPEN + (totalInvertidoUSD * TASA_CAMBIO_USD_PEN);
    const totalGanadoPENeq = gananciasPEN + (gananciasUSD * TASA_CAMBIO_USD_PEN);
    const interesPorcentaje = totalInvertidoPENeq > 0 ? (totalGanadoPENeq / totalInvertidoPENeq) * 100 : 0;
    // El frontend ahora usará la tasa anualizada real calculada por calcularRentabilidadConFlujos
    return {
      totalInvertidoPEN,
      totalInvertidoUSD,
      totalInvertidoPENeq,
      totalGanadoPEN: gananciasPEN,
      totalGanadoUSD: gananciasUSD,
      totalGanadoPENeq,
      interesPorcentaje // Este es solo referencial, el frontend usará la tasa anualizada real
    };
  }
}

// Mostrar el dinero total en soles (PEN) en el navegador para depuración
window.mostrarDineroTotalEnSoles = async function() {
  const dataService = new DataService();
  const total = await dataService.calcularTotalManualSoles();
  alert('Dinero total en soles (PEN): ' + total);
};

// Exportar funciones para pruebas manuales desde la consola
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

// Solo para pruebas automáticas, descomenta la siguiente línea:
// window.mostrarDineroTotalEnSoles();