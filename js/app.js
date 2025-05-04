let dataService = null;
let projectionChart = null;
let totalDepositosCalculado = 0;
let currentSearchTerm = ''; // Variable para almacenar el término de búsqueda actual

document.addEventListener("DOMContentLoaded", () => {
  dataService = new DataService();
  initializeApp();
  setupTabListeners();
  setupSearchListeners(); // Añadimos los listeners para la búsqueda
});

async function initializeApp() {
  try {
    const data = await loadDataWithTimeout();
    totalDepositosCalculado = data.totalDepositos || 0;
    updateUI(data);
    calculateAndLogRentabilidad();
    await createProjectionChartIfNeeded(data);
    updateFactoringCard([], data.factoringData, null);
    document.querySelectorAll('.tabs-container .tab').forEach(tab => tab.classList.remove('active'));
  } catch (error) {
    handleInitError(error);
  } finally {
    transitionFromLoadingState();
  }
}

async function loadDataWithTimeout() {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Tiempo de espera agotado. La carga de datos está demorando demasiado.")), 15000);
  });
  const dataPromise = dataService.loadAllData();
  return Promise.race([dataPromise, timeoutPromise]);
}

function updateUI(data) {
  updateDashboardSummary(data.factoringData);
  showFactoringWaitingState("Cargando contratos...");
  updateCapitalTotal(data.capitalTotal);
}

function showFactoringWaitingState(message = "Selecciona una categoría") {
  const detailsList = document.getElementById("factoring-details");
  if (detailsList) {
    detailsList.innerHTML = `
      <tr class="waiting-state-row">
        <td colspan="3">
          <div class="empty-state waiting-message">
            <p class="primary-text">${message}</p>
            <p class="secondary-text">Haz clic en una de las pestañas superiores para ver los contratos</p>
          </div>
        </td>
      </tr>
    `;
  }
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  if (contractsCountElement) {
    contractsCountElement.textContent = "Selecciona pestaña";
  }
}

function updateCapitalTotal(capitalTotal) {
  const capitalElement = document.getElementById("capital-total");
  if (capitalElement) {
    capitalElement.textContent = formatUtils.currency(capitalTotal || 0);
  }
}

function calculateAndLogRentabilidad() {
  try {
    const rentabilidad = dataService.calcularRentabilidadConFlujos();
    if (!isNaN(rentabilidad) && isFinite(rentabilidad)) {
      console.log("Rentabilidad (XIRR) considerando flujos adicionales:", formatUtils.percentage(rentabilidad));
    } else {
      console.warn("Rentabilidad calculada no es válida:", rentabilidad);
    }
  } catch (e) {
    console.warn("No se pudo calcular la rentabilidad:", e);
  }
}

async function createProjectionChartIfNeeded(data) {
  const canvas = document.getElementById('proyeccion-chart');
  if (canvas) {
    await LazyLoader.loadChartJS();
    const montoGanado = data?.factoringData?.montoGanado || 0;
    const capitalInicialProyeccion = totalDepositosCalculado + montoGanado;
    const tasa = data?.factoringData?.tasa || 0;
    const capitalParaGrafico = capitalInicialProyeccion > 0 ? capitalInicialProyeccion : 10000;
    const projectionData = prepareProjectionData(capitalParaGrafico, tasa);
    projectionChart = createProjectionChart(canvas, projectionData);
  }
}

function handleInitError(error) {
  console.error("Error al cargar los datos:", error);
  showErrorState(`Error al cargar los datos: ${error.message}. Intente recargar.`);
  updateDashboardSummary(null);
  updateFactoringCard([], null, 'pending');
}

function transitionFromLoadingState() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('is-loading');
      setTimeout(() => {
        if (typeof LazyLoader !== 'undefined' && LazyLoader.loadDeferredResources) {
          LazyLoader.loadDeferredResources();
        }
      }, 300);
    });
  });
}

