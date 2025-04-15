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
  const data = factoringData || { tasa: 0, montoGanado: 0, totalInvertido: 0, gananciaUltimoMes: 0 }; // Añadir gananciaUltimoMes por defecto
  const tasa = data.tasa || 0;
  const montoGanado = data.montoGanado || 0;
  const gananciaUltimoMes = data.gananciaUltimoMes || 0; // Obtener ganancia del último mes
  const inversionTotalMostrada = totalDepositosCalculado + montoGanado;

  setTextContent("total-inversion", formatUtils.currency(inversionTotalMostrada));
  setTextContent("tasa-promedio", formatUtils.percentage(tasa));

  // Actualizar tarjeta de Inversión Total
  const inversionTrendElement = document.getElementById("inversion-trend"); // Seleccionar por ID
  if (inversionTrendElement) {
    let trendClassInv = 'neutral'; // Renombrar variables para evitar conflictos
    let iconIdInv = 'icon-trending-neutral';
    if (gananciaUltimoMes > 1) { // Umbral pequeño para considerar positivo
        trendClassInv = 'positive';
        iconIdInv = 'icon-trending-up';
    } else if (gananciaUltimoMes < -1) { // Umbral pequeño para considerar negativo
        trendClassInv = 'negative';
        iconIdInv = 'icon-trending-down';
    }
    inversionTrendElement.className = `summary-trend ${trendClassInv}`;
    // Mostrar ganancia del último mes
    inversionTrendElement.innerHTML = `${formatUtils.currency(gananciaUltimoMes)} último mes`;
  }

  // Actualizar tarjeta de Tasa Promedio (sin cambios aquí)
  const tasaTrendElement = document.getElementById("tasa-trend"); // Usar ID si existe o selector
  if (tasaTrendElement) {
    let trendClassTasa = 'neutral'; // Usar nombres de variables distintos
    let iconIdTasa = 'icon-trending-neutral'; // Definir iconId aquí basado en la tasa
    if (tasa > 0.1) { trendClassTasa = 'positive'; iconIdTasa = 'icon-trending-up'; }
    else if (tasa < -0.1) { trendClassTasa = 'negative'; iconIdTasa = 'icon-trending-down'; }
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.innerHTML = `Anualizada`; // Usar iconIdTasa
  }

  // Actualizar tarjeta de Meta (sin cambios aquí)
  const metaTiempoElement = document.getElementById("meta-tiempo");
  // ... (código existente para la meta) ...
}

