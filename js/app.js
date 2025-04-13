let dataService = null;
let projectionChart = null;
let totalDepositosCalculado = 0; 

document.addEventListener("DOMContentLoaded", () => {
  dataService = new DataService();
  initializeApp();
  setupTabListeners(); 
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
            <span class="svg-icon">
              <svg><use xlink:href="#icon-touch"></use></svg>
            </span>
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

function updateDashboardSummary(factoringData) {
  const data = factoringData || { tasa: 0, montoGanado: 0, totalInvertido: 0 };
  const tasa = data.tasa || 0;
  const montoGanado = data.montoGanado || 0;
  const inversionTotalMostrada = totalDepositosCalculado + montoGanado;
  setTextContent("total-inversion", formatUtils.currency(inversionTotalMostrada));
  setTextContent("tasa-promedio", formatUtils.percentage(tasa));
  const inversionCardInfo = document.querySelector(".summary-card:nth-child(1) .summary-info");
  if (inversionCardInfo) {
    let inversionTrendElement = inversionCardInfo.querySelector(".summary-trend");
    if (inversionTrendElement) {
      const trendClass = montoGanado >= 0 ? 'positive' : 'negative';
      const iconId = montoGanado >= 0 ? 'icon-trending-up' : 'icon-trending-down';
      inversionTrendElement.className = `summary-trend ${trendClass}`;
      inversionTrendElement.innerHTML = `<span class="svg-icon"><svg><use xlink:href="#${iconId}"></use></svg></span> ${formatUtils.currency(montoGanado)} de ganancia`;
    }
  }
  const tasaTrendElement = document.querySelector(".summary-card:nth-child(2) .summary-trend");
  if (tasaTrendElement) {
    let trendClass = 'neutral';
    let iconId = 'icon-trending-neutral';
    if (tasa > 0.1) { trendClass = 'positive'; iconId = 'icon-trending-up'; }
    else if (tasa < -0.1) { trendClass = 'negative'; iconId = 'icon-trending-down'; }
    tasaTrendElement.className = `summary-trend ${trendClass}`;
    tasaTrendElement.innerHTML = `<span class="svg-icon"><svg><use xlink:href="#${iconId}"></use></svg></span> Anualizada`;
  }
  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");
  if (metaTiempoElement && metaDescripcionElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity };
    const capitalInicialMeta = inversionTotalMostrada > 0 ? inversionTotalMostrada : 0; 
    if ((typeof tasa === 'number' && !isNaN(tasa) && tasa > -100) || APORTE_MENSUAL > 0) {
         tiempoHastaMeta = financeUtils.calcularTiempoHastaMeta(capitalInicialMeta, tasa);
    }
    setTextContent("meta-tiempo", "");
    if (tiempoHastaMeta.años === Infinity || !isFinite(tiempoHastaMeta.años)) {
      metaTiempoElement.textContent = "Meta Inalcanzable";
      metaDescripcionElement.innerHTML = `<span class="svg-icon"><svg><use xlink:href="#icon-warning"></use></svg></span> Tasa o aportes insuficientes`;
      metaDescripcionElement.className = "summary-trend negative";
    } else {
      let tiempoTexto = "";
      if (tiempoHastaMeta.años <= 0 && tiempoHastaMeta.meses <= 0) {
           tiempoTexto = "Meta Alcanzada";
           const fechaEstimadaValida = tiempoHastaMeta.fechaEstimada instanceof Date && !isNaN(tiempoHastaMeta.fechaEstimada);
           metaDescripcionElement.innerHTML = `<span class="svg-icon"><svg><use xlink:href="#icon-check"></use></svg></span> ${fechaEstimadaValida ? 'Logrado ~' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`;
           metaDescripcionElement.className = "summary-trend positive";
      } else {
          if (tiempoHastaMeta.años === 0) tiempoTexto = `En ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;
          else if (tiempoHastaMeta.meses === 0) tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'}`;
          else tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'} y ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;
          const fechaEstimadaValida = tiempoHastaMeta.fechaEstimada instanceof Date && !isNaN(tiempoHastaMeta.fechaEstimada);
          metaDescripcionElement.innerHTML = `<span class="svg-icon"><svg><use xlink:href="#icon-timeline"></use></span> ${fechaEstimadaValida ? 'Estimado: ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : 'Calculando fecha...'}`;
          metaDescripcionElement.className = "summary-trend positive";
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
  }
}

function updateFactoringCard(contracts, factoringData, tabType = null) {
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  const data = factoringData || { contratos: 0, contratosPendientes: 0, contratosPagados: 0 };

  if (tabType === null) {
      showFactoringWaitingState("Selecciona una categoría"); 
      return;
  }

  const validContracts = Array.isArray(contracts) ? contracts : [];

  if (contractsCountElement) {
      let countText = `Total: ${data.contratos || 0}`; 
      if (tabType === 'pending') countText = `Por cobrar: ${data.contratosPendientes || 0}`;
      else if (tabType === 'paid') countText = `Pagados: ${data.contratosPagados || 0}`;
      contractsCountElement.textContent = countText;
  }

  const detailsList = document.getElementById("factoring-details");
  if (!detailsList) {
    console.error("Element with ID 'factoring-details' not found.");
    return;
  }
  detailsList.innerHTML = ""; 

  let currentYear = null; 

  if (validContracts.length > 0) {
    validContracts.forEach((contrato, index) => {
      if (!contrato || typeof contrato.monto === 'undefined' || typeof contrato.montoPagoNeto === 'undefined') {
          console.warn("Skipping rendering of invalid contract:", contrato);
          return;
      }
      const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
      const fechaPagoDate = fechaPagoStr ? dateUtils.parse(fechaPagoStr) : null; 
      const contractYear = fechaPagoDate ? fechaPagoDate.getFullYear() : null;

      if (contractYear !== null && contractYear !== currentYear) {
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
      row.classList.add(index % 2 === 0 ? 'even-row' : 'alt-row'); 
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
      gainSpan.className = `detail-gain ${contrato.montoPagoNeto >= 0 ? 'text-positive' : 'text-negative'}`;
      gainSpan.textContent = formatUtils.currency(contrato.montoPagoNeto, contrato.moneda);
      gainCell.appendChild(gainSpan);

      row.appendChild(clientCell);
      row.appendChild(dateCell);
      row.appendChild(gainCell);
      detailsList.appendChild(row);
    });
  } else {
    let emptyMessage = "No hay contratos disponibles.";
    if (tabType === 'pending') emptyMessage = "No hay contratos pendientes por cobrar.";
    else if (tabType === 'paid') emptyMessage = "No se encontraron contratos pagados.";
    else if (tabType === 'all') emptyMessage = "No se encontraron contratos.";

    detailsList.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="3">
          <div class="empty-state">
            <span class="svg-icon"><svg><use xlink:href="#icon-info"></use></svg></span>
            <p>${emptyMessage}</p>
          </div>
        </td>
      </tr>
    `;
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
            <span class="svg-icon"><svg><use xlink:href="#icon-error"></use></svg></span>
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
  errorBanner.innerHTML = `<span class="svg-icon" style="vertical-align: middle; margin-right: 8px;"><svg><use xlink:href="#icon-error"></use></svg></span> ${message}`;
  errorBanner.style.display = 'block';
}

function setupTabListeners() {
  const tabsContainer = document.querySelector('.tabs-container');
  if (!tabsContainer) return;

  const tabs = tabsContainer.querySelectorAll('.tab'); 

  tabsContainer.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab || tab.classList.contains('active')) return;

    const tabType = tab.getAttribute('data-tab'); 
    const allTabs = tabsContainer.querySelectorAll('.tab');

    requestAnimationFrame(() => {
      allTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (dataService) {
        const contracts = dataService.changeTab(tabType);
        const globalFactoringData = dataService.buildFactoringData(); 
        updateFactoringCard(contracts, globalFactoringData, tabType); 
      }
    });
  });
}