function setTextContent(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

async function updateDashboardSummary(factoringData) {
  const dataService = new DataService();
  // res ahora contiene totalInvertidoPEN/USD (depósitos) y totalGanadoPEN/USD (ganancias)
  const [res, tasaAnualizada] = await Promise.all([
    dataService.calcularInteresManual(),
    (async () => {
      await dataService.loadAllData();
      return dataService.calcularRentabilidadConFlujos();
    })()
  ]);

  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");
  const tasaPromedioElement = document.getElementById("tasa-promedio");
  const tasaTrendElement = document.getElementById("tasa-trend");
  if (metaTiempoElement && metaDescripcionElement && tasaPromedioElement && tasaTrendElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity, fechaEstimada: null };
    // Usar el capital total depositado equivalente para el cálculo de la meta
    const capitalInicialMeta = typeof res.totalInvertidoPENeq === 'number' && !isNaN(res.totalInvertidoPENeq) && res.totalInvertidoPENeq > 0 ? res.totalInvertidoPENeq : 0;
    const tasaValidaParaCalculo = typeof tasaAnualizada === 'number' && !isNaN(tasaAnualizada) ? tasaAnualizada : 0;
    
    // Usar CONFIG directamente para APORTE_MENSUAL
    if (CONFIG.METAS.APORTE_MENSUAL > 0 || tasaValidaParaCalculo > 0) {
      tiempoHastaMeta = financeUtils.calcularTiempoHastaMeta(capitalInicialMeta, tasaValidaParaCalculo);
    }
    if (!isFinite(tiempoHastaMeta.años)) {
      metaTiempoElement.textContent = "Meta Inalcanzable";
      metaDescripcionElement.innerHTML = `Tasa o aportes insuficientes`;
      metaDescripcionElement.className = "summary-trend negative";
    } else {
      let tiempoTexto = "";
      const fechaEstimadaValida = tiempoHastaMeta.fechaEstimada instanceof Date && !isNaN(tiempoHastaMeta.fechaEstimada);
      if (tiempoHastaMeta.años <= 0 && tiempoHastaMeta.meses <= 0) {
        tiempoTexto = "Meta Alcanzada";
        metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Logrado ~' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : 'Ya alcanzada'}`;
        metaDescripcionElement.className = "summary-trend positive";
      } else {
        tiempoTexto = `${tiempoHastaMeta.años} años, ${tiempoHastaMeta.meses} meses`;
        metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Est. ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`;
        metaDescripcionElement.className = "summary-trend positive";
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
    tasaPromedioElement.textContent = formatUtils.percentage(tasaAnualizada);
    let trendClassTasa = 'neutral';
    if (tasaAnualizada > 0.1) trendClassTasa = 'positive';
    else if (tasaAnualizada < -0.1) trendClassTasa = 'negative';
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.innerHTML = `Anualizada`;
  }

  const totalSolesElement = document.getElementById("total-soles");
  const gananciaSolesElement = document.getElementById("ganancia-soles");
  if (totalSolesElement && gananciaSolesElement) {
    // Mostrar Depósitos + Ganancias como total
    totalSolesElement.textContent = formatUtils.currency(res.totalInvertidoPEN + res.totalGanadoPEN, 'PEN');
    // Mostrar solo Ganancias
    gananciaSolesElement.textContent = `Ganancia: ${formatUtils.currency(res.totalGanadoPEN, 'PEN')}`;
  }

  const totalDolaresElement = document.getElementById("total-dolares");
  const gananciaDolaresElement = document.getElementById("ganancia-dolares");
  if (totalDolaresElement && gananciaDolaresElement) {
    // Mostrar Depósitos + Ganancias como total
    totalDolaresElement.textContent = formatUtils.currency(res.totalInvertidoUSD + res.totalGanadoUSD, 'USD');
    // Mostrar solo Ganancias
    gananciaDolaresElement.textContent = `Ganancia: ${formatUtils.currency(res.totalGanadoUSD, 'USD')}`;
  }
}

function updateFactoringCard(contracts, factoringData, tabType = null) {
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  const detailsList = document.getElementById("factoring-details");
  const data = factoringData || { contratos: 0, contratosPendientes: 0, contratosPagados: 0, totalGananciaPotencialPENeq: 0 }; // Incluir valor por defecto

  if (!detailsList) {
    console.error("Element with ID 'factoring-details' not found.");
    return;
  }
  detailsList.innerHTML = ""; // Limpiar siempre al inicio

  if (tabType === null) {
    showFactoringWaitingState("Selecciona una categoría");
    return;
  }

  // Manejar la pestaña de Ganancias Potenciales
  if (tabType === 'potential-earnings') {
    if (contractsCountElement) {
      contractsCountElement.textContent = `Total: ${data.contratos || 0}`;
    }
    
    // Calcular porcentaje y otros valores
    const porcentajeGanancia = data.totalInvertido > 0 ?
      (data.totalGananciaPotencialPENeq / data.totalInvertido) * 100 : 0;
    
    const esPositivo = porcentajeGanancia >= 0;
    const colorClase = esPositivo ? 'text-positive' : 'text-negative';
    
    // Mostrar la información en formato de tabla usando las mismas clases que las otras pestañas
    detailsList.innerHTML = `
      <tr class="year-header-row">
        <td colspan="3" class="year-header-cell">
          Resumen de Ganancias Totales
        </td>
      </tr>
      <tr class="even-row">
        <td colspan="3" class="text-center">
          <div class="earnings-amount ${colorClase}">${formatUtils.currency(data.totalGananciaPotencialPENeq || 0)}</div>
          <div class="earnings-percentage">${formatUtils.percentage(porcentajeGanancia)} del capital invertido</div>
        </td>
      </tr>
      <tr class="year-header-row">
        <td>Categoría</td>
        <td>Cantidad</td>
        <td>Valor</td>
      </tr>
      <tr class="even-row">
        <td>Contratos Pendientes</td>
        <td class="text-center">${data.contratosPendientes || 0}</td>
        <td class="text-right ${colorClase}">${formatUtils.currency(data.contratosPendientes * (data.totalGananciaPotencialPENeq / data.contratos) || 0)}</td>
      </tr>
      <tr class="alt-row">
        <td>Contratos Pagados</td>
        <td class="text-center">${data.contratosPagados || 0}</td>
        <td class="text-right ${colorClase}">${formatUtils.currency(data.contratosPagados * (data.totalGananciaPotencialPENeq / data.contratos) || 0)}</td>
      </tr>
      <tr class="year-header-row">
        <td colspan="3" class="text-center description-text">
          Esta cifra representa la suma total de ganancias de todos los contratos (pagados y pendientes).
        </td>
      </tr>
    `;
    // Asegurar que no se procese la lista de contratos para esta pestaña
    return;
  }

  // Lógica existente para otras pestañas (all, pending, paid)
  let validContracts = Array.isArray(contracts) ? contracts : [];

  // Filtrar por término de búsqueda si existe (solo para pestañas que muestran lista)
  if (currentSearchTerm) {
    validContracts = validContracts.filter(contrato => {
      // ... (lógica de filtrado existente) ...
       if (!contrato) return false;

      // Buscar en los campos más relevantes
      const clienteName = (contrato.nombre || '').toLowerCase();
      const codigo = (contrato.codigoSubasta || '').toLowerCase();
      const fechaPago = (contrato.fechaPagoReal || contrato.fechaPagoEstimado || '').toLowerCase();
      const montoInv = (contrato.monto?.toString() || '').toLowerCase();
      const montoGan = (contrato.montoPagoNeto?.toString() || '').toLowerCase();


      return clienteName.includes(currentSearchTerm) ||
             codigo.includes(currentSearchTerm) ||
             fechaPago.includes(currentSearchTerm) ||
             montoInv.includes(currentSearchTerm) ||
             montoGan.includes(currentSearchTerm);
    });
  }

  if (contractsCountElement) {
    let countText = `Total: ${data.contratos || 0}`;
    if (tabType === 'pending') countText = `Por cobrar: ${data.contratosPendientes || 0}`;
    else if (tabType === 'paid') countText = `Pagados: ${data.contratosPagados || 0}`;
    // Añadir información sobre los resultados de búsqueda si hay un filtro activo
    if (currentSearchTerm) {
      countText += ` (${validContracts.length} resultado${validContracts.length !== 1 ? 's' : ''})`;
    }
    contractsCountElement.textContent = countText;
  }

  // --- Renderizado de la lista de contratos (para all, pending, paid) ---
  let currentYear = null;
  if (validContracts.length > 0) {
    // Ordenar contratos por fecha de pago (más reciente primero)
    validContracts.sort((a, b) => {
        const dateA = dateUtils.parse(a.isPaid && a.fechaPagoReal ? a.fechaPagoReal : a.fechaPagoEstimado);
        const dateB = dateUtils.parse(b.isPaid && b.fechaPagoReal ? b.fechaPagoReal : b.fechaPagoEstimado);
        // Manejar fechas inválidas o nulas poniéndolas al final
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA; // Descendente
    });

    validContracts.forEach((contrato, index) => {
      // ... (validación de contrato existente) ...
       if (!contrato || typeof contrato.monto === 'undefined' || typeof contrato.montoPagoNeto === 'undefined') {
        console.warn("Skipping rendering of invalid contract:", contrato);
        return;
      }
      const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
      const fechaPagoDate = fechaPagoStr ? dateUtils.parse(fechaPagoStr) : null;
      const contractYear = fechaPagoDate ? fechaPagoDate.getFullYear() : null;

      // Agrupar por año si aplica
      if (contractYear !== null && contractYear !== currentYear && (tabType === 'all' || tabType === 'paid')) { // Mostrar año solo en 'all' y 'paid'
        currentYear = contractYear;
        const yearRow = document.createElement("tr");
        yearRow.classList.add('year-header-row');
        const yearCell = document.createElement("td");
        yearCell.colSpan = 3;
        yearCell.classList.add('year-header-cell');
        yearCell.textContent = `Año ${currentYear}`;
        yearRow.appendChild(yearCell);
        detailsList.appendChild(yearRow);
      }

      const fechaPagoDisplay = fechaPagoStr ? formatUtils.dateShort(fechaPagoStr) : 'Fecha Desc.';
      const row = document.createElement("tr");
      // ... (asignación de clases y data-contract-id existente) ...
      row.classList.add(index % 2 === 0 ? 'even-row' : 'alt-row');
      // Aplicar clase específica de pestaña si es necesario (ej. resaltar pendientes)
      if (tabType === 'pending') row.classList.add('pending-contract-tab');
      else if (tabType === 'paid') row.classList.add('paid-contract-tab');

      row.classList.add(contrato.isPaid ? 'paid-contract' : 'pending-contract');
      row.dataset.contractId = contrato.codigoSubasta || 'N/A';


      const clientCell = document.createElement("td");
      // ... (creación de clientCell existente) ...
      clientCell.classList.add('client-cell');
      const clientInfoDiv = document.createElement('div');
      clientInfoDiv.classList.add('client-info');
      const clientName = contrato.nombre || "Cliente Desconocido";
      const nameSpan = document.createElement("span");
      nameSpan.className = "client-name";
      nameSpan.textContent = clientName;
      clientInfoDiv.appendChild(nameSpan);
      const investedDiv = document.createElement("div");
      investedDiv.className = "invested-amount";
      investedDiv.textContent = formatUtils.currency(contrato.monto, contrato.moneda);
      clientInfoDiv.appendChild(investedDiv);
      clientCell.appendChild(clientInfoDiv);


      const dateCell = document.createElement("td");
      // ... (creación de dateCell existente) ...
      dateCell.classList.add('date-cell');
      const dateSpan = document.createElement("span");
      dateSpan.className = "detail-date";
      dateSpan.textContent = fechaPagoDisplay;
      dateCell.appendChild(dateSpan);


      const gainCell = document.createElement("td");
      // ... (creación de gainCell existente) ...
      gainCell.classList.add('gain-cell');
      const gainSpan = document.createElement("span");
      gainSpan.className = `detail-gain ${contrato.montoPagoNeto >= 0 ? 'text-positive' : 'text-negative'}`;
      gainSpan.textContent = formatUtils.currency(contrato.montoPagoNeto, contrato.moneda);
      gainCell.appendChild(gainSpan);


      row.appendChild(clientCell);
      row.appendChild(dateCell);
      row.appendChild(gainCell);
      detailsList.appendChild(row);

      row.style.cursor = "pointer";
      row.onclick = () => showContractDetailsPopup(contrato);
    });
  } else { // Mensaje de estado vacío para pestañas de lista
    let emptyMessage = "No hay contratos disponibles.";
    if (currentSearchTerm) emptyMessage = "No se encontraron contratos que coincidan con la búsqueda.";
    else if (tabType === 'pending') emptyMessage = "No hay contratos pendientes por cobrar.";
    else if (tabType === 'paid') emptyMessage = "No se encontraron contratos pagados.";
    else if (tabType === 'all') emptyMessage = "No se encontraron contratos.";

    detailsList.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="3">
          <div class="empty-state">
            <p>${emptyMessage}</p>
          </div>
        </td>
      </tr>
    `;
  }
  // ... (scroll reset existente) ...
   const tableContainer = detailsList.closest('.card-details');
  if (tableContainer) {
    tableContainer.scrollTop = 0;
    tableContainer.scrollLeft = 0;
  }
}

function showErrorState(message) {
  const detailsList = document.getElementById("factoring-details");
  if (detailsList) {
    detailsList.innerHTML = `
      <tr class="error-state-row">
        <td colspan="3">
          <div class="error-state">
            <p>${message}</p>
          </div>
        </td>
      </tr>
    `;
  }
  let errorBanner = document.getElementById("global-error-banner");
  if (!errorBanner) {
    errorBanner = document.createElement('div');
    errorBanner.id = 'global-error-banner';
    errorBanner.style.backgroundColor = 'var(--color-negative)';
    errorBanner.style.color = 'white';
    errorBanner.style.padding = '10px';
    errorBanner.style.textAlign = 'center';
    errorBanner.style.position = 'fixed';
    errorBanner.style.top = '0';
    errorBanner.style.left = '0';
    errorBanner.style.width = '100%';
    errorBanner.style.zIndex = '1000';
    errorBanner.style.fontSize = 'var(--font-size-sm)';
    document.body.insertBefore(errorBanner, document.body.firstChild);
  }
  errorBanner.innerHTML = `${message}`;
  errorBanner.style.display = 'block';
}

function setupTabListeners() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabType = tab.getAttribute('data-tab');
      
      // Remover clase 'active' de todas las pestañas
      tabs.forEach(t => t.classList.remove('active'));
      
      // Añadir clase 'active' a la pestaña seleccionada
      tab.classList.add('active');
      
      // Cargar los datos según la pestaña seleccionada
      loadFactoringData(tabType);
    });
  });

  // Activar la primera pestaña por defecto (Pendientes)
  const defaultTab = document.querySelector('.tab[data-tab="pending"]');
  if (defaultTab) {
    defaultTab.click();
  }
}

