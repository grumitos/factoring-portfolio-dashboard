// @ts-check
// Dibuja la proyección y filtra los contratos. Todo llega calculado y formateado desde el
// generador (dashboard/render.py): aquí solo se pinta, se filtra y se suma.

/**
 * @typedef {{ target: number, goal: string, label: string, value: string, progress: number, date: string,
 *   series: number[][], crossings: (number | null)[], ticks: number[], tickLabels: string[] }} Step
 * @typedef {{ client: string, code: string, key: string, risk: string, riskTone: string, paid: boolean,
 *   t: number, date: string, days: string | null, overdue: boolean, gain: number, gainLabel: string }} Contract
 * @typedef {{ months: string[], firstJanuary: number, firstYear: number, steps: Step[],
 *   contracts: Contract[], daysTitle: string }} Data
 */

const data = /** @type {Data} */ (JSON.parse(document.getElementById('dashboard-data')?.textContent ?? '{}'));
const PEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const PEN_INTEGER = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const SERIES = ['without', 'with']; // mismo orden que step.series; los colores viven en styles.css
const MARGIN = { top: 8, right: 16, bottom: 22, left: 48 }; // right: media etiqueta de año
const MIN_TICK_GAP_PX = 56;
const LABEL_CHAR_PX = 6.6; // ancho de un carácter a 11px en la fuente monoespaciada

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} className @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
const line = (className, x1, y1, x2, y2) => `<line class="${className}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
/** @param {number} x @param {number} y @param {string} content @param {string} attrs */
const text = (x, y, content, attrs) => `<text x="${x}" y="${y}" ${attrs}>${content}</text>`;
/** @param {number} x @param {number} y @param {string} series */
const dot = (x, y, series) => `<circle class="marker marker-${series}" cx="${x}" cy="${y}" r="4"/>`;

function initChart() {
  const chart = document.getElementById('chart');
  const range = /** @type {HTMLInputElement | null} */ (document.getElementById('goal-range'));
  const output = document.getElementById('goal-value');
  const goalKpi = document.querySelector('[data-kpi="goal"]');
  if (!chart || !range || !output) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const tooltip = el('div', 'chart-tooltip');
  tooltip.hidden = true;
  chart.append(svg, tooltip);

  const visible = [true, true];
  let step = data.steps[0];
  /** @type {number | null} */
  let hover = null;

  const frame = () => {
    const width = chart.clientWidth;
    const height = chart.clientHeight;
    const count = step.series[0].length;
    const low = step.ticks[0];
    const high = step.ticks[step.ticks.length - 1];
    const left = MARGIN.left;
    const right = width - MARGIN.right;
    const top = MARGIN.top;
    const bottom = height - MARGIN.bottom;
    return {
      width, height, count, left, right, top, bottom,
      /** @param {number} i */ x: (i) => left + ((right - left) * i) / Math.max(1, count - 1),
      /** @param {number} v */ y: (v) => bottom - ((v - low) / (high - low)) * (bottom - top),
    };
  };

  function draw() {
    const f = frame();
    const parts = [];

    step.ticks.forEach((tick, i) => {
      const y = f.y(tick);
      parts.push(line('grid', f.left, y, f.right, y));
      parts.push(text(f.left - 8, y, step.tickLabels[i], 'text-anchor="end" dominant-baseline="middle"'));
    });

    // Años en los eneros, con la separación que permita el ancho
    const pxPerMonth = (f.right - f.left) / Math.max(1, f.count - 1);
    const yearStep = Math.ceil(Math.ceil(MIN_TICK_GAP_PX / pxPerMonth) / 12);
    for (let i = data.firstJanuary; i < f.count; i += 12) {
      const year = data.firstYear + (i - data.firstJanuary) / 12;
      if (year % yearStep !== 0) continue;
      parts.push(line('grid', f.x(i), f.top, f.x(i), f.bottom));
      parts.push(text(f.x(i), f.bottom + 16, String(year), 'text-anchor="middle"'));
    }

    if (hover !== null) parts.push(line('crosshair', f.x(hover), f.top, f.x(hover), f.bottom));

    SERIES.forEach((name, s) => {
      if (!visible[s]) return;
      const points = step.series[s].map((v, i) => `${f.x(i).toFixed(1)},${f.y(v).toFixed(1)}`).join(' ');
      parts.push(`<polyline class="series series-${name}" points="${points}"/>`);
    });

    const yGoal = f.y(step.target);
    if (yGoal >= f.top && yGoal <= f.bottom) {
      // Bajo la línea, salvo que choque con los años del eje
      const below = yGoal + 18 <= f.bottom;
      const baseline = below ? 'dominant-baseline="hanging"' : '';
      parts.push(line('goal-line', f.left, yGoal, f.right, yGoal));
      parts.push(text(f.left + 4, below ? yGoal + 4 : yGoal - 4, step.goal, `class="goal-label" ${baseline}`));
    }

    // Mes en que cada serie visible alcanza la meta; la etiqueta va arriba a la izquierda (las curvas suben).
    // En el mes 0 la meta ya está cumplida: lo dice la cifra de meta y no se marca.
    step.crossings.forEach((index, s) => {
      if (!index || !visible[s]) return;
      const x = f.x(index);
      const y = f.y(step.series[s][index]);
      const label = data.months[index];
      const fitsLeft = x - 8 - label.length * LABEL_CHAR_PX >= f.left;
      const attrs = `class="crossing-${SERIES[s]}" text-anchor="${fitsLeft ? 'end' : 'start'}"`;
      parts.push(dot(x, y, SERIES[s]), text(fitsLeft ? x - 8 : x + 8, y - 8, label, attrs));
    });

    if (hover !== null) {
      const index = hover;
      SERIES.forEach((name, s) => {
        if (visible[s]) parts.push(dot(f.x(index), f.y(step.series[s][index]), name));
      });
    }

    svg.innerHTML = parts.join('');
    drawTooltip(f);
  }

  /** @param {ReturnType<typeof frame>} f */
  function drawTooltip(f) {
    tooltip.hidden = hover === null;
    if (hover === null) return;
    const index = hover;
    const lines = [el('p', undefined, data.months[index])];
    for (const s of [1, 0]) {
      if (visible[s]) lines.push(el('p', `tip-${SERIES[s]}`, PEN_INTEGER.format(step.series[s][index])));
    }
    tooltip.replaceChildren(...lines);
    const x = f.x(index);
    const fitsRight = x + 12 + tooltip.offsetWidth <= f.width;
    tooltip.style.left = `${fitsRight ? x + 12 : x - 12 - tooltip.offsetWidth}px`;
    const ys = step.series.map((values) => f.y(values[index])).filter((_, s) => visible[s]);
    const middle = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    const top = Math.min(Math.max(middle - tooltip.offsetHeight / 2, 0), f.height - tooltip.offsetHeight);
    tooltip.style.top = `${top}px`;
  }

  function selectStep() {
    step = data.steps[Number(range.value)];
    hover = null; // las series cambian de largo entre metas: un índice anterior puede quedar fuera
    output.textContent = step.goal;
    range.setAttribute('aria-valuetext', step.goal);
    const without = step.crossings[0] ? ` Sin aportes: ${data.months[step.crossings[0]]}.` : '';
    chart.setAttribute('aria-label', `Proyección hacia ${step.goal}. Con aportes: ${step.date}.${without}`);
    range.style.setProperty('--fill', `${(Number(range.value) / Number(range.max)) * 100}%`);
    if (goalKpi) {
      const label = goalKpi.querySelector('.kpi-label');
      const value = goalKpi.querySelector('.kpi-value');
      const bar = goalKpi.querySelector('.kpi-progress');
      const date = goalKpi.querySelector('.kpi-note .num');
      if (label) label.textContent = step.label;
      if (value) value.textContent = step.value;
      if (date) date.textContent = step.date;
      if (bar instanceof HTMLElement) {
        bar.setAttribute('aria-label', step.label);
        bar.setAttribute('aria-valuenow', String(Math.round(step.progress)));
        const fill = bar.firstElementChild;
        if (fill instanceof HTMLElement) fill.style.width = `${step.progress}%`;
      }
    }
    draw();
  }

  range.addEventListener('input', selectStep);

  document.querySelectorAll('.legend-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const s = Number(button.getAttribute('data-series'));
      if (visible[s] && visible.filter(Boolean).length === 1) return; // siempre queda una serie
      visible[s] = !visible[s];
      button.setAttribute('aria-pressed', String(visible[s]));
      draw();
    });
  });

  chart.addEventListener('pointermove', (event) => {
    const f = frame();
    const box = chart.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const inside = x >= f.left && x <= f.right && y >= f.top && y <= f.bottom;
    const index = inside ? Math.round(((x - f.left) / (f.right - f.left)) * (f.count - 1)) : null;
    if (index !== hover) {
      hover = index;
      draw();
    }
  });
  chart.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });

  new ResizeObserver(draw).observe(chart);
  selectStep();
}

function initContracts() {
  const rows = document.getElementById('contract-rows');
  const filter = /** @type {HTMLInputElement | null} */ (document.getElementById('contract-filter'));
  const clear = document.getElementById('clear-filter');
  if (!rows || !filter || !clear) return;

  const segments = Array.from(document.querySelectorAll('.segment'));
  let tab = 'pending';

  /** @param {string} text */
  const fold = (text) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  /** @param {Contract} c @param {string} t */
  const inTab = (c, t) => t === 'all' || (t === 'paid') === c.paid;

  /** @param {Contract} contract */
  function row(contract) {
    const name = el('span', 'client-name', contract.client);
    name.title = contract.client;
    const meta = el('span', 'client-meta num');
    if (contract.risk) meta.append(el('span', `risk risk-${contract.riskTone}`, contract.risk));
    meta.append(contract.code);
    const client = el('td');
    client.append(name, meta);

    const date = el('td', 'num', contract.date);
    if (contract.days) {
      const days = el('span', contract.overdue ? 'date-rel is-overdue' : 'date-rel', contract.days);
      days.title = data.daysTitle;
      date.append(days);
    }

    const tr = el('tr');
    tr.append(client, date, el('td', 'align-right num', contract.gainLabel));
    return tr;
  }

  function render() {
    const term = fold(filter.value);
    const matching = data.contracts.filter((c) => !term || c.key.includes(term));

    for (const button of segments) {
      const t = button.getAttribute('data-tab') ?? '';
      const list = matching.filter((c) => inTab(c, t));
      button.classList.toggle('active', t === tab);
      button.setAttribute('aria-pressed', String(t === tab));
      const count = button.querySelector('[data-count]');
      const sum = button.querySelector('[data-sum]');
      if (count) count.textContent = String(list.length);
      if (sum) sum.textContent = PEN.format(list.reduce((total, c) => total + c.gain, 0));
    }
    filter.closest('th')?.classList.toggle('has-value', term.length > 0);
    clear.hidden = term.length === 0;

    // Pendientes: el próximo pago primero; pagados y total: lo más reciente primero
    const list = matching.filter((c) => inTab(c, tab)).sort((a, b) => (tab === 'pending' ? a.t - b.t : b.t - a.t));
    if (list.length) {
      rows.replaceChildren(...list.map(row));
    } else {
      const cell = el('td', undefined, term ? 'Sin resultados' : 'Sin contratos');
      cell.colSpan = 3;
      const empty = el('tr', 'empty-row');
      empty.append(cell);
      rows.replaceChildren(empty);
    }
  }

  const clearFilter = () => {
    filter.value = '';
    filter.focus();
    render();
  };

  segments.forEach((button) =>
    button.addEventListener('click', () => {
      tab = button.getAttribute('data-tab') ?? 'pending';
      render();
    }),
  );
  filter.addEventListener('input', render);
  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && filter.value) {
      event.preventDefault();
      clearFilter();
    }
  });
  clear.addEventListener('click', clearFilter);
  render();
}

initChart();
initContracts();
