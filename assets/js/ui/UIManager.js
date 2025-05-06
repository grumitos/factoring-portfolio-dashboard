import { formatUtils } from '../utils/formatUtils.js';
import { dateUtils } from '../utils/dateUtils.js';
import { financeUtils } from '../utils/financeUtils.js';
import { CONFIG } from '../config/appConfig.js';

export function setTextContent(elementId, text) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

export function updateSummarySection(prefix, total, gain, currency) {
  const totalEl = document.getElementById(prefix);
  const gainEl = document.getElementById(`ganancia-${prefix.split('-')[1]}`);

  if (totalEl) {
    totalEl.textContent = formatUtils.currency(total, currency);
  }
  if (gainEl) {
    gainEl.textContent = `Ganancia: ${formatUtils.currency(gain, currency)}`;
  }
}

export function updateDashboardSummaryUI(uiTotals, factoringSummary, totalNetDepositsPENeq) {
  // uiTotals: { totalPEN, gananciaUltimoMesPEN, totalUSD, gananciaUltimoMesUSD }
  // factoringSummary: resultado de buildFactoringDataSummary()
  // totalNetDepositsPENeq: resultado de calculateTotalNetDepositsPENEquivalent()
  
  if (!uiTotals || !factoringSummary) {
    updateSummarySection('total-soles', 0, 0, 'PEN');
    updateSummarySection('total-dolares', 0, 0, 'USD');
    setTextContent("tasa-promedio", formatUtils.percentage(0));
    setTextContent("tasa-trend", "Anualizada");
    const metaTiempoEl = document.getElementById("meta-tiempo");
    const metaDescEl = document.getElementById("meta-descripcion");
    if (metaTiempoEl) metaTiempoEl.textContent = "N/A";
    if (metaDescEl) {
        metaDescEl.textContent = "";
        metaDescEl.className = "summary-trend neutral";
    }
    return;
  }
  
  updateSummarySection('total-soles', uiTotals.totalPEN, uiTotals.gananciaUltimoMesPEN, 'PEN');
  updateSummarySection('total-dolares', uiTotals.totalUSD, uiTotals.gananciaUltimoMesUSD, 'USD');

  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");
  const tasaPromedioElement = document.getElementById("tasa-promedio");
  const tasaTrendElement = document.getElementById("tasa-trend");

  if (metaTiempoElement && metaDescripcionElement && tasaPromedioElement && tasaTrendElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity, fechaEstimada: null };
    // Capital para meta: depósitos netos (ya en PENeq) + total de ganancias de factoring (ya en PENeq)
    const capitalInicialMeta = totalNetDepositsPENeq + (factoringSummary.montoGanado || 0);
    const tasaAnualizada = factoringSummary.tasaEsperada || 0; // XIRR Global

    if (CONFIG.METAS.APORTE_MENSUAL > 0 || tasaAnualizada > 0) {
      tiempoHastaMeta = financeUtils.calcularTiempoHastaMeta(capitalInicialMeta, tasaAnualizada);
    }
    
    if (!isFinite(tiempoHastaMeta.años)) {
      metaTiempoElement.textContent = "Meta Inalcanzable";
      metaDescripcionElement.textContent = `Tasa o aportes insuficientes`;
      metaDescripcionElement.className = "summary-trend negative";
    } else {
      let tiempoTexto = "";
      const fechaEstimadaValida = tiempoHastaMeta.fechaEstimada instanceof Date && !isNaN(tiempoHastaMeta.fechaEstimada);
      if (tiempoHastaMeta.años <= 0 && tiempoHastaMeta.meses <= 0 && capitalInicialMeta >= CONFIG.METAS.MILLONES) {
        tiempoTexto = "Meta Alcanzada!";
        metaDescripcionElement.textContent = `${fechaEstimadaValida ? 'Logrado ~' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : '¡Ya alcanzada!'}`;
        metaDescripcionElement.className = "summary-trend positive";
      } else if (tiempoHastaMeta.años <= 0 && tiempoHastaMeta.meses <= 0 && capitalInicialMeta < CONFIG.METAS.MILLONES) {
        tiempoTexto = "Menos de 1 mes";
         metaDescripcionElement.textContent = `${fechaEstimadaValida ? 'Est. ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : 'Próximamente'}`;
        metaDescripcionElement.className = "summary-trend positive";
      }
      else {
        tiempoTexto = `${tiempoHastaMeta.años} año${tiempoHastaMeta.años !== 1 ? 's' : ''}, ${tiempoHastaMeta.meses} mes${tiempoHastaMeta.meses !== 1 ? 'es' : ''}`;
        metaDescripcionElement.textContent = `${fechaEstimadaValida ? 'Est. ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`;
        metaDescripcionElement.className = "summary-trend positive";
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
    tasaPromedioElement.textContent = formatUtils.percentage(tasaAnualizada);
    let trendClassTasa = 'neutral';
    if (tasaAnualizada > 15) { trendClassTasa = 'positive';}
    else if (tasaAnualizada < 5 && tasaAnualizada !== 0) { trendClassTasa = 'negative';}
    
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.textContent = `Anualizada (XIRR)`;
  }
}


export function transitionFromLoadingState() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('is-loading');
    });
  });
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

