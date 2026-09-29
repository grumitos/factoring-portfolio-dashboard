import {
  CategoryScale,
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type Plugin
} from 'chart.js';
import { formatCompact, formatMonthYearShort, formatPenInteger, formatPercent } from '../lib/format';
import { monthsToGoal, projectMonthlyBalances, type ProjectionParams } from '../lib/projection';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

interface ChartInitData {
  report: {
    netPen: number;
    netUsd: number;
    annualRatePct: number;
  };
  injection: number;
  fxRate: number;
  goalInitial: number;
  maxHalfSteps: number;
}

interface Projection {
  months: Date[];
  /** [sin aportes, con aportes] */
  series: [number[], number[]];
  goal: number;
  /** Mes (índice) en que cada serie alcanza la meta, si cae dentro del gráfico */
  crossings: [number | null, number | null];
}

const SERIES_WITHOUT = 0;
const SERIES_WITH = 1;
const MAX_CHART_MONTHS = 600;
const MAX_GOAL_MULTIPLE = 2.5;
const MIN_TICK_GAP_PX = 56;
const Y_AXIS_ALLOWANCE_PX = 56;

function readTheme() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    surface: read('--color-surface', '#1A1917'),
    text000: read('--color-text-000', '#F2EFE8'),
    text100: read('--color-text-100', '#D9D5CB'),
    text300: read('--color-text-300', '#8C887F'),
    text400: read('--color-text-400', '#66625B'),
    accent: read('--color-accent', '#D97757'),
    line: read('--color-line', 'rgba(255, 255, 255, 0.06)'),
    lineStrong: read('--color-line-strong', 'rgba(255, 255, 255, 0.14)'),
    mono: read('--font-mono', 'monospace')
  };
}

/** Horizonte en meses: pasa el cruce de la meta con margen y termina en un enero */
function chartHorizon(crossing: number | null, startMonth: number): number {
  if (crossing === null) return MAX_CHART_MONTHS;
  const padded = crossing + Math.max(6, Math.round(crossing * 0.25));
  const toJanuary = (12 - ((startMonth + padded) % 12)) % 12;
  return Math.min(MAX_CHART_MONTHS, Math.max(12, padded + toJanuary));
}

function buildProjection(params: ProjectionParams, goal: number, maxHalfSteps: number): Projection {
  const withoutParams = { ...params, monthlyInjection: 0 };
  const toIndex = (months: number | null) => (months === null ? null : Math.round(months));
  const withIndex = toIndex(monthsToGoal(params, goal, maxHalfSteps));
  const withoutIndex = toIndex(monthsToGoal(withoutParams, goal, maxHalfSteps));
  const now = new Date();

  // Se extiende hasta el cruce sin aportes mientras la serie con aportes no pase de MAX_GOAL_MULTIPLE × meta,
  // para que la meta siga legible en el eje Y
  let horizon = chartHorizon(withIndex, now.getMonth());
  if (withIndex !== null && withoutIndex !== null && withoutIndex > withIndex) {
    const extended = chartHorizon(withoutIndex, now.getMonth());
    const overflow = projectMonthlyBalances(params, extended).findIndex((value) => value > goal * MAX_GOAL_MULTIPLE);
    horizon = overflow === -1 ? extended : Math.max(horizon, Math.min(extended, overflow));
  }
  const inRange = (index: number | null) => (index !== null && index <= horizon ? index : null);

  return {
    months: Array.from({ length: horizon + 1 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1)),
    series: [
      projectMonthlyBalances(withoutParams, horizon).map((value) => Math.round(value)),
      projectMonthlyBalances(params, horizon).map((value) => Math.round(value))
    ],
    goal,
    crossings: [inRange(withoutIndex), inRange(withIndex)]
  };
}

/** Años en el eje X, espaciados según el ancho disponible (null oculta el tick y su línea) */
function computeTickLabels(months: Date[], chartWidth: number): (string | null)[] {
  const pxPerMonth = Math.max(1, chartWidth - Y_AXIS_ALLOWANCE_PX) / Math.max(1, months.length - 1);
  const yearStep = Math.ceil(Math.ceil(MIN_TICK_GAP_PX / pxPerMonth) / 12);
  return months.map((date) =>
    date.getMonth() === 0 && date.getFullYear() % yearStep === 0 ? String(date.getFullYear()) : null
  );
}

