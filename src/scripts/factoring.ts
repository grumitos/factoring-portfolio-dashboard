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
const STATUS_PAID = 'cobrado';
const STATUS_REJECTED = 'rechazado';

const normalize = (value: string): string => value.trim().toLowerCase();

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(v);
}

function initFactoring() {
  const dataEl = document.getElementById('factoring-data');
  if (!dataEl?.textContent) return;

  const rawData: Contract[] = JSON.parse(dataEl.textContent);
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

  let currentTab = '';
  let currentPage = 1;
  let totalPages = 1;

  const tbody = document.getElementById('factoring-details');
  const thead = document.querySelector('.details-table thead');
  const headerInfo = document.getElementById('factoring-header-info');
  const searchInput = document.getElementById('search-contracts') as HTMLInputElement | null;
  const clearBtn = document.getElementById('clear-search');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prev-page') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-page') as HTMLButtonElement | null;
  const pageInfo = document.getElementById('page-info');

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
    pagination.classList.toggle('hidden', totalPages <= 1);
    pagination.style.display = totalPages <= 1 ? 'none' : '';
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
    thead.innerHTML = '';
    thead.appendChild(row);
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
    thead.innerHTML = '';
    thead.appendChild(row);
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

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  function renderEmptyState() {
    if (!tbody) return;
    const row = document.createElement('tr');
    row.innerHTML = "<td colspan=\"3\"><div class=\"empty-state\"><span class=\"svg-icon\"><svg><use xlink:href='#icon-empty-box'></use></svg></span><p class='primary-text'>Sin contratos</p><p class='secondary-text'>No hay resultados para esta vista o búsqueda.</p></div></td>";
    tbody.innerHTML = '';
    tbody.appendChild(row);
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

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  function render(tab: string) {
    currentTab = tab;
    tabs.forEach(tb => {
      const isActive = (tb as HTMLElement).dataset.tab === tab;
      tb.classList.toggle('active', isActive);
      tb.setAttribute('aria-selected', String(isActive));
    });
    const filtered = filterContracts(tab, searchInput?.value || '');
    const list = sortContracts(filtered, tab);
    if (!tbody || !thead) return;
    tbody.setAttribute('aria-busy', 'true');
    updateHeader(tab, list);
    updateSearchState();

    if (tab === 'potential-earnings') {
      if (pagination) {
        pagination.classList.add('hidden');
        pagination.style.display = 'none';
      }
    } else {
      updatePagination(list);
    }

    if (tab === 'potential-earnings') {
      renderPotentialRows(list);
      tbody.setAttribute('aria-busy', 'false');
      return;
    }

    renderContractRows(list);
    tbody.setAttribute('aria-busy', 'false');
  }

  tabs.forEach(tb => tb.addEventListener('click', () => {
    currentPage = 1;
    render((tb as HTMLElement).dataset.tab || '');
  }));

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
