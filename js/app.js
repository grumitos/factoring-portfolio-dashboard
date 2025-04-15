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
  const data = factoringData || { tasa: 0, montoGanado: 0, totalInvertido: 0, gananciaUltimoMes: 0 };
  const tasa = data.tasa || 0;
  const montoGanado = data.montoGanado || 0;
  const gananciaUltimoMes = data.gananciaUltimoMes || 0;
  const depositosValidos = typeof totalDepositosCalculado === 'number' && !isNaN(totalDepositosCalculado) ? totalDepositosCalculado : 0;
  const inversionTotalMostrada = depositosValidos + montoGanado;

  setTextContent("total-inversion", formatUtils.currency(inversionTotalMostrada));
  setTextContent("tasa-promedio", formatUtils.percentage(tasa));

  const inversionTrendElement = document.getElementById("inversion-trend");
  if (inversionTrendElement) {
    let trendClassInv = 'neutral';
    if (gananciaUltimoMes > 1) trendClassInv = 'positive';
    else if (gananciaUltimoMes < -1) trendClassInv = 'negative';
    inversionTrendElement.className = `summary-trend ${trendClassInv}`;
    inversionTrendElement.innerHTML = `${formatUtils.currency(gananciaUltimoMes)} último mes`;
  }

  const tasaTrendElement = document.getElementById("tasa-trend");
  if (tasaTrendElement) {
    let trendClassTasa = 'neutral';
    if (tasa > 0.1) trendClassTasa = 'positive';
    else if (tasa < -0.1) trendClassTasa = 'negative';
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.innerHTML = `Anualizada`;
  }

  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");
  if (metaTiempoElement && metaDescripcionElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity, fechaEstimada: null };
    const capitalInicialMeta = typeof inversionTotalMostrada === 'number' && !isNaN(inversionTotalMostrada) && inversionTotalMostrada > 0 ? inversionTotalMostrada : 0;
    const tasaValidaParaCalculo = typeof tasa === 'number' && !isNaN(tasa) ? tasa : 0;
    if (APORTE_MENSUAL > 0 || tasaValidaParaCalculo > 0) {
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
        if (tiempoHastaMeta.años === 0) tiempoTexto = `En ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;
        else if (tiempoHastaMeta.meses === 0) tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'}`;
        else tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'} y ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;
        metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Estimado: ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`;
        metaDescripcionElement.className = fechaEstimadaValida ? "summary-trend positive" : "summary-trend neutral";
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
  } else {
    if (metaTiempoElement) metaTiempoElement.textContent = "Error UI";
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

      row.style.cursor = "pointer";
      row.onclick = () => showContractDetailsPopup(contrato);
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
  popup.style.animation = 'fadeIn 0.2s ease-out';

  popup.innerHTML = `
    <div class="popup-modal" style="border-radius: 8px; box-shadow: 0 5px 25px rgba(0,0,0,0.25); max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; padding: 8px;">
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

  const style = document.createElement('style');
  style.id = 'contract-popup-styles';
  style.textContent = `
    .popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .popup-details-table .popup-key {
      color: var(--color-text-secondary);
      padding: 8px 8px 8px 0;
      font-size: 0.9em;
      vertical-align: middle;
      width: 40%;
    }
    .popup-details-table .popup-value {
      padding-top: 8px;
      padding-bottom: 8px;
      font-weight: 500;
      color: var(--color-text-primary);
      word-break: break-word;
      text-align: right;
      vertical-align: middle;
    }
    .important-field .popup-value {
      font-weight: 600;
      font-size: 1.05em;
    }
    .financial-field .popup-value {
      color: var(--color-positive);
    }
    .date-field {
      color: var(--color-accent-secondary);
    }
    .status-positive {
      color: var(--color-positive);
      font-weight: 500;
    }
    .status-negative {
      color: var(--color-negative);
      font-weight: 500;
    }
    .group-separator td {
      height: 1px;
      background-color: var(--color-border);
      padding: 0;
      opacity: 0.5;
    }
    .popup-details-table tr:nth-child(even):not(.group-separator) {
      background-color: rgba(0,0,0,0);
    }
    .popup-details-table tr:not(.group-separator):hover {
      background-color: rgba(0,0,0,0);
    }
    #close-contract-popup:hover {
      background-color: rgba(0,0,0,0.1);
      color: var(--color-text-primary);
    }
    @media (max-width: 600px) {
      .popup-overlay {
        padding: 10px;
      }
      .popup-modal {
        width: 98% !important;
        max-width: 98% !important;
        padding: 8px !important;
      }
      .popup-details-table {
        width: 100%;
      }
    }
  `;

  if (!document.getElementById('contract-popup-styles')) {
    document.head.appendChild(style);
  }

  document.getElementById('close-contract-popup').onclick = () => {
    popup.style.display = 'none';
    const popupStyle = document.getElementById('contract-popup-styles');
    if (popupStyle) popupStyle.remove();
    setTimeout(() => popup.remove(), 150);
  };

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.style.display = 'none';
      const popupStyle = document.getElementById('contract-popup-styles');
      if (popupStyle) remove();
      setTimeout(() => popup.remove(), 150);
    }
  };
}