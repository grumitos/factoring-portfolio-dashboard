interface Contract {
  codigo: string;
  cliente: string;
  fechaPago: string;
  estado: string;
  gainPen: number;
}

interface PreparedContract extends Contract {
  estadoNorm: string;
  clienteNorm: string;
  codigoNorm: string;
  fechaPagoTs: number;
  fechaPagoLabel: string;
}

const ITEMS_PER_PAGE = 10;
const DATE_FORMATTER = new Intl.DateTimeFormat('es-PE');
const CURRENCY_FORMATTER = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const STATUS_PAID = 'cobrado';
const STATUS_REJECTED = 'rechazado';

const normalize = (value: string): string => String(value ?? '').trim().toLowerCase();

function formatCurrency(v: number): string {
  return CURRENCY_FORMATTER.format(v);
}

function parseContracts(rawJson: string): Contract[] {
  const parsed: unknown = JSON.parse(rawJson);
  return Array.isArray(parsed) ? parsed as Contract[] : [];
}

function initFactoring() {
  const dataEl = document.getElementById('factoring-data');
  const tbody = document.getElementById('factoring-details');
  const thead = document.querySelector('.details-table thead');
  const headerInfo = document.getElementById('factoring-header-info');
  const searchInput = document.getElementById('search-contracts') as HTMLInputElement | null;
  const clearBtn = document.getElementById('clear-search') as HTMLButtonElement | null;
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
  const panel = document.getElementById('factoring-panel');
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prev-page') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-page') as HTMLButtonElement | null;
  const pageInfo = document.getElementById('page-info');

  if (!dataEl?.textContent) return;

  let rawData: Contract[] = [];
  try {
    rawData = parseContracts(dataEl.textContent);
  } catch {
    if (headerInfo) headerInfo.textContent = 'Error de datos';
    renderState('No se pudo cargar', 'Los contratos no tienen un formato válido.', 'error');
    return;
  }

  const data: PreparedContract[] = rawData.map((contract) => {
    const fechaPagoDate = new Date(contract.fechaPago);
    const fechaPagoTs = fechaPagoDate.getTime();
    const hasValidDate = Number.isFinite(fechaPagoTs);
    return {
      ...contract,
      estadoNorm: normalize(contract.estado),
      clienteNorm: normalize(contract.cliente),
      codigoNorm: normalize(contract.codigo),
      fechaPagoTs: hasValidDate ? fechaPagoTs : 0,
      fechaPagoLabel: hasValidDate ? DATE_FORMATTER.format(fechaPagoDate) : '-'
    };
  });

  let currentTab = 'pending';
  let currentPage = 1;
  let totalPages = 1;

  function createSpriteIcon(name: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = 'svg-icon';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#icon-${name}`);
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#icon-${name}`);

    svg.appendChild(use);
    icon.appendChild(svg);
    return icon;
  }

  function renderState(title: string, detail: string, iconName: string = 'empty-box') {
    if (!tbody) return;
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;

    const state = document.createElement('div');
    state.className = 'empty-state';

    const primary = document.createElement('p');
    primary.className = 'primary-text';
    primary.textContent = title;

    const secondary = document.createElement('p');
    secondary.className = 'secondary-text';
    secondary.textContent = detail;

    state.append(createSpriteIcon(iconName), primary, secondary);
    cell.appendChild(state);
    row.appendChild(cell);
    tbody.replaceChildren(row);
  }

  function filterContracts(tab: string, term: string): PreparedContract[] {
    const t = normalize(term);
    return data.filter(c => {
      const est = c.estadoNorm;
      if (tab === 'pending') {
        if (est === STATUS_PAID || est === STATUS_REJECTED) return false;
      } else if (tab === 'paid') {
        if (est !== STATUS_PAID) return false;
      } else if (tab === 'potential-earnings') {
        if (est === STATUS_REJECTED) return false;
      }
      if (!t) return true;
      return c.clienteNorm.includes(t) || c.codigoNorm.includes(t);
    });
  }

  function sortContracts(list: PreparedContract[], tab: string): PreparedContract[] {
    const byDate = (a: PreparedContract, b: PreparedContract) => a.fechaPagoTs - b.fechaPagoTs;
    if (tab === 'pending') return [...list].sort(byDate);
    if (tab === 'paid') return [...list].sort((a, b) => byDate(b, a));
    return list;
  }

  function updateHeader(tab: string, list: PreparedContract[]) {
    if (!headerInfo) return;
    if (tab === 'pending') {
      headerInfo.textContent = `Pendientes: ${list.length}`;
    } else if (tab === 'paid') {
      headerInfo.textContent = `Pagados: ${list.length}`;
    } else if (tab === 'potential-earnings') {
      const gain = list.reduce((s, c) => s + c.gainPen, 0);
      headerInfo.textContent = `Ganancias: ${formatCurrency(gain)}`;
    }
  }

  function updatePagination(list: PreparedContract[]) {
    if (!pagination || !pageInfo || !prevBtn || !nextBtn) return;
    totalPages = Math.max(1, Math.ceil(list.length / ITEMS_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages);
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    pagination.hidden = totalPages <= 1;
    pagination.classList.toggle('hidden', totalPages <= 1);
  }

  function updateSearchState() {
    if (!clearBtn || !searchInput) return;
    (clearBtn as HTMLButtonElement).disabled = searchInput.value.length === 0;
  }

  function setPotentialHeader() {
    if (!thead) return;
    const row = document.createElement('tr');
    const estado = document.createElement('th');
    estado.textContent = 'Estado';
    const contratos = document.createElement('th');
    contratos.textContent = 'Contratos';
    contratos.style.textAlign = 'right';
    const ganancia = document.createElement('th');
    ganancia.textContent = 'Ganancia';
    ganancia.style.textAlign = 'right';
    row.append(estado, contratos, ganancia);
    thead.replaceChildren(row);
  }

  function setContractsHeader() {
    if (!thead) return;
    const row = document.createElement('tr');
    const cliente = document.createElement('th');
    cliente.textContent = 'Cliente';
    const fechaPago = document.createElement('th');
    fechaPago.textContent = 'Fecha Pago';
    fechaPago.style.textAlign = 'center';
    const ganancia = document.createElement('th');
    ganancia.textContent = 'Ganancia';
    ganancia.style.textAlign = 'right';
    row.append(cliente, fechaPago, ganancia);
    thead.replaceChildren(row);
  }

  function renderPotentialRows(list: PreparedContract[]) {
    if (!tbody) return;
    setPotentialHeader();

    const pending = list.filter(c => c.estadoNorm !== STATUS_PAID);
    const paid = list.filter(c => c.estadoNorm === STATUS_PAID);
    const pendingGain = pending.reduce((s, c) => s + c.gainPen, 0);
    const paidGain = paid.reduce((s, c) => s + c.gainPen, 0);
    const rows = [
      { label: 'Pendientes', count: pending.length, gain: pendingGain },
      { label: 'Pagados', count: paid.length, gain: paidGain },
      { label: 'Total', count: pending.length + paid.length, gain: pendingGain + paidGain }
    ];

    const fragment = document.createDocumentFragment();
    for (const item of rows) {
      const row = document.createElement('tr');

      const labelCell = document.createElement('td');
      labelCell.textContent = item.label;

      const countCell = document.createElement('td');
      countCell.style.textAlign = 'right';
      countCell.textContent = String(item.count);

      const gainCell = document.createElement('td');
      gainCell.style.textAlign = 'right';
      gainCell.textContent = formatCurrency(item.gain);

      row.append(labelCell, countCell, gainCell);
      fragment.appendChild(row);
    }

    tbody.replaceChildren(fragment);
  }

  function renderEmptyState() {
    renderState('Sin contratos', 'No hay resultados para esta vista o búsqueda.');
  }

  function renderContractRows(list: PreparedContract[]) {
    if (!tbody) return;
    setContractsHeader();

    if (list.length === 0) {
      renderEmptyState();
      return;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = list.slice(start, start + ITEMS_PER_PAGE);
    const fragment = document.createDocumentFragment();

    for (const contract of paginated) {
      const row = document.createElement('tr');

      const clientCell = document.createElement('td');
      clientCell.className = 'client-name';
      clientCell.title = contract.cliente;
      clientCell.textContent = contract.cliente;

      const paymentCell = document.createElement('td');
      paymentCell.style.textAlign = 'center';
      paymentCell.textContent = contract.fechaPagoLabel;

      const gainCell = document.createElement('td');
      gainCell.style.textAlign = 'right';
      gainCell.textContent = formatCurrency(contract.gainPen);

      row.append(clientCell, paymentCell, gainCell);
      fragment.appendChild(row);
    }

    tbody.replaceChildren(fragment);
  }

  function render(tab: string) {
    currentTab = tab;
    tabs.forEach(tb => {
      const isActive = tb.dataset.tab === tab;
      tb.classList.toggle('active', isActive);
      tb.setAttribute('aria-selected', String(isActive));
      tb.tabIndex = isActive ? 0 : -1;
    });
    panel?.setAttribute('aria-labelledby', `tab-${tab}`);
    const filtered = filterContracts(tab, searchInput?.value || '');
    const list = sortContracts(filtered, tab);
    if (!tbody || !thead) return;
    tbody.setAttribute('aria-busy', 'true');
    try {
      updateHeader(tab, list);
      updateSearchState();

      if (tab === 'potential-earnings') {
        if (pagination) {
          pagination.hidden = true;
          pagination.classList.add('hidden');
        }
        renderPotentialRows(list);
        return;
      }

      updatePagination(list);
      renderContractRows(list);
    } finally {
      tbody.setAttribute('aria-busy', 'false');
    }
  }

  function activateTab(tab: string) {
    currentPage = 1;
    render(tab);
  }

  tabs.forEach(tb => {
    tb.addEventListener('click', () => {
      activateTab(tb.dataset.tab || currentTab);
    });

    tb.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      const currentIndex = tabs.indexOf(tb);
      let nextIndex = currentIndex;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;

      const nextTab = tabs[nextIndex];
      nextTab.focus();
      activateTab(nextTab.dataset.tab || currentTab);
    });
  });

  searchInput?.addEventListener('input', () => {
    currentPage = 1;
    updateSearchState();
    render(currentTab);
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    currentPage = 1;
    updateSearchState();
    searchInput?.focus();
    render(currentTab);
  });

  prevBtn?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      render(currentTab);
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      render(currentTab);
    }
  });

  render('pending');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFactoring);
} else {
  initFactoring();
}