function loadFactoringData(tabType) {
  if (!dataService || !tabType) return;
  
  const contracts = dataService.changeTab(tabType);
  const factoringData = dataService.buildFactoringData();
  
  updateFactoringCard(contracts, factoringData, tabType);
}

function setupSearchListeners() {
  const searchInput = document.getElementById('search-contracts');
  const clearButton = document.getElementById('clear-search');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      if (dataService && dataService.currentTab) {
        const contracts = dataService.changeTab(dataService.currentTab);
        updateFactoringCard(contracts, dataService.buildFactoringData(), dataService.currentTab);
      }
    });
  }
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        currentSearchTerm = '';
        if (dataService && dataService.currentTab) {
          const contracts = dataService.changeTab(dataService.currentTab);
          updateFactoringCard(contracts, dataService.buildFactoringData(), dataService.currentTab);
        }
      }
    });
  }
}

function showContractDetailsPopup(contract) {
  let existing = document.getElementById('contract-details-popup');
  if (existing) existing.remove();

  let originalData = null;
  if (window.dataService && window.dataService.factoring) {
    originalData = window.dataService.factoring.find(c =>
      c.codigoSubasta === contract.codigoSubasta
    );
  }

  let fechaPagoReal = null;
  if (window.dataService && window.dataService.ganancias) {
    const ganancias = Array.isArray(window.dataService.ganancias) ? window.dataService.ganancias : [];
    const gananciaContrato = ganancias.find(g =>
      g["Código de subasta"] === contract.codigoSubasta
    );
    if (gananciaContrato && gananciaContrato.Fecha) {
      fechaPagoReal = gananciaContrato.Fecha;
    }
  }

  const fieldLabels = {
    nombre: "Cliente",
    Cliente: "Cliente",
    RUC: "RUC",
    codigoSubasta: "Código de subasta",
    "Codigo de subasta": "Código de subasta",
    "Código de subasta": "Código de subasta",
    Riesgo: "Riesgo",
    monto: "Monto invertido",
    Inversion: "Monto invertido",
    moneda: "Moneda",
    "Moneda": "Moneda",
    "Retorno mensual (%)": "Retorno mensual (%)",
    retornoMensual: "Retorno mensual (%)",
    fechaIngreso: "Fecha de inversión",
    "Fecha": "Fecha de inversión",
    fechaPagoEstimado: "Fecha de pago estimada",
    fechaPagoReal: "Fecha de pago real",
    "Fecha de pago": "Fecha de pago",
    "Fecha de cierre de subasta": "Fecha de cierre de subasta",
    Estado: "Estado",
    montoPagoNeto: "Ganancia estimada",
    Hora: "Hora"
  };

  const fieldCategories = {
    important: ["nombre", "Cliente", "monto", "Inversion", "montoPagoNeto"],
    dates: ["fechaIngreso", "Fecha", "fechaPagoEstimado", "fechaPagoReal", "Fecha de pago", "Fecha de cierre de subasta"],
    status: ["Estado", "Riesgo"],
    financial: ["Retorno mensual (%)", "retornoMensual"]
  };

  const merged = {};
  if (originalData && originalData.originalRow) {
    Object.assign(merged, originalData.originalRow);
  }
  Object.assign(merged, contract);

  const isPaid = merged.isPaid === true;
  let isLate = false;
  if (!isPaid) {
    let fechaPagoEstimada = merged.fechaPagoReal || merged.fechaPagoEstimado || merged["Fecha de pago"];
    if (!fechaPagoEstimada && merged["Fecha de pago"]) fechaPagoEstimada = merged["Fecha de pago"];
    let fechaPago = fechaPagoEstimada ? new Date(fechaPagoEstimada) : null;
    if (fechaPago && !isNaN(fechaPago.getTime())) {
      const hoy = new Date();
      if (fechaPago < hoy) isLate = true;
    }
  }

  const groups = {
    important: [],
    dates: [],
    financial: [],
    status: [],
    other: []
  };

  const shownKeys = new Set();

  const extraIndentKeys = [
    "nombre", "Cliente", "monto", "Inversion", "montoPagoNeto",
    "fechaIngreso", "Fecha", "fechaPagoEstimado", "fechaPagoReal"
  ];

  for (const [key, value] of Object.entries(merged)) {
    if (
      key === 'isPaid' ||
      key === 'isPending' ||
      key === 'codigoSubasta' ||
      key === 'Codigo de subasta' ||
      key === 'Código de subasta' ||
      key === 'Estado' ||
      key === 'moneda' ||
      key === 'Moneda'
    ) continue;
    if (shownKeys.has(key)) continue;
    shownKeys.add(key);

    if (typeof value === "object" && value !== null) continue;

    let displayValue = value;
    let categoryClass = 'other-field';
    let groupKey = 'other';

    for (const [category, keys] of Object.entries(fieldCategories)) {
      if (keys.includes(key)) {
        categoryClass = `${category}-field`;
        groupKey = category;
        break;
      }
    }

    if (typeof value === 'number' && key.match(/monto|inversion|ganancia|pago/i)) {
      let sufijoMoneda = '';
      const moneda = (merged.moneda || merged.Moneda || '').toUpperCase();
      if (moneda === 'USD' || moneda === 'DOLARES' || moneda === 'DÓLARES') sufijoMoneda = ' - USD';
      else if (moneda === 'PEN' || moneda === 'SOLES' || moneda === 'SOL') sufijoMoneda = ' - Soles';
      displayValue = formatUtils.currency(value, moneda) + sufijoMoneda;
      categoryClass = 'financial-field';
      groupKey = 'financial';
    }

    if (key.toLowerCase().includes('fecha') && value) {
      displayValue = formatUtils.dateShort(value);
      categoryClass = 'date-field';
      groupKey = 'dates';
    }

    if (typeof value === "boolean") {
      const statusClass = value ? "status-positive" : "status-negative";
      displayValue = `<span class="status-value ${statusClass}">                        
                        ${value ? "Sí" : "No"}
                      </span>`;
      if (groupKey === 'other') categoryClass = 'status-field';
    }

    const label = fieldLabels[key] || key;

    const needsExtraIndent = extraIndentKeys.includes(key);

    groups[groupKey].push(`
      <tr class="${categoryClass}">
        <td class="popup-key">${label}</td>
        <td class="popup-value"${needsExtraIndent ? ' style="padding-left: 2.5em;"' : ''}>${displayValue ?? '-'}</td>
      </tr>
    `);
  }

  function buildDetailRows(groups) {
    const order = ['important', 'financial', 'dates', 'status', 'other'];
    const rows = [];
    for (let i = 0; i < order.length; i++) {
      const groupRows = groups[order[i]];
      if (groupRows.length > 0) {
        rows.push(...groupRows);
        let nextHasRows = false;
        for (let j = i + 1; j < order.length; j++) {
          if (groups[order[j]].length > 0) {
            nextHasRows = true;
            break;
          }
        }
        if (nextHasRows) {
          rows.push('<tr class="group-separator"><td colspan="2"></td></tr>');
        }
      }
    }
    return rows;
  }

  const detailRows = buildDetailRows(groups);

  const clientName = merged.nombre || merged.Cliente || "Detalle de Contrato";
  const contractCode = merged.codigoSubasta || merged["Codigo de subasta"] || "";

  let estadoTexto = "";
  let estadoColor = "";
  let estadoIcon = "";
  if (isPaid) {
    estadoTexto = "Pagado";
    estadoColor = "#1ecb7a";
    estadoIcon = "icon-check-circle";
  } else if (isLate) {
    estadoTexto = "Atrasado";
    estadoColor = "#e74c3c";
    estadoIcon = "icon-warning";
  } else {
    estadoTexto = "Pendiente";
    estadoColor = "#ecc94b";
    estadoIcon = "icon-time";
  }

  let fechaPagoRealHtml = "";
  if (fechaPagoReal) {
    fechaPagoRealHtml = `
      <div style="margin-top: 4px; font-size: 0.95em; color: var(--color-text-secondary);">        
        Pago real: <b>${formatUtils.dateShort(fechaPagoReal)}</b>
      </div>
    `;
  }

  const popup = document.createElement('div');
  popup.id = 'contract-details-popup';
  popup.className = 'popup-overlay';

  popup.innerHTML = `
    <div class="popup-modal">
      <div class="popup-header"
           style="padding: 8px; border-bottom: 1px solid var(--color-border); background-color: var(--color-bg-card); 
                  border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 1;">
        <button class="popup-close" id="close-contract-popup" title="Cerrar" 
                style="position: absolute; right: 12px; top: 12px; background: none; border: none; font-size: 24px; 
                       cursor: pointer; color: var(--color-text-secondary); width: 30px; height: 30px; 
                       display: flex; align-items: center; justify-content: center; border-radius: 50%;">&times;</button>
        <div>
          <h3 style="margin: 0 0 4px 0; color: var(--color-text-primary);">${clientName}</h3>
          <div style="display: flex; align-items: center; gap: 8px;">            
            <span style="color: ${estadoColor}; font-weight: 600; font-size: 1em;">${estadoTexto}</span>
            <span style="color: var(--color-text-tertiary); font-size: 0.95em; margin-left: 8px;">
              ${contractCode ? `Código: <b>${contractCode}</b>` : ""}
            </span>
          </div>
          ${fechaPagoRealHtml}
        </div>
      </div>
      <div style="padding: 8px;">
        <table class="popup-details-table" style="width: 100%; border-collapse: separate; border-spacing: 0 0px;">
          <tbody>
            ${detailRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  document.getElementById('close-contract-popup').onclick = () => {
    popup.classList.add('hidden'); // Asumiendo que tienes una clase .hidden { display: none; }
    setTimeout(() => remove(popup), 150); // Usar remove helper
  };

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.classList.add('hidden');
      setTimeout(() => remove(popup), 150); // Usar remove helper
    }
  };
}

// Añadir esta función helper para manejar la eliminación de elementos DOM
function remove(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}