function _createContractRow(contrato, index, tabType, onRowClickCallback) {
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
  row.onclick = () => onRowClickCallback(contrato);

  return row;
}

function _filterContractsBySearchTerm(contracts, term) {
    if (!term) return contracts;
    const lowerCaseTerm = term.toLowerCase();
    return contracts.filter(contrato => {
      if (!contrato) return false;
      const clienteName = (contrato.nombre || '').toLowerCase();
      const codigo = (contrato.codigoSubasta || '').toLowerCase();
      const fechaPagoEst = (contrato.fechaPagoEstimado || '').toLowerCase();
      const fechaPagoReal = (contrato.fechaPagoReal || '').toLowerCase();
      const montoInv = (contrato.monto?.toString() || '').toLowerCase();
      const montoGan = (contrato.montoPagoNeto?.toString() || '').toLowerCase();
      const moneda = (contrato.moneda || '').toLowerCase();
  
      return clienteName.includes(lowerCaseTerm) ||
             codigo.includes(lowerCaseTerm) ||
             fechaPagoEst.includes(lowerCaseTerm) ||
             fechaPagoReal.includes(lowerCaseTerm) ||
             montoInv.includes(lowerCaseTerm) ||
             montoGan.includes(lowerCaseTerm) ||
             moneda.includes(lowerCaseTerm);
    });
}

