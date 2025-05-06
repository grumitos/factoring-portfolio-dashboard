let dataService = null;
let projectionChart = null;
let totalDepositosCalculado = 0;
let currentSearchTerm = '';
let currentFactoringData = null;

document.addEventListener("DOMContentLoaded", () => {
  dataService = new DataService();
  initializeApp();
  setupTabListeners();
  setupSearchListeners();
});

async function initializeApp() {
  try {
    const data = await loadDataWithTimeout();
    totalDepositosCalculado = data.totalDepositos || 0;
    currentFactoringData = data.factoringData;
    updateUI(data);
    calculateAndLogRentabilidad();
    await createProjectionChartIfNeeded(data);
    updateFactoringCard([], currentFactoringData, null);
    document.querySelectorAll('.tabs-container .tab').forEach(tab => tab.classList.remove('active'));
    showFactoringWaitingState("Selecciona una categoría");
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
  updateDashboardSummary(data.factoringData || currentFactoringData);
  updateCapitalTotal(data.capitalTotal);
}

function showFactoringWaitingState(primaryMessage = "Selecciona una categoría", secondaryMessage = "Haz clic en una de las pestañas superiores para ver los contratos") {
  const detailsList = document.getElementById("factoring-details");
  if (detailsList) {
    detailsList.innerHTML = `
      <tr class="waiting-state-row">
        <td colspan="3">
          <div class="empty-state waiting-message">
            <span class="svg-icon">
              <svg><use xlink:href="#icon-touch"></use></svg>
            </span>
            <p class="primary-text">${primaryMessage}</p>
            ${secondaryMessage ? `<p class="secondary-text">${secondaryMessage}</p>` : ''}
          </div>
        </td>
      </tr>
    `;
  }
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  if (contractsCountElement) {
    contractsCountElement.textContent = "N/A";
  }
  const tableHeaders = document.querySelector('.details-table thead');
  if (tableHeaders) {
    tableHeaders.style.display = 'none';
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

/**
 * Actualiza los elementos de resumen: total y ganancia.
 * @param {string} prefix - prefijo del id: "total-soles", "ganancia-soles", etc.
 * @param {number} total 
 * @param {number} gain 
 * @param {'PEN'|'USD'} currency 
 */
function updateSummarySection(prefix, total, gain, currency) {
  const totalEl = document.getElementById(prefix);
  if (totalEl) {
    // si es ganancia, prefix vendrá con "ganancia-..."
    const text = prefix.startsWith('ganancia-')
      ? `Ganancia: ${formatUtils.currency(gain, currency)}`
      : formatUtils.currency(total, currency);
    totalEl.textContent = text;
  }
}

async function updateDashboardSummary(factoringData) {
  if (!factoringData) {
    updateSummarySection('total-soles',   0, 0, 'PEN');
    updateSummarySection('ganancia-soles',0, 0, 'PEN');
    updateSummarySection('total-dolares', 0, 0, 'USD');
    updateSummarySection('ganancia-dolares',0,0, 'USD');
    setTextContent("tasa-promedio", formatUtils.percentage(0));
    setTextContent("tasa-trend", "N/A");
    setTextContent("meta-tiempo", "N/A");
    setTextContent("meta-descripcion", "");
    return;
  }

  let res = { totalInvertidoPEN: 0, totalGanadoPEN: 0, totalInvertidoUSD: 0, totalGanadoUSD: 0, totalInvertidoPENeq: 0 };
  let tasaAnualizada = factoringData.tasaEsperada || 0;

  try {
    res = await dataService.calcularInteresManual();
    tasaAnualizada = dataService.calcularRentabilidadConFlujos();
  } catch (e) {
    console.warn("Error calculando resumen del dashboard:", e);
    tasaAnualizada = factoringData.tasaEsperada || 0;
    res.totalInvertidoPENeq = factoringData.totalInvertido || 0;
  }

  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");
  const tasaPromedioElement = document.getElementById("tasa-promedio");
  const tasaTrendElement = document.getElementById("tasa-trend");

  if (metaTiempoElement && metaDescripcionElement && tasaPromedioElement && tasaTrendElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity, fechaEstimada: null };
    const capitalInicialMeta = typeof res.totalInvertidoPENeq === 'number' && !isNaN(res.totalInvertidoPENeq) && res.totalInvertidoPENeq > 0 ? res.totalInvertidoPENeq : 0;
    const tasaValidaParaCalculo = typeof tasaAnualizada === 'number' && !isNaN(tasaAnualizada) ? tasaAnualizada : 0;

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
        tiempoTexto = `${tiempoHastaMeta.años} año${tiempoHastaMeta.años !== 1 ? 's' : ''}, ${tiempoHastaMeta.meses} mes${tiempoHastaMeta.meses !== 1 ? 'es' : ''}`;
        metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Est. ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`;
        metaDescripcionElement.className = "summary-trend positive";
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
    tasaPromedioElement.textContent = formatUtils.percentage(tasaAnualizada);
    let trendClassTasa = 'neutral';
    if (tasaAnualizada > 15) trendClassTasa = 'positive';
    else if (tasaAnualizada < 5) trendClassTasa = 'negative';
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.innerHTML = `Anualizada (XIRR)`;
  }

  updateSummarySection('total-soles',   res.totalInvertidoPEN + res.totalGanadoPEN, res.totalGanadoPEN, 'PEN');
  updateSummarySection('ganancia-soles',0, 0, 'PEN'); // si ya lo cubrió total-soles
  updateSummarySection('total-dolares', res.totalInvertidoUSD + res.totalGanadoUSD, res.totalGanadoUSD, 'USD');
  updateSummarySection('ganancia-dolares',0, 0, 'USD');
}

function _createYearHeaderRow(year) {
  const yearRow = document.createElement("tr");
  yearRow.classList.add('year-header-row');
  const yearCell = document.createElement("td");
  yearCell.colSpan = 3;
  yearCell.classList.add('year-header-cell');
  yearCell.textContent = `Año ${year}`;
  yearRow.appendChild(yearCell);
  return yearRow;
}

function _createContractRow(contrato, index, tabType) {
  const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
  const fechaPagoDisplay = fechaPagoStr ? formatUtils.dateShort(fechaPagoStr) : 'Fecha Desc.';

  const row = document.createElement("tr");
  row.classList.add(index % 2 === 0 ? 'even-row' : 'alt-row');
  if (tabType === 'pending') row.classList.add('pending-contract-tab');
  else if (tabType === 'paid') row.classList.add('paid-contract-tab');
  row.classList.add(contrato.isPaid ? 'paid-contract' : 'pending-contract');
  row.dataset.contractId = contrato.codigoSubasta || 'N/A';

  const clientCell = document.createElement("td");
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
  dateCell.classList.add('date-cell');
  const dateSpan = document.createElement("span");
  dateSpan.className = "detail-date";
  dateSpan.textContent = fechaPagoDisplay;
  dateCell.appendChild(dateSpan);

  const gainCell = document.createElement("td");
  gainCell.classList.add('gain-cell');
  const gainSpan = document.createElement("span");
  const ganancia = contrato.montoPagoNeto || 0;
  gainSpan.className = `detail-gain ${ganancia >= 0 ? 'text-positive' : 'text-negative'}`;
  gainSpan.textContent = formatUtils.currency(ganancia, contrato.moneda);
  gainCell.appendChild(gainSpan);

  row.appendChild(clientCell);
  row.appendChild(dateCell);
  row.appendChild(gainCell);

  row.style.cursor = "pointer";
  row.onclick = () => showContractDetailsPopup(contrato);

  return row;
}

function _renderEmptyState(detailsList, tabType, searchTerm) {
  let emptyMessage = "No hay contratos disponibles.";
  if (searchTerm) {
    emptyMessage = "No se encontraron contratos que coincidan con la búsqueda.";
  } else if (tabType === 'pending') {
    emptyMessage = "No hay contratos pendientes por cobrar.";
  } else if (tabType === 'paid') {
    emptyMessage = "No se encontraron contratos pagados.";
  } else if (tabType === 'all') {
    emptyMessage = "No se encontraron contratos.";
  }

  detailsList.innerHTML = `
    <tr class="empty-state-row">
      <td colspan="3">
        <div class="empty-state">
          <span class="svg-icon">
            <svg><use xlink:href="#icon-empty-box"></use></svg>
          </span>
          <p class="primary-text">${emptyMessage}</p>
        </div>
      </td>
    </tr>
  `;
  const tableHeaders = document.querySelector('.details-table thead');
  if (tableHeaders) {
    tableHeaders.style.display = 'none';
  }
}

function _filterContractsBySearchTerm(contracts, term) {
  if (!term) return contracts;
  const lowerCaseTerm = term.toLowerCase();
  return contracts.filter(contrato => {
    if (!contrato) return false;
    const clienteName = (contrato.nombre || '').toLowerCase();
    const codigo = (contrato.codigoSubasta || '').toLowerCase();
    const fechaPago = (contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado || '').toLowerCase();
    const montoInv = (contrato.monto?.toString() || '').toLowerCase();
    const montoGan = (contrato.montoPagoNeto?.toString() || '').toLowerCase();

    return clienteName.includes(lowerCaseTerm) ||
           codigo.includes(lowerCaseTerm) ||
           fechaPago.includes(lowerCaseTerm) ||
           montoInv.includes(lowerCaseTerm) ||
           montoGan.includes(lowerCaseTerm);
  });
}

function updateFactoringCard(contracts, factoringData, tabType = null) {
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  const detailsList = document.getElementById("factoring-details");
  const data = factoringData || currentFactoringData || { contratos: 0, contratosPendientes: 0, contratosPagados: 0, totalGananciaPotencialPENeq: 0 };

  if (!detailsList) {
    console.error("Element with ID 'factoring-details' not found.");
    return;
  }
  detailsList.innerHTML = "";

  const tableHeaders = document.querySelector('.details-table thead');
  if (tableHeaders) {
    tableHeaders.style.display = (tabType === 'potential-earnings' || tabType === null) ? 'none' : '';
  }

  if (tabType === null) {
    showFactoringWaitingState("Selecciona una categoría");
    return;
  }

  if (tabType === 'potential-earnings') {
    if (contractsCountElement) {
      contractsCountElement.textContent = `Total Contratos: ${data.contratos || 0}`;
    }

    const porcentajeGanancia = data.totalInvertido > 0 ?
      (data.totalGananciaPotencialPENeq / data.totalInvertido) * 100 : 0;
    const esPositivo = data.totalGananciaPotencialPENeq >= 0;
    const colorClase = esPositivo ? 'text-positive' : 'text-negative';

    const avgGainPending = data.contratosPendientes > 0 ? (data.totalGananciaPotencialPENeq * (data.contratosPendientes / data.contratos)) / data.contratosPendientes : 0;
    const avgGainPaid = data.contratosPagados > 0 ? (data.totalGananciaPotencialPENeq * (data.contratosPagados / data.contratos)) / data.contratosPagados : 0;

    detailsList.innerHTML = `
      <tr class="year-header-row">
      </tr>
      <tr class="even-row">
        <td colspan="3" class="text-center">
          <div class="earnings-amount ${colorClase}">${formatUtils.currency(data.totalGananciaPotencialPENeq || 0)}</div>
          <div class="earnings-percentage">${formatUtils.percentage(porcentajeGanancia)} del capital invertido</div>
        </td>
      </tr>
      <tr class="year-header-row">
        <td>Categoría</td>
        <td class="text-center">Cantidad</td>
        <td class="text-right">Ganancia Potencial Promedio</td>
      </tr>
      <tr class="even-row">
        <td>Contratos Pendientes</td>
        <td class="text-center">${data.contratosPendientes || 0}</td>
        <td class="text-right ${avgGainPending >= 0 ? 'text-positive' : 'text-negative'}">${formatUtils.currency(avgGainPending)}</td>
      </tr>
      <tr class="alt-row">
        <td>Contratos Pagados</td>
        <td class="text-center">${data.contratosPagados || 0}</td>
        <td class="text-right ${avgGainPaid >= 0 ? 'text-positive' : 'text-negative'}">${formatUtils.currency(avgGainPaid)}</td>
      </tr>
      <tr class="year-header-row description-row">
        <td colspan="3" class="text-center description-text">
          La ganancia potencial representa la suma de ganancias estimadas (pendientes) y reales (pagadas).
        </td>
      </tr>
    `;
    return;
  }

  let validContracts = Array.isArray(contracts) ? contracts.filter(c => c) : [];

  validContracts = _filterContractsBySearchTerm(validContracts, currentSearchTerm);

  if (contractsCountElement) {
    let countText = `Total: ${data.contratos || 0}`;
    if (tabType === 'pending') countText = `Por cobrar: ${data.contratosPendientes || 0}`;
    else if (tabType === 'paid') countText = `Pagados: ${data.contratosPagados || 0}`;
    else if (tabType === 'all') countText = `Todos: ${data.contratos || 0}`;

    if (currentSearchTerm) {
      countText += ` (${validContracts.length} resultado${validContracts.length !== 1 ? 's' : ''})`;
    }
    contractsCountElement.textContent = countText;
  }

  if (validContracts.length > 0) {
    validContracts.sort((a, b) => {
      const dateA = dateUtils.parse(a.isPaid && a.fechaPagoReal ? a.fechaPagoReal : a.fechaPagoEstimado);
      const dateB = dateUtils.parse(b.isPaid && b.fechaPagoReal ? b.fechaPagoReal : b.fechaPagoEstimado);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB - dateA;
    });

    let currentYear = null;
    validContracts.forEach((contrato, index) => {
      if (!contrato || typeof contrato.monto === 'undefined') {
        console.warn("Skipping rendering of invalid contract data:", contrato);
        return;
      }

      const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
      const fechaPagoDate = fechaPagoStr ? dateUtils.parse(fechaPagoStr) : null;
      const contractYear = fechaPagoDate ? fechaPagoDate.getFullYear() : null;

      if (contractYear !== null && contractYear !== currentYear && (tabType === 'all' || tabType === 'paid')) {
        currentYear = contractYear;
        detailsList.appendChild(_createYearHeaderRow(currentYear));
      }

      detailsList.appendChild(_createContractRow(contrato, index, tabType));
    });
  } else {
    _renderEmptyState(detailsList, tabType, currentSearchTerm);
  }

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
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      const tabType = this.getAttribute('data-tab');
      loadFactoringData(tabType);

      if (tabType !== 'potential-earnings') {
        const searchInput = document.getElementById('search-contracts');
        if (searchInput && searchInput.value) {
          searchInput.value = '';
          currentSearchTerm = '';
        }
      }
    });
  });

  const defaultTab = document.querySelector('.tab[data-tab="pending"]');
  if (defaultTab) {
    defaultTab.click();
  }
}

function loadFactoringData(tabType) {
  if (!dataService) return;

  const searchContainer = document.querySelector('.search-container');
  if (searchContainer) {
    searchContainer.style.display = tabType === 'potential-earnings' ? 'none' : 'flex';
    if (tabType === 'potential-earnings' && currentSearchTerm) {
      const searchInput = document.getElementById('search-input');
      const clearButton = document.getElementById('clear-search');
      if (searchInput) searchInput.value = '';
      if (clearButton) clearButton.style.display = 'none';
      currentSearchTerm = '';
    }
  }

  try {
    const contracts = dataService.changeTab(tabType);
    currentFactoringData = dataService.buildFactoringData();
    updateFactoringCard(contracts, currentFactoringData, tabType);
  } catch (error) {
    console.error("Error al cargar los datos de factoring para la pestaña:", error);
    showErrorState(`Error al cargar datos para ${tabType}.`);
  }
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
    popup.classList.add('hidden');
    setTimeout(() => remove(popup), 150);
  };

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.classList.add('hidden');
      setTimeout(() => remove(popup), 150);
    }
  };
}

function remove(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}