function initChart() {
  const dataEl = document.getElementById('chart-data');
  const canvas = document.getElementById('proyeccion-chart') as HTMLCanvasElement | null;
  if (!dataEl?.textContent || !canvas) return;

  const data = JSON.parse(dataEl.textContent) as ChartInitData;
  const params: ProjectionParams = {
    startBalance: data.report.netPen + data.report.netUsd * data.fxRate,
    annualRatePct: data.report.annualRatePct,
    monthlyInjection: data.injection
  };
  const range = document.getElementById('goalRange') as HTMLInputElement | null;
  const output = document.getElementById('goalValue');

  const theme = readTheme();
  let projection = buildProjection(params, range ? Number(range.value) : data.goalInitial, data.maxHalfSteps);
  let tickCache: { key: string; labels: (string | null)[] } | null = null;

  const tickLabelsFor = (width: number) => {
    const key = `${Math.round(width)}|${projection.months.length}|${projection.months[0].getTime()}`;
    if (tickCache?.key !== key) tickCache = { key, labels: computeTickLabels(projection.months, width) };
    return tickCache.labels;
  };

  const monthLabels = (p: Projection) => p.months.map((date) => formatMonthYearShort(date));

  // Línea vertical en el mes bajo el cursor
  const crosshair: Plugin<'line'> = {
    id: 'crosshair',
    beforeDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements() ?? [];
      if (!active.length) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = theme.lineStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(active[0].element.x, chartArea.top);
      ctx.lineTo(active[0].element.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  // Línea de meta y, en cada serie visible, el mes en que la alcanza
  const goalMarker: Plugin<'line'> = {
    id: 'goalMarker',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      const yScale = scales.y;
      if (!chartArea || !xScale || !yScale) return;

      ctx.save();
      ctx.font = `500 11px ${theme.mono}`;

      const yGoal = yScale.getPixelForValue(projection.goal);
      if (yGoal >= chartArea.top && yGoal <= chartArea.bottom) {
        ctx.strokeStyle = theme.text400;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yGoal);
        ctx.lineTo(chartArea.right, yGoal);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = theme.text300;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`S/ ${formatCompact(projection.goal)}`, chartArea.left + 4, yGoal + 4);
      }

      ctx.textBaseline = 'bottom';
      projection.crossings.forEach((index, series) => {
        if (index === null || !chart.isDatasetVisible(series)) return;
        const x = xScale.getPixelForValue(index);
        const y = yScale.getPixelForValue(projection.series[series][index]);
        const color = series === SERIES_WITH ? theme.accent : theme.text300;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Las curvas suben hacia la derecha: arriba a la izquierda del punto queda libre
        const label = formatMonthYearShort(projection.months[index]);
        const fitsLeft = x - 6 - ctx.measureText(label).width >= chartArea.left;
        ctx.textAlign = fitsLeft ? 'right' : 'left';
        ctx.fillText(label, fitsLeft ? x - 6 : x + 6, y - 6);
      });

      ctx.restore();
    }
  };

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: monthLabels(projection),
      datasets: [
        {
          label: 'Sin aportes',
          data: projection.series[SERIES_WITHOUT],
          borderColor: theme.text300,
          borderWidth: 1.5,
          borderDash: [5, 4],
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 3.5,
          pointHoverBorderWidth: 0,
          pointHoverBackgroundColor: theme.text100
        },
        {
          label: 'Con aportes',
          data: projection.series[SERIES_WITH],
          borderColor: theme.accent,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 0,
          pointHoverBackgroundColor: theme.accent
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 8, right: 4 } },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        tooltip: {
          backgroundColor: theme.surface,
          borderColor: theme.lineStrong,
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          caretSize: 0,
          caretPadding: 10,
          titleColor: theme.text300,
          titleFont: { family: theme.mono, size: 11, weight: 500 },
          titleMarginBottom: 6,
          bodyColor: theme.text000,
          bodyFont: { family: theme.mono, size: 12 },
          bodySpacing: 4,
          boxWidth: 10,
          boxHeight: 2,
          boxPadding: 6,
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            title: (items) => (items.length ? formatMonthYearShort(projection.months[items[0].dataIndex]) : ''),
            label: (item) => formatPenInteger(Number(item.parsed.y)),
            labelColor: (item) => {
              const color = item.datasetIndex === SERIES_WITH ? theme.accent : theme.text300;
              return { borderColor: color, backgroundColor: color, borderWidth: 0 };
            }
          }
        }
      },
      scales: {
        x: {
          border: { display: false },
          grid: { color: theme.line, drawTicks: false },
          ticks: {
            color: theme.text400,
            font: { family: theme.mono, size: 11 },
            maxRotation: 0,
            autoSkip: false,
            padding: 8,
            callback(_value, index) {
              return tickLabelsFor(this.chart.width)[index] ?? null;
            }
          }
        },
        y: {
          grace: '5%',
          border: { display: false },
          grid: { color: theme.line, drawTicks: false },
          ticks: {
            color: theme.text400,
            font: { family: theme.mono, size: 11 },
            padding: 8,
            maxTicksLimit: 6,
            callback: (value) => formatCompact(Number(value))
          }
        }
      }
    },
    plugins: [crosshair, goalMarker]
  });

  // La celda de meta del resumen sigue a la meta elegida en el deslizador
  const goalKpi = document.querySelector<HTMLElement>('[data-kpi="goal"]');
  const syncGoalKpi = () => {
    if (!goalKpi) return;
    const pct = (params.startBalance / projection.goal) * 100;
    const clamped = Math.min(100, Math.max(0, pct));
    const label = `Meta S/ ${formatCompact(projection.goal)}`;
    const crossing = projection.crossings[SERIES_WITH];
    const labelEl = goalKpi.querySelector('.kpi-label');
    const valueEl = goalKpi.querySelector('.kpi-value');
    const progressEl = goalKpi.querySelector<HTMLElement>('.kpi-progress');
    const barEl = goalKpi.querySelector<HTMLElement>('.kpi-progress span');
    const dateEl = goalKpi.querySelector('.kpi-note .num');
    if (labelEl) labelEl.textContent = label;
    if (valueEl) valueEl.textContent = formatPercent(pct);
    if (barEl) barEl.style.width = `${clamped}%`;
    progressEl?.setAttribute('aria-valuenow', String(Math.round(clamped)));
    progressEl?.setAttribute('aria-label', label);
    if (dateEl) dateEl.textContent = crossing === null ? 'Fuera de alcance' : formatMonthYearShort(projection.months[crossing]);
  };

  if (range) {
    range.addEventListener('input', () => {
      const goal = Number(range.value);
      const min = Number(range.min);
      const max = Number(range.max);
      range.style.setProperty('--fill', `${max > min ? ((goal - min) / (max - min)) * 100 : 0}%`);
      if (output) output.textContent = `S/ ${formatCompact(goal)}`;
      projection = buildProjection(params, goal, data.maxHalfSteps);
      chart.data.labels = monthLabels(projection);
      chart.data.datasets[SERIES_WITHOUT].data = projection.series[SERIES_WITHOUT];
      chart.data.datasets[SERIES_WITH].data = projection.series[SERIES_WITH];
      chart.update('none');
      syncGoalKpi();
    });
  }

  document.querySelectorAll<HTMLButtonElement>('.legend-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.series);
      const visible = chart.isDatasetVisible(index);
      // Siempre queda al menos una serie visible
      if (visible && chart.getVisibleDatasetCount() === 1) return;
      chart.setDatasetVisibility(index, !visible);
      button.setAttribute('aria-pressed', String(!visible));
      chart.update('none');
    });
  });

  // El lienzo no se redibuja solo cuando termina de cargar la fuente web
  document.fonts?.ready.then(() => chart.update('none'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChart);
} else {
  initChart();
}
