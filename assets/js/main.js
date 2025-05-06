import { DataService } from './core/DataService.js';
import { LazyLoader } from './core/LazyLoader.js';
import { 
  updateDashboardSummaryUI, 
  showErrorState, 
  updateFactoringCardUI, 
  showFactoringWaitingState, 
  createContributionToggle,
  transitionFromLoadingState
} from './ui/UIManager.js';
import { createProjectionChart, prepareProjectionData } from './ui/ChartManager.js';
import { showContractDetailsPopup } from './ui/PopupManager.js';
// CONFIG no se usa directamente en main.js, pero se importa por los módulos que sí lo usan.

let dataService = null;
let projectionChartInstance = null;
let currentSearchTerm = '';

document.addEventListener("DOMContentLoaded", () => {
  dataService = new DataService();
  initializeApp();
  setupTabListeners();
  setupSearchListeners();
});

async function initializeApp() {
  try {
    const appData = await loadDataWithTimeout();
    
    // appData.uiTotals contiene { totalPEN, gananciaUltimoMesPEN, totalUSD, gananciaUltimoMesUSD }
    // appData.factoringData contiene el resumen de las operaciones de factoring
    // appData.totalDepositosNetPENeq es el neto de depósitos para la meta
    updateDashboardSummaryUI(appData.uiTotals, appData.factoringData, appData.totalDepositosNetPENeq);
    
    await createProjectionChartIfNeeded(appData.factoringData, appData.totalDepositosNetPENeq);
    
    updateFactoringCardUI([], appData.factoringData, null, currentSearchTerm, handleContractRowClick);
    document.querySelectorAll('.tabs-container .tab').forEach(tab => tab.classList.remove('active'));
    showFactoringWaitingState("Selecciona una categoría");

  } catch (error) {
    handleInitError(error);
  } finally {
    transitionFromLoadingState();
    LazyLoader.loadDeferredResources(); // Si hubiera algo que cargar después
  }
}

async function loadDataWithTimeout() {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Tiempo de espera agotado. La carga de datos está demorando demasiado.")), 15000);
  });
  const dataPromise = dataService.loadAllData();
  return Promise.race([dataPromise, timeoutPromise]);
}

async function createProjectionChartIfNeeded(factoringSummary, totalNetDepositsPENeq) {
  const canvas = document.getElementById('proyeccion-chart');
  if (canvas && factoringSummary) {
    await LazyLoader.loadChartJS();
    // Capital para proyección: depósitos netos + total ganancias de factoring (pagadas y pendientes)
    const capitalInicialProyeccion = totalNetDepositsPENeq + (factoringSummary.montoGanado || 0);
    const tasaAnualizada = factoringSummary.tasaEsperada || 0; // XIRR Global
    const capitalParaGrafico = capitalInicialProyeccion > 0 ? capitalInicialProyeccion : 10000;
    
    const projectionData = prepareProjectionData(capitalParaGrafico, tasaAnualizada);
    if (projectionChartInstance) {
        projectionChartInstance.destroy();
    }
    projectionChartInstance = createProjectionChart(canvas, projectionData);
    createContributionToggle(projectionChartInstance, capitalParaGrafico); // capitalParaGrafico es el valor del año 0 de la línea base
  }
}

function handleInitError(error) {
  console.error("Error al cargar los datos:", error);
  showErrorState(`Error al cargar los datos: ${error.message}. Intente recargar.`);
  updateDashboardSummaryUI(null, null, 0); 
  updateFactoringCardUI([], null, 'pending', currentSearchTerm, handleContractRowClick);
}

function handleContractRowClick(contract) {
    // dataService.factoring es la lista completa procesada de contratos
    // dataService._allGanancias es la lista combinada de archivos de earnings
    showContractDetailsPopup(contract, dataService.factoring, dataService._allGanancias, dataService);
}

function setupTabListeners() {
  const tabs = document.querySelectorAll('.tabs-container .tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      const tabType = this.getAttribute('data-tab');
      loadFactoringDataForTab(tabType);

      if (tabType !== 'potential-earnings') {
        const searchInput = document.getElementById('search-contracts');
        if (searchInput && searchInput.value) {
          searchInput.value = '';
          currentSearchTerm = '';
        }
      }
    });
  });
  
  const defaultTab = document.querySelector('.tabs-container .tab[data-tab="pending"]') || document.querySelector('.tabs-container .tab');
  if (defaultTab) {
    defaultTab.click();
  } else {
    showFactoringWaitingState();
  }
}

function loadFactoringDataForTab(tabType) {
  if (!dataService) return;

  const searchContainer = document.querySelector('.search-container');
  if (searchContainer) {
    searchContainer.style.display = tabType === 'potential-earnings' ? 'none' : 'flex';
  }
  
  try {
    const contractsToDisplay = dataService.changeTab(tabType);
    const summaryFactoringData = dataService.buildFactoringDataSummary();
    updateFactoringCardUI(contractsToDisplay, summaryFactoringData, tabType, currentSearchTerm, handleContractRowClick);
  } catch (error) {
    console.error("Error al cargar los datos de factoring para la pestaña:", tabType, error);
    showErrorState(`Error al cargar datos para ${tabType}.`);
  }
}

function setupSearchListeners() {
  const searchInput = document.getElementById('search-contracts');
  const clearButton = document.getElementById('clear-search');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.trim().toLowerCase();
      if (dataService && dataService.currentTab && dataService.currentTab !== 'potential-earnings') {
        loadFactoringDataForTab(dataService.currentTab);
      }
      if (clearButton) {
        clearButton.style.display = currentSearchTerm ? 'flex' : 'none';
      }
    });
  }

  if (clearButton) {
    clearButton.style.display = 'none';
    clearButton.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
      }
      currentSearchTerm = '';
      if (dataService && dataService.currentTab && dataService.currentTab !== 'potential-earnings') {
         loadFactoringDataForTab(dataService.currentTab);
      }
      clearButton.style.display = 'none';
    });
  }
}