function _renderEmptyState(detailsList, tabType, searchTerm) {
  let emptyMessage = "No hay contratos disponibles.";
  let iconId = "#icon-empty-box";

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
          <span class="svg-icon" style="font-size: 32px; opacity: 0.6;">
            <svg><use xlink:href="${iconId}"></use></svg>
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

export function updateFactoringCardUI(contractsToDisplay, summaryFactoringData, tabType, searchTerm, onRowClickCallback) {
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  const detailsList = document.getElementById("factoring-details");
  const data = summaryFactoringData || {
    contratos: 0, contratosPendientes: 0, contratosPagados: 0,
    totalGananciaPotencialPENeq: 0, totalInvertido: 0, // totalInvertido es de factoring
    gananciaEstimadaPendientesPENeq: 0, gananciaRealPagadosPENeq: 0
  };

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
    const porcentajeGanancia = data.totalInvertido > 0 ? (data.totalGananciaPotencialPENeq / data.totalInvertido) * 100 : 0;
    const esPositivo = data.totalGananciaPotencialPENeq >= 0;
    const colorClase = esPositivo ? 'text-positive' : 'text-negative';

    detailsList.innerHTML = `
      <tr class="year-header-row earnings-header-row"><td colspan="3" class="text-center earnings-title-cell"><span class="earnings-title">Resumen de Ganancias de Factoring</span></td></tr>
      <tr class="even-row earnings-main-row"><td colspan="3" class="text-center">
          <div class="earnings-amount ${colorClase}">${formatUtils.currency(data.totalGananciaPotencialPENeq || 0)}</div>
          <div class="earnings-percentage">${formatUtils.percentage(porcentajeGanancia)} del capital invertido en factoring</div></td></tr>
      <tr class="year-header-row earnings-details-header"><td>Descripción</td><td class="text-center">Cantidad</td><td class="text-right">Ganancia (PENeq)</td></tr>
      <tr class="even-row earnings-detail-row"><td>Contratos Pendientes</td><td class="text-center">${data.contratosPendientes || 0}</td>
          <td class="text-right ${ (data.gananciaEstimadaPendientesPENeq || 0) >= 0 ? 'text-positive' : 'text-negative'}">${formatUtils.currency(data.gananciaEstimadaPendientesPENeq || 0)}</td></tr>
      <tr class="alt-row earnings-detail-row"><td>Contratos Pagados</td><td class="text-center">${data.contratosPagados || 0}</td>
          <td class="text-right ${ (data.gananciaRealPagadosPENeq || 0) >= 0 ? 'text-positive' : 'text-negative'}">${formatUtils.currency(data.gananciaRealPagadosPENeq || 0)}</td></tr>
      <tr class="year-header-row description-row earnings-footer"><td colspan="3" class="text-center description-text">Tipo de cambio (USD a PEN): S/ ${CONFIG?.TASAS?.CAMBIO_USD_PEN || 'N/A'}</td></tr>
    `;
    return;
  }

  let filteredContracts = _filterContractsBySearchTerm(contractsToDisplay, searchTerm);

  if (contractsCountElement) {
    let countText = `Total: ${data.contratos || 0}`;
    if (tabType === 'pending') countText = `Pendientes: ${data.contratosPendientes || 0}`;
    else if (tabType === 'paid') countText = `Pagados: ${data.contratosPagados || 0}`;
    else if (tabType === 'all') countText = `Todos: ${data.contratos || 0}`;
    if (searchTerm) countText += ` (${filteredContracts.length} resultado${filteredContracts.length !== 1 ? 's' : ''})`;
    contractsCountElement.textContent = countText;
  }

  if (filteredContracts.length > 0) {
    filteredContracts.sort((a, b) => {
      const dateA = dateUtils.parse(a.isPaid && a.fechaPagoReal ? a.fechaPagoReal : a.fechaPagoEstimado);
      const dateB = dateUtils.parse(b.isPaid && b.fechaPagoReal ? b.fechaPagoReal : b.fechaPagoEstimado);
      if (!dateA && !dateB) return 0; if (!dateA) return 1; if (!dateB) return -1;
      return dateB.getTime() - dateA.getTime();
    });

    let currentYear = null;
    filteredContracts.forEach((contrato, index) => {
      if (!contrato || typeof contrato.monto === 'undefined') {
        console.warn("Skipping rendering of invalid contract data:", contrato); return;
      }
      const fechaPagoStr = contrato.isPaid && contrato.fechaPagoReal ? contrato.fechaPagoReal : contrato.fechaPagoEstimado;
      const fechaPagoDate = fechaPagoStr ? dateUtils.parse(fechaPagoStr) : null;
      const contractYear = fechaPagoDate ? fechaPagoDate.getUTCFullYear() : null;

      if (contractYear !== null && contractYear !== currentYear && (tabType === 'all' || tabType === 'paid')) {
        currentYear = contractYear;
        detailsList.appendChild(_createYearHeaderRow(currentYear));
      }
      detailsList.appendChild(_createContractRow(contrato, index, tabType, onRowClickCallback));
    });
  } else {
    _renderEmptyState(detailsList, tabType, searchTerm);
  }

  const tableContainer = detailsList.closest('.card-details');
  if (tableContainer) { tableContainer.scrollTop = 0; tableContainer.scrollLeft = 0; }
}

