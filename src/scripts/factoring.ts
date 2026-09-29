import { formatAmount, formatPen, formatShortDate } from '../lib/format';

interface Contract {
  codigo: string;
  cliente: string;
  fechaPago: string;
  estado: string;
  gainPen: number;
  riesgo?: string;
}

interface FactoringPayload {
  /** Fecha (ISO) del registro más reciente: referencia para los días relativos */
  asOf: string | null;
  contracts: Contract[];
}

type Tab = 'pending' | 'paid' | 'all';

interface PreparedContract extends Contract {
  isPaid: boolean;
  clienteNorm: string;
  codigoNorm: string;
  fechaPagoTs: number;
  fechaPagoLabel: string;
  /** Días entre la fecha de corte y la fecha de pago (negativo = vencido) */
  daysFromAsOf: number | null;
}

const DAY_MS = 86_400_000;
const STATUS_PAID = 'cobrado';
const STATUS_REJECTED = 'rechazado';
const TABS: Tab[] = ['pending', 'paid', 'all'];
const DATE_FORMATTER = new Intl.DateTimeFormat('es-PE');

const normalize = (value: string): string => value.trim().toLowerCase();
const sumGains = (list: PreparedContract[]): number => list.reduce((sum, c) => sum + c.gainPen, 0);
const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prepare(contract: Contract, asOfDay: number | null): PreparedContract {
  const date = new Date(contract.fechaPago);
  const valid = Number.isFinite(date.getTime());
  return {
    ...contract,
    isPaid: normalize(contract.estado) === STATUS_PAID,
    clienteNorm: normalize(contract.cliente),
    codigoNorm: normalize(contract.codigo),
    fechaPagoTs: valid ? date.getTime() : 0,
    fechaPagoLabel: valid ? DATE_FORMATTER.format(date) : '-',
    daysFromAsOf: valid && asOfDay !== null ? Math.round((startOfDay(date) - asOfDay) / DAY_MS) : null
  };
}

function initFactoring() {
  const dataEl = document.getElementById('factoring-data');
  const tbody = document.getElementById('factoring-details');
  if (!dataEl?.textContent || !tbody) return;

  const tableBody: HTMLElement = tbody;
  const payload = JSON.parse(dataEl.textContent) as FactoringPayload;
  const asOfDate = payload.asOf ? new Date(payload.asOf) : null;
  const asOfDay = asOfDate && Number.isFinite(asOfDate.getTime()) ? startOfDay(asOfDate) : null;
  const daysTitle = asOfDate && asOfDay !== null ? `Días respecto al corte del ${formatShortDate(asOfDate)}` : '';
  const data = payload.contracts
    .filter((contract) => normalize(contract.estado) !== STATUS_REJECTED)
    .map((contract) => prepare(contract, asOfDay));

  const segments = Array.from(document.querySelectorAll<HTMLButtonElement>('.investment-card .segment'));
  const searchInput = document.getElementById('search-contracts') as HTMLInputElement | null;
  const clearBtn = document.getElementById('clear-search') as HTMLButtonElement | null;
  const filterCell = searchInput?.closest('th');

  let currentTab: Tab = 'pending';

  const filterContracts = (tab: Tab, term: string): PreparedContract[] => {
    const t = normalize(term);
    return data.filter(
      (c) =>
        (tab === 'all' || (tab === 'paid') === c.isPaid) &&
        (!t || c.clienteNorm.includes(t) || c.codigoNorm.includes(t))
    );
  };

  // Pendientes: el próximo pago primero; pagados y total: lo más reciente primero
  const sortContracts = (list: PreparedContract[], tab: Tab): PreparedContract[] =>
    [...list].sort((a, b) => (tab === 'pending' ? a.fechaPagoTs - b.fechaPagoTs : b.fechaPagoTs - a.fechaPagoTs));

  const contractRow = (contract: PreparedContract): HTMLTableRowElement => {
    const clientCell = el('td');
    const name = el('span', 'client-name', contract.cliente);
    name.title = contract.cliente;
    const meta = el('span', 'client-meta num');
    if (contract.riesgo) {
      const risk = contract.riesgo.trim().toLowerCase();
      meta.append(el('span', `risk risk-${risk === 'b' || risk === 'c' ? risk : 'a'}`, contract.riesgo));
    }
    meta.append(contract.codigo);
    clientCell.append(name, meta);

    const dateCell = el('td', 'num', contract.fechaPagoLabel);
    const days = contract.daysFromAsOf;
    if (days !== null && !contract.isPaid) {
      const relative = el(
        'span',
        days < 0 ? 'date-rel is-overdue' : 'date-rel',
        `${days > 0 ? '+' : days < 0 ? '−' : ''}${Math.abs(days)} d`
      );
      if (daysTitle) relative.title = daysTitle;
      dateCell.append(relative);
    }

    const row = el('tr');
    row.append(clientCell, dateCell, el('td', 'align-right num', formatAmount(contract.gainPen)));
    return row;
  };

  const render = () => {
    const term = searchInput?.value.trim() ?? '';

    for (const button of segments) {
      const tab = TABS.find((candidate) => candidate === button.dataset.tab);
      if (!tab) continue;
      const list = filterContracts(tab, term);
      const active = tab === currentTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      const count = button.querySelector('[data-count-for]');
      const sum = button.querySelector('[data-sum-for]');
      if (count) count.textContent = String(list.length);
      if (sum) sum.textContent = formatPen(sumGains(list));
    }

    filterCell?.classList.toggle('has-value', term.length > 0);
    if (clearBtn) clearBtn.hidden = term.length === 0;

    const list = sortContracts(filterContracts(currentTab, term), currentTab);
    if (list.length === 0) {
      const cell = el('td', undefined, term ? 'Sin resultados' : 'Sin contratos');
      cell.colSpan = 3;
      const row = el('tr', 'empty-row');
      row.append(cell);
      tableBody.replaceChildren(row);
      return;
    }
    tableBody.replaceChildren(...list.map(contractRow));
  };

  const clearSearch = () => {
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    render();
  };

  segments.forEach((button) =>
    button.addEventListener('click', () => {
      currentTab = TABS.find((tab) => tab === button.dataset.tab) ?? 'pending';
      render();
    })
  );

  searchInput?.addEventListener('input', render);
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      clearSearch();
    }
  });
  clearBtn?.addEventListener('click', clearSearch);

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFactoring);
} else {
  initFactoring();
}
