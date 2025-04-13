// Asegúrate de que TASA_CAMBIO_USD_PEN esté definida globalmente o importada.
// Ejemplo: const TASA_CAMBIO_USD_PEN = 3.75; 

// Asegúrate de que dateUtils esté disponible (importado o global).
// Ejemplo: import dateUtils from './dateUtils.js'; 
// O: const dateUtils = window.dateUtils;

// Asegúrate de que financeUtils esté disponible (importado o global).
// Ejemplo: import financeUtils from './financeUtils.js';
// O: const financeUtils = window.financeUtils;

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
      // Cambiar las rutas a los archivos .json
      const [factoringData, gananciasUSDData, gananciasPENData, penData, usdData] = await Promise.all([
        this.loadJsonFile('assets/mis-inversiones.json'), // Cambiado
        this.loadJsonFile('assets/gananciaUSD.json'),    // Cambiado
        this.loadJsonFile('assets/gananciaPEN.json'),    // Cambiado
        this.loadJsonFile('assets/pen.json'),           // Cambiado
        this.loadJsonFile('assets/usd.json')            // Cambiado
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
      console.error("Error al cargar datos:", error);
      throw error;
    }
  }

  // Renombrar y modificar la función para cargar JSON
  async loadJsonFile(filepath) {
    try {
      const response = await fetch(filepath);
      if (!response.ok) throw new Error(`Error al cargar ${filepath}: ${response.statusText}`);

      // Parsear la respuesta como JSON directamente
      const jsonData = await response.json();
      return jsonData;

    } catch (error) {
      console.error(`Error al procesar archivo ${filepath}:`, error);
      return []; // Devolver array vacío en caso de error
    }
  }
  
  processFactoringData(data) {
    if (!data || data.length === 0) return [];
    
    return data.map(row => {
      // Usar directamente las fechas del JSON (asumiendo formato ISO o similar)
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
       // Usar directamente la fecha del JSON
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
    let totalPEN = 0;
    let totalUSD = 0;
    const movimientoKey = "Movimiento"; 
    const montoKey = "Monto";         
    const tipoDeposito = "deposito";  

    if (Array.isArray(penData)) {
      penData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[movimientoKey].toLowerCase() === tipoDeposito &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            totalPEN += monto;
          }
        }
      });
    }

    if (Array.isArray(usdData)) {
      usdData.forEach(row => {
        if (row && row[movimientoKey] && typeof row[movimientoKey] === 'string' &&
            row[movimientoKey].toLowerCase() === tipoDeposito &&
            row[montoKey] !== undefined && row[montoKey] !== null) {
          const monto = Number(row[montoKey]);
          if (!isNaN(monto)) {
            totalUSD += monto;
          }
        }
      });
    }

    const totalDepositosEnPEN = totalPEN + (totalUSD * TASA_CAMBIO_USD_PEN);
    console.log(`Depósitos calculados: PEN ${totalPEN.toFixed(2)}, USD ${totalUSD.toFixed(2)}. Total en PEN: ${totalDepositosEnPEN.toFixed(2)}`);
    return totalDepositosEnPEN;
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
      if (codigo) {
        mapping[codigo] = row;
      }
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
      console.warn("Fecha inválida en contrato:", contract);
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
        gananciaUltimoMes: 0 // Valor inicial
      };
    }

    const hoy = new Date();
    const fechaHaceUnMes = new Date();
    fechaHaceUnMes.setDate(hoy.getDate() - 30);

    const result = this.factoring.reduce((acc, contrato) => {
      if (!contrato || typeof contrato.monto === 'undefined' || typeof contrato.montoPagoNeto === 'undefined' || !contrato.fechaIngreso || (!contrato.fechaPagoReal && !contrato.fechaPagoEstimado)) {
        console.warn("Skipping incomplete contract in buildFactoringData:", contrato);
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

      // Sumar ganancia si el pago fue en el último mes
      if (fechaPago >= fechaHaceUnMes && fechaPago <= hoy) {
        acc.gananciaUltimoMes += interestPEN;
      }

      if (isNaN(fechaIngreso.getTime()) || isNaN(fechaPago.getTime())) {
        console.warn("Skipping contract due to invalid dates in buildFactoringData:", contrato.codigoSubasta, fechaIngreso, fechaPago);
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
            console.warn(`Invalid or extreme TIR calculated for contract (${contrato.isPaid ? 'Paid' : 'Pending'}):`, contrato.codigoSubasta, contractTIR);
          }
        } catch (e) {
          console.warn(`Error calculating TIR for contract (${contrato.isPaid ? 'Paid' : 'Pending'}):`, contrato.codigoSubasta, e);
        }
      } else {
         console.warn("Skipping TIR calculation for contract due to zero/negative principal:", contrato.codigoSubasta);
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
      gananciaUltimoMes: 0 // Inicializar en el acumulador
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
      gananciaUltimoMes: result.gananciaUltimoMes // Añadir al objeto devuelto
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
      console.warn("No valid cash flows found to calculate overall rentabilidad.");
      return 0;
    }
    const cashFlows = financeUtils.buildCashFlowData(validFactoring, this.additionalFlows);
    if (!cashFlows || cashFlows.length < 2) {
      console.warn("Insufficient data points for XIRR calculation.");
      return 0;
    }
    try {
      const rate = financeUtils.calcularTasaAnualizada(cashFlows);
      return isNaN(rate) || !isFinite(rate) ? 0 : rate;
    } catch (error) {
      console.error("Error during XIRR calculation with flows:", error);
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
}