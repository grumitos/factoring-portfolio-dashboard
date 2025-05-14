import { formatUtils } from '../utils/formatUtils.js';
import { CONFIG } from '../config/appConfig.js';

function removeElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

export function showContractDetailsPopup(contract, allFactoringContracts, allGananciasRecords, dataServiceInstance) {
  let existing = document.getElementById('contract-details-popup');
  if (existing) removeElement(existing);

  let originalData = null;
  if (allFactoringContracts) { // allFactoringContracts es this.factoring de DataService
    originalData = allFactoringContracts.find(c =>
      c.codigoSubasta === contract.codigoSubasta
    );
  }

  let fechaPagoReal = null;
  if (allGananciasRecords) { // allGananciasRecords es this._allGanancias de DataService
    const gananciaContrato = allGananciasRecords.find(g =>
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
    Moneda: "Moneda",
    "Retorno mensual (%)": "Retorno mensual (%)",
    retornoMensual: "Retorno mensual (%)",
    fechaIngreso: "Fecha de inversión",
    Fecha: "Fecha de inversión",
    fechaPagoEstimado: "Fecha de pago estimada",
    //fechaPagoReal: "Fecha de pago real", // Se muestra en el header
    "Fecha de pago": "Fecha de pago", // Del archivo original
    "Fecha de cierre de subasta": "Fecha de cierre de subasta",
    EstadoOriginal: "Estado (Original)", // Del archivo original
    Estado: "Estado", // Calculado
    montoPagoNeto: "Ganancia estimada/real",
    Hora: "Hora"
  };

  const fieldCategories = {
    important: ["nombre", "Cliente", "monto", "Inversion", "montoPagoNeto"],
    dates: ["fechaIngreso", "Fecha", "fechaPagoEstimado", "Fecha de pago", "Fecha de cierre de subasta"],
    status: ["EstadoOriginal", "Estado", "Riesgo"],
    financial: ["Retorno mensual (%)", "retornoMensual"]
  };
  
  const merged = {};
  // Prioritize data from the processed contract object, then originalRow if exists
  if (originalData && originalData.originalRow) {
    Object.assign(merged, originalData.originalRow);
  }
  Object.assign(merged, contract); // Processed contract data (like `isPaid`) takes precedence


  const isPaid = merged.isPaid === true;
  let isLate = false;
  if (!isPaid && merged.fechaPagoEstimado) {
    let fechaPagoEstimadaDate = new Date(merged.fechaPagoEstimado + 'T00:00:00Z'); // Ensure UTC
    let hoy = new Date();
    hoy.setUTCHours(0,0,0,0);
    if (fechaPagoEstimadaDate < hoy) isLate = true;
  }


  const groups = {
    important: [],
    dates: [],
    financial: [],
    status: [],
    other: []
  };

  const shownKeys = new Set();
  
  const orderOfKeys = [
    "nombre", "Cliente", "RUC", "codigoSubasta", "Codigo de subasta", "Código de subasta",
    "monto", "Inversion", "moneda", "Moneda", "montoPagoNeto",
    "Retorno mensual (%)", "retornoMensual",
    "fechaIngreso", "Fecha", "fechaPagoEstimado", "Fecha de pago", "Fecha de cierre de subasta", "Hora",
    "Riesgo", "EstadoOriginal", "Estado" 
  ];


  function addFieldToGroup(key, value) {
    if (shownKeys.has(key) || value === undefined || value === null) return;
    if (key === 'isPaid' || key === 'isPending' || key === 'originalRow' || key === 'tc') return;
    if (key === 'fechaPagoReal' && isPaid) return; // Ya se muestra en el header
    shownKeys.add(key);


    if (typeof value === "object" && value !== null) return;

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

    if (typeof value === 'number' && (key.toLowerCase().includes('monto') || key.toLowerCase().includes('inversion') || key.toLowerCase().includes('ganancia') || key.toLowerCase().includes('pago'))) {
      let currentMoneda = (merged.moneda || merged.Moneda || '').toUpperCase();
      if (!currentMoneda && key.toLowerCase().includes('inversion')) currentMoneda = "PEN"; // Default for Inversion if not specified
      
      displayValue = formatUtils.currency(value, currentMoneda);
      categoryClass = 'financial-field'; // Ensure this class is applied
      groupKey = 'financial';
    }


    if (key.toLowerCase().includes('fecha') && value && String(value).match(/^\d{4}-\d{2}-\d{2}/)) {
        displayValue = formatUtils.dateShort(value);
        categoryClass = 'date-field';
        groupKey = 'dates';
    } else if (key.toLowerCase().includes('fecha') && value) { // Handle dd/MM/yyyy from original data
        displayValue = String(value); // Keep as is if not yyyy-mm-dd
        categoryClass = 'date-field';
        groupKey = 'dates';
    }


    if (typeof value === "boolean") {
      const statusClass = value ? "status-positive" : "status-negative";
      displayValue = `<span class="status-value ${statusClass}">${value ? "Sí" : "No"}</span>`;
      if (groupKey === 'other') { // If not already categorized, make it a status
        categoryClass = 'status-field';
        groupKey = 'status';
      }
    }
    
    // Specific handling for "Estado"
    if (key === "Estado") {
        if (isPaid) displayValue = `<span class="status-positive">Pagado</span>`;
        else if (isLate) displayValue = `<span class="status-negative">Atrasado</span>`;
        else displayValue = `<span class="status-neutral" style="color:var(--color-neutral)">Pendiente</span>`;
    }


    const label = fieldLabels[key] || key.charAt(0).toUpperCase() + key.slice(1); // Capitalize if no label

    groups[groupKey].push(`
      <tr class="${categoryClass}">
        <td class="popup-key">${label}</td>
        <td class="popup-value">${displayValue ?? '-'}</td>
      </tr>
    `);
  }

  orderOfKeys.forEach(key => {
      if (merged.hasOwnProperty(key)) {
          addFieldToGroup(key, merged[key]);
      }
  });

  // Add any remaining keys not in orderOfKeys
  for (const [key, value] of Object.entries(merged)) {
    if (!shownKeys.has(key)) {
        addFieldToGroup(key, value);
    }
  }


  function buildDetailRows(groups) {
    const displayOrder = ['important', 'financial', 'dates', 'status', 'other'];
    const rows = [];
    for (let i = 0; i < displayOrder.length; i++) {
      const groupRows = groups[displayOrder[i]];
      if (groupRows.length > 0) {
        rows.push(...groupRows);
        let nextHasRows = false;
        for (let j = i + 1; j < displayOrder.length; j++) {
          if (groups[displayOrder[j]].length > 0) {
            nextHasRows = true;
            break;
          }
        }
        if (nextHasRows && rows.length > 0 && !rows[rows.length -1].includes('group-separator')) {
          rows.push('<tr class="group-separator"><td colspan="2"></td></tr>');
        }
      }
    }
    // Remove last separator if it exists
    if (rows.length > 0 && rows[rows.length - 1].includes('group-separator')) {
        rows.pop();
    }
    return rows;
  }

  const detailRows = buildDetailRows(groups);

  const clientName = merged.nombre || merged.Cliente || "Detalle de Contrato";
  const contractCode = merged.codigoSubasta || merged["Codigo de subasta"] || "";

  let estadoTexto = "";
  let estadoColor = "";
  let estadoIconName = ""; 

  if (isPaid) {
    estadoTexto = "Pagado";
    estadoColor = "var(--color-positive)";
    estadoIconName = "#icon-check-circle";
  } else if (isLate) {
    estadoTexto = "Atrasado";
    estadoColor = "var(--color-negative)";
    estadoIconName = "#icon-warning";
  } else {
    estadoTexto = "Pendiente";
    estadoColor = "var(--color-neutral)";
    estadoIconName = "#icon-time";
  }
  
  const estadoIconSvg = `<svg class="svg-icon" style="font-size:1.2em; margin-right: 0.3em; vertical-align: middle;"><use xlink:href="${estadoIconName}"></use></svg>`;


  let fechaPagoRealHtml = "";
  if (isPaid && merged.fechaPagoReal) {
    fechaPagoRealHtml = `
      <div style="margin-top: 4px; font-size: 0.9em; color: var(--color-text-secondary);">
        Pago real: <b>${formatUtils.dateShort(merged.fechaPagoReal)}</b>
      </div>
    `;
  }


  const popup = document.createElement('div');
  popup.id = 'contract-details-popup';
  popup.className = 'popup-overlay';

  popup.innerHTML = `
    <div class="popup-modal">
      <div class="popup-header">
        <button class="popup-close" id="close-contract-popup" title="Cerrar">&times;</button>
        <div>
          <h3 style="margin: 0 0 4px 0; color: var(--color-text-primary);">${clientName}</h3>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${estadoColor}; font-weight: 600; font-size: 1em; display:inline-flex; align-items:center;">
                ${estadoIconSvg}
                ${estadoTexto}
            </span>
            <span style="color: var(--color-text-tertiary); font-size: 0.9em; margin-left: 8px;">
              ${contractCode ? `Código: <b>${contractCode}</b>` : ""}
            </span>
          </div>
          ${fechaPagoRealHtml}
        </div>
      </div>
      <div style="padding: 12px 16px;">
        <table class="popup-details-table">
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
    setTimeout(() => removeElement(popup), 200);
  };

  popup.onclick = (e) => {
    if (e.target === popup) {
      popup.classList.add('hidden');
      setTimeout(() => removeElement(popup), 200);
    }
  };
}