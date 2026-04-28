import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

interface ChartInitData {
  report: {
    netPen: number;
    netUsd: number;
    annualRatePct: number;
  };
  injection: number;
  fxRate: number;
  goalInitial: number;
}

function formatCompact(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + 'K';
  }
  return COMPACT_INTEGER_FORMATTER.format(num);
}

const COMPACT_INTEGER_FORMATTER = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const PEN_INTEGER_FORMATTER = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});
const CHART_FONT_FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function computeProjection(report: ChartInitData['report'], fxRate: number, injection: number, goal: number) {
  const annualRatePct = Number.isFinite(report.annualRatePct) ? Math.max(report.annualRatePct, -99) : 0;
  const targetGoal = Number.isFinite(goal) && goal > 0 ? goal : 0;
  const rMonthly = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  let withoutInj = report.netPen + report.netUsd * fxRate;
  let withInj = withoutInj;
  const labels: string[] = [];
  const seriesA: number[] = [];
  const seriesB: number[] = [];
  let month = 0;
  const startYear = new Date().getFullYear();

  while ((withInj < targetGoal || month % 12 !== 0) && month < 600) {
    if (month % 12 === 0) {
      labels.push(String(startYear + month / 12));
      seriesA.push(Math.round(withoutInj));
      seriesB.push(Math.round(withInj));
    }
    withoutInj *= 1 + rMonthly;
    withInj = withInj * (1 + rMonthly) + injection;
    month++;
  }
  labels.push(String(startYear + month / 12));
  seriesA.push(Math.round(withoutInj));
  seriesB.push(Math.round(withInj));

  return { labels, seriesA, seriesB };
}

function initChart() {
  const dataEl = document.getElementById('chart-data');
  if (!dataEl?.textContent) return;

  let initData: ChartInitData;
  try {
    initData = JSON.parse(dataEl.textContent) as ChartInitData;
  } catch {
    return;
  }

  const { report, injection, fxRate, goalInitial } = initData;

  const ctx = document.getElementById('proyeccion-chart') as HTMLCanvasElement | null;
  if (!ctx) return;

  const styles = getComputedStyle(document.documentElement);
  const textColor100 = styles.getPropertyValue('--color-text-100').trim();
  const textColor200 = styles.getPropertyValue('--color-text-200').trim();
  const textColor300 = styles.getPropertyValue('--color-text-300').trim();
  const accentMain000 = styles.getPropertyValue('--color-accent-main-000').trim();
  const accentMain100 = styles.getPropertyValue('--color-accent-main-100').trim();
  const bgColor000 = styles.getPropertyValue('--color-bg-000').trim();

  const computeData = (goal: number) => computeProjection(report, fxRate, injection, goal);

  const { labels, seriesA, seriesB } = computeData(goalInitial);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sin Aportes',
          data: seriesA,
          borderColor: textColor100,
          backgroundColor: `${textColor100}1A`,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: textColor100,
          pointBorderColor: bgColor000,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: textColor100,
          pointHoverBorderColor: bgColor000
        },
        {
          label: 'Con Aportes',
          data: seriesB,
          borderColor: accentMain000,
          backgroundColor: `${accentMain000}1A`,
          tension: 0.3,
          borderWidth: 3,
          pointBackgroundColor: accentMain000,
          pointBorderColor: bgColor000,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: accentMain100,
          pointHoverBorderColor: bgColor000
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: bgColor000,
          titleColor: textColor100,
          bodyColor: textColor200,
          borderColor: textColor300,
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          titleFont: { family: CHART_FONT_FAMILY, size: 13, weight: 700 },
          bodyFont: { family: CHART_FONT_FAMILY, size: 12 },
          footerFont: { family: CHART_FONT_FAMILY, size: 10 },
          footerColor: textColor300,
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: (context) => {
              const formatted = PEN_INTEGER_FORMATTER.format(Number(context.parsed.y ?? 0));
              return `${context.dataset.label}: ${formatted}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor200,
            font: { family: CHART_FONT_FAMILY, size: 11, weight: 600 },
            callback: function (value) {
              return this.getLabelForValue(value as number).slice(-2);
            }
          },
          grid: { color: `${textColor200}1A` }
        },
        y: {
          ticks: {
            color: textColor200,
            font: { family: CHART_FONT_FAMILY, size: 11, weight: 600 },
            callback: (value) => formatCompact(Number(value))
          },
          grid: { color: `${textColor200}1A` }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });

  const range = document.getElementById('goalRange') as HTMLInputElement | null;
  const label = document.getElementById('goalValue');

  if (range && label) {
    let pendingFrame = 0;

    const updateGoal = () => {
      const goal = Number(range.value);
      const valueLabel = `S/ ${formatCompact(goal)}`;
      label.textContent = valueLabel;
      range.setAttribute('aria-valuetext', valueLabel);
      const d = computeData(goal);
      chart.data.labels = d.labels;
      chart.data.datasets[0].data = d.seriesA;
      chart.data.datasets[1].data = d.seriesB;
      chart.update('none');
      range.setAttribute('aria-busy', 'false');
      pendingFrame = 0;
    };

    const initialGoalLabel = `S/ ${formatCompact(Number(range.value))}`;
    label.textContent = initialGoalLabel;
    range.setAttribute('aria-valuetext', initialGoalLabel);
    range.addEventListener('input', () => {
      range.setAttribute('aria-busy', 'true');
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(updateGoal);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChart);
} else {
  initChart();
}