function updateDashboardSummary(factoringData) {
  const data = factoringData || { tasa: 0, montoGanado: 0, totalInvertido: 0, gananciaUltimoMes: 0 };
  const tasa = data.tasa || 0;
  const montoGanado = data.montoGanado || 0;
  const gananciaUltimoMes = data.gananciaUltimoMes || 0;
  // Asegurarse que totalDepositosCalculado sea un número
  const depositosValidos = typeof totalDepositosCalculado === 'number' && !isNaN(totalDepositosCalculado) ? totalDepositosCalculado : 0;
  const inversionTotalMostrada = depositosValidos + montoGanado;

  setTextContent("total-inversion", formatUtils.currency(inversionTotalMostrada));
  setTextContent("tasa-promedio", formatUtils.percentage(tasa));

  // ... (actualización tarjeta Inversión Total y Tasa Promedio como antes) ...
  const inversionTrendElement = document.getElementById("inversion-trend");
  if (inversionTrendElement) {
    let trendClassInv = 'neutral';
    let iconIdInv = 'icon-trending-neutral';
    if (gananciaUltimoMes > 1) {
        trendClassInv = 'positive';
        iconIdInv = 'icon-trending-up';
    } else if (gananciaUltimoMes < -1) {
        trendClassInv = 'negative';
        iconIdInv = 'icon-trending-down';
    }
    inversionTrendElement.className = `summary-trend ${trendClassInv}`;
    inversionTrendElement.innerHTML = `${formatUtils.currency(gananciaUltimoMes)} último mes`;
  }

  const tasaTrendElement = document.getElementById("tasa-trend");
  if (tasaTrendElement) {
    let trendClassTasa = 'neutral';
    let iconIdTasa = 'icon-trending-neutral';
    if (tasa > 0.1) { trendClassTasa = 'positive'; iconIdTasa = 'icon-trending-up'; }
    else if (tasa < -0.1) { trendClassTasa = 'negative'; iconIdTasa = 'icon-trending-down'; }
    tasaTrendElement.className = `summary-trend ${trendClassTasa}`;
    tasaTrendElement.innerHTML = `Anualizada`;
  }


  // Actualizar tarjeta de Meta
  const metaTiempoElement = document.getElementById("meta-tiempo");
  const metaDescripcionElement = document.getElementById("meta-descripcion");

  if (metaTiempoElement && metaDescripcionElement) {
    let tiempoHastaMeta = { años: Infinity, meses: Infinity, fechaEstimada: null }; // Incluir fechaEstimada null por defecto
    // Asegurar que capitalInicialMeta sea un número válido
    const capitalInicialMeta = typeof inversionTotalMostrada === 'number' && !isNaN(inversionTotalMostrada) && inversionTotalMostrada > 0 ? inversionTotalMostrada : 0;
    // Asegurar que tasa sea un número válido para el cálculo
    const tasaValidaParaCalculo = typeof tasa === 'number' && !isNaN(tasa) ? tasa : 0; // Usar 0 si la tasa es inválida

    // Solo calcular si hay aportes o si la tasa es positiva (si tasa es 0 o negativa sin aportes, no se alcanzará)
    if (APORTE_MENSUAL > 0 || tasaValidaParaCalculo > 0) {
         tiempoHastaMeta = financeUtils.calcularTiempoHastaMeta(capitalInicialMeta, tasaValidaParaCalculo); // Usar tasaValidaParaCalculo
    }
    // Si no hay aportes y la tasa no es positiva, tiempoHastaMeta se queda en Infinity (inalcanzable)

    // Actualizar UI SIEMPRE después del cálculo
    if (!isFinite(tiempoHastaMeta.años)) { // Usar isFinite para chequear Infinity o NaN
      metaTiempoElement.textContent = "Meta Inalcanzable";
      metaDescripcionElement.innerHTML = `Tasa o aportes insuficientes`; // Texto ajustado
      metaDescripcionElement.className = "summary-trend negative";
    } else {
      let tiempoTexto = "";
      const fechaEstimadaValida = tiempoHastaMeta.fechaEstimada instanceof Date && !isNaN(tiempoHastaMeta.fechaEstimada);

      if (tiempoHastaMeta.años <= 0 && tiempoHastaMeta.meses <= 0) {
           tiempoTexto = "Meta Alcanzada";
           // Mostrar solo icono y fecha si es válida, o solo icono y texto
           metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Logrado ~' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : 'Ya alcanzada'}`;
           metaDescripcionElement.className = "summary-trend positive";
      } else {
          // ... (código existente para calcular tiempoTexto) ...
          if (tiempoHastaMeta.años === 0) tiempoTexto = `En ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;
          else if (tiempoHastaMeta.meses === 0) tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'}`;
          else tiempoTexto = `En ${tiempoHastaMeta.años} ${tiempoHastaMeta.años === 1 ? 'año' : 'años'} y ${tiempoHastaMeta.meses} ${tiempoHastaMeta.meses === 1 ? 'mes' : 'meses'}`;

          // Mostrar solo icono y fecha estimada si es válida, o solo icono
          metaDescripcionElement.innerHTML = `${fechaEstimadaValida ? 'Estimado: ' + formatUtils.dateForMeta(tiempoHastaMeta.fechaEstimada) : ''}`; // Quitado texto de aportes
          metaDescripcionElement.className = fechaEstimadaValida ? "summary-trend positive" : "summary-trend neutral"; // Clase basada en validez
      }
      metaTiempoElement.textContent = tiempoTexto;
    }
  } else {
      // Si los elementos no existen, limpiar el texto por si acaso
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

      // Evento para mostrar popup al hacer clic en la fila
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

// --- Popup Modal para detalles de contrato ---
function showContractDetailsPopup(contract) {
  // Elimina cualquier popup existente
  let existing = document.getElementById('contract-details-popup');
  if (existing) existing.remove();

  // Buscar el contrato original en el JSON si está disponible (por código de subasta)
  let originalData = null;
  if (window.dataService && window.dataService.factoring) {
    originalData = window.dataService.factoring.find(c =>
      c.codigoSubasta === contract.codigoSubasta
    );
  }

  // Buscar la fecha de pago real en los archivos de ganancia
  let fechaPagoReal = null;
  if (window.dataService && window.dataService.ganancias) {
    // Buscar en ambas monedas
    const ganancias = Array.isArray(window.dataService.ganancias) ? window.dataService.ganancias : [];
    const gananciaContrato = ganancias.find(g =>
      g["Código de subasta"] === contract.codigoSubasta
    );
    if (gananciaContrato && gananciaContrato.Fecha) {
      fechaPagoReal = gananciaContrato.Fecha;
    }
  }

  // Alias amigables para los campos
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

  // Categorías para organizar y colorear campos
  const fieldCategories = {
    important: ["nombre", "Cliente", "monto", "Inversion", "montoPagoNeto"],
    dates: ["fechaIngreso", "Fecha", "fechaPagoEstimado", "fechaPagoReal", "Fecha de pago", "Fecha de cierre de subasta"],
    status: ["Estado", "Riesgo"],
    // Quitar "moneda" de financial para que no se muestre como fila
    financial: ["Retorno mensual (%)", "retornoMensual"]
  };

  // Unir datos originales y calculados, priorizando los calculados
  const merged = {};
  if (originalData && originalData.originalRow) {
    Object.assign(merged, originalData.originalRow);
  }
  Object.assign(merged, contract);

  // Determinar estado visual
  const isPaid = merged.isPaid === true;
  // Determinar si está atrasado (no pagado y fecha de pago estimada pasada)
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

  // Crear grupos de campos para organizarlos mejor en el popup
  const groups = {
    important: [],
    dates: [],
    financial: [],
    status: [],
    other: []
  };

  // Mostrar todos los campos disponibles, sin duplicados
  const shownKeys = new Set();

  // Procesar los campos para agruparlos (omitimos isPaid, isPending, código de subasta, Estado y moneda)
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

    // Mostrar solo campos relevantes (oculta funciones, arrays, objetos complejos)
    if (typeof value === "object" && value !== null) continue;

    let displayValue = value;
    let categoryClass = 'other-field';
    let groupKey = 'other';

    // Determinar categoría para estilos y agrupación
    for (const [category, keys] of Object.entries(fieldCategories)) {
      if (keys.includes(key)) {
        categoryClass = `${category}-field`;
        groupKey = category;
        break;
      }
    }

    // Formatear montos y añadir sufijo de moneda
    if (typeof value === 'number' && key.match(/monto|inversion|ganancia|pago/i)) {
      // Determinar sufijo de moneda
      let sufijoMoneda = '';
      const moneda = (merged.moneda || merged.Moneda || '').toUpperCase();
      if (moneda === 'USD' || moneda === 'DOLARES' || moneda === 'DÓLARES') sufijoMoneda = ' - USD';
      else if (moneda === 'PEN' || moneda === 'SOLES' || moneda === 'SOL') sufijoMoneda = ' - Soles';
      displayValue = formatUtils.currency(value, moneda) + sufijoMoneda;
      categoryClass = 'financial-field';
      groupKey = 'financial';
    }

    // Formatear fechas
    if (key.toLowerCase().includes('fecha') && value) {
      displayValue = formatUtils.dateShort(value);
      categoryClass = 'date-field';
      groupKey = 'dates';
    }

    // Formatear booleanos
    if (typeof value === "boolean") {
      
      const statusClass = value ? "status-positive" : "status-negative";
      displayValue = `<span class="status-value ${statusClass}">
                        
                        ${value ? "Sí" : "No"}
                      </span>`;
      if (groupKey === 'other') categoryClass = 'status-field';
    }

    // Alias amigable
    const label = fieldLabels[key] || key;

    groups[groupKey].push(`
      <tr class="${categoryClass}">
        <td class="popup-key">${label}</td>
        <td class="popup-value">${displayValue ?? '-'}</td>
      </tr>
    `);
  }

  // Construir las filas de la tabla, organizadas por grupos
  const detailRows = [
    ...groups.important,
    groups.important.length > 0 ? '<tr class="group-separator"><td colspan="2"></td></tr>' : '',
    ...groups.financial,
    groups.financial.length > 0 ? '<tr class="group-separator"><td colspan="2"></td></tr>' : '',
    ...groups.dates,
    groups.dates.length > 0 ? '<tr class="group-separator"><td colspan="2"></td></tr>' : '',
    ...groups.status,
    groups.status.length > 0 ? '<tr class="group-separator"><td colspan="2"></td></tr>' : '',
    ...groups.other
  ];

  // Obtener el cliente para el encabezado
  const clientName = merged.nombre || merged.Cliente || "Detalle de Contrato";
  const contractCode = merged.codigoSubasta || merged["Codigo de subasta"] || "";

  // Estado visual y texto
  let estadoTexto = "";
  let estadoColor = "";
  let estadoIcon = "";
  if (isPaid) {
    estadoTexto = "Pagado";
    estadoColor = "#1ecb7a"; // Verde (ya estaba)
    estadoIcon = "icon-check-circle";
  } else if (isLate) {
    estadoTexto = "Atrasado";
    estadoColor = "#e74c3c"; // Rojo
    estadoIcon = "icon-warning";
  } else {
    estadoTexto = "Pendiente";
    estadoColor = "#ffd600"; // Amarillo
    estadoIcon = "icon-time";
  }

  // Fecha de pago real (si existe)
  let fechaPagoRealHtml = "";
  if (fechaPagoReal) {
    fechaPagoRealHtml = `
      <div style="margin-top: 4px; font-size: 0.95em; color: var(--color-text-secondary);">
        
        Pago real: <b>${formatUtils.dateShort(fechaPagoReal)}</b>
      </div>
    `;
  }

  // Crear y añadir el popup al DOM con estilos mejorados
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
        <table class="popup-details-table" style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
          <tbody>
            ${detailRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Agregar estilos específicos para el popup
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
      vertical-align: top;
      width: 40%;
    }
    .popup-details-table .popup-value {
      padding: 8px 0;
      font-weight: 500;
      color: var(--color-text-primary);
      word-break: break-word;
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
      background-color: rgba(0,0,0,0.02);
    }
    .popup-details-table tr:not(.group-separator):hover {
      background-color: rgba(0,0,0,0.05);
    }
    #close-contract-popup:hover {
      background-color: rgba(0,0,0,0.1);
      color: var(--color-text-primary);
    }
  `;

  if (!document.getElementById('contract-popup-styles')) {
    document.head.appendChild(style);
  }

  // Cerrar popup
  document.getElementById('close-contract-popup').onclick = () => {
    popup.style.animation = 'fadeIn 0.15s ease-in reverse';
    setTimeout(() => popup.remove(), 150);
    const popupStyle = document.getElementById('contract-popup-styles');
    if (popupStyle) popupStyle.remove();
  };

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.style.animation = 'fadeIn 0.15s ease-in reverse';
      setTimeout(() => popup.remove(), 150);
      const popupStyle = document.getElementById('contract-popup-styles');
      if (popupStyle) popupStyle.remove();
    }
  };
}