export function showErrorState(message) {
  const detailsList = document.getElementById("factoring-details");
  if (detailsList) {
    detailsList.innerHTML = `
      <tr class="error-state-row"><td colspan="3"><div class="error-state">
        <span class="svg-icon" style="font-size: 32px; opacity: 0.8;"><svg><use xlink:href="#icon-error"></use></svg></span>
        <p class="primary-text">${message}</p></div></td></tr>`;
  }
  let errorBanner = document.getElementById("global-error-banner");
  if (!errorBanner) {
    errorBanner = document.createElement('div'); errorBanner.id = 'global-error-banner';
    Object.assign(errorBanner.style, { backgroundColor: 'var(--color-negative)', color: 'white', padding: '10px', textAlign: 'center', position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '1000', fontSize: 'var(--font-size-sm)' });
    document.body.insertBefore(errorBanner, document.body.firstChild);
  }
  errorBanner.innerHTML = `${message}`; errorBanner.style.display = 'block';
}

export function showFactoringWaitingState(primaryMessage = "Selecciona una categoría", secondaryMessage = "Haz clic en una de las pestañas superiores para ver los contratos") {
  const detailsList = document.getElementById("factoring-details");
  if (detailsList) {
    detailsList.innerHTML = `
      <tr class="waiting-state-row"><td colspan="3"><div class="empty-state waiting-message">
        <span class="svg-icon" style="font-size: 40px; color: var(--color-accent-tertiary); opacity: 0.7;"><svg><use xlink:href="#icon-touch"></use></svg></span>
        <p class="primary-text">${primaryMessage}</p>${secondaryMessage ? `<p class="secondary-text">${secondaryMessage}</p>` : ''}
      </div></td></tr>`;
  }
  const contractsCountElement = document.getElementById("factoring-contracts-count");
  if (contractsCountElement) contractsCountElement.textContent = "Selecciona una pestaña";
  const tableHeaders = document.querySelector('.details-table thead');
  if (tableHeaders) tableHeaders.style.display = 'none';
}

export function createContributionToggle(chartInstance, capitalInicialProyeccion) {
  const legendContainer = document.querySelector('.chart-legend-container');
  if (!legendContainer || !chartInstance) return;

  legendContainer.innerHTML = `
    <label class="toggle-switch" for="contribution-toggle">
      <input type="checkbox" id="contribution-toggle"><span class="toggle-slider"></span>
      <span class="toggle-label">Incluir aportes</span></label>`;

  const toggleInput = legendContainer.querySelector('#contribution-toggle');
  const datasetIndexSinAportes = 0;
  const datasetIndexConAportes = 1;

  chartInstance.setDatasetVisibility(datasetIndexConAportes, false);
  chartInstance.update();

  toggleInput.addEventListener('change', function() {
    const mostrarConAportes = this.checked;
    chartInstance.setDatasetVisibility(datasetIndexConAportes, mostrarConAportes);
    // Opcional: Siempre mostrar la línea base sin aportes
    // chartInstance.setDatasetVisibility(datasetIndexSinAportes, true);


    let maxValue = 0;
    const dataSinAportes = chartInstance.data.datasets[datasetIndexSinAportes].data;
    if (dataSinAportes && dataSinAportes.length > 0) {
        maxValue = Math.max(...dataSinAportes);
    }

    if (mostrarConAportes) {
      const dataConAportes = chartInstance.data.datasets[datasetIndexConAportes].data;
      if (dataConAportes && dataConAportes.length > 0) {
         maxValue = Math.max(maxValue, ...dataConAportes);
      }
    }
    
    const yAxisMax = Math.max(maxValue, capitalInicialProyeccion) * 1.10; // 10% padding

    chartInstance.options.scales.y.min = 0;
    chartInstance.options.scales.y.max = yAxisMax || capitalInicialProyeccion * 1.2; // Fallback if maxValue is 0

    chartInstance.update({ duration: 300, easing: 'easeOutCubic' });
  });
}