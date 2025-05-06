const chartConfig = {
  colors: {
    primary: {
      base: 'rgba(79, 133, 255, 1)',
      light: 'rgba(79, 133, 255, 0.2)'
    },
    secondary: {
      base: 'rgba(72, 187, 120, 1)',
      light: 'rgba(72, 187, 120, 0.2)'
    },
    text: 'rgba(160, 174, 192, 0.7)',
    grid: 'rgba(255, 255, 255, 0.05)'
  },
  fonts: {
    family: '"Inter", sans-serif',
    sizes: {
      small: 10,
      medium: 11,
      large: 12
    }
  },
  animation: {
    duration: 500,
    easing: 'easeOutQuart'
  }
};

function getBaseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 15, right: 15, bottom: 50, left: 5 } },
    animation: chartConfig.animation,
    scales: {
      x: {
        grid: { color: chartConfig.colors.grid },
        ticks: {
          color: chartConfig.colors.text,
          font: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.small },
          padding: 10
        },
        title: { display: false },
        afterFit: scale => {
          scale.paddingRight = 0;
          scale.paddingLeft = 0;
        }
      },
      y: {
        grid: { color: chartConfig.colors.grid },
        ticks: {
          color: chartConfig.colors.text,
          font: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.small },
          callback: value => formatUtils.compactNumber(value)
        },
        title: { display: false },
        grace: 0,
        afterFit: scale => {
          scale.paddingTop = 0;
          scale.paddingBottom = 0;
        }
      }
    },
    plugins: {
      tooltip: {
        backgroundColor: 'rgba(21, 28, 46, 0.9)',
        titleFont: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.large },
        bodyFont: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.medium },
        titleColor: 'rgba(224, 230, 241, 0.9)',
        bodyColor: 'rgba(160, 174, 192, 0.9)',
        usePointStyle: true,
        boxPadding: 6,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      },
      legend: { display: false }
    },
    elements: {
      line: { tension: 0.4, borderWidth: 2 },
      point: { radius: 3, hitRadius: 10, hoverRadius: 5, clip: false }
    }
  };
}

function createProjectionChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const options = getBaseChartOptions();

  options.scales.x.ticks.autoSkip = false;
  options.scales.x.ticks.callback = value => {
    const year = new Date().getFullYear() + parseInt(value);
    return year.toString().slice(-2);
  };
  options.scales.x.min = 0;
  options.scales.x.offset = false;

  options.scales.y.min = 0;
  options.scales.y.ticks.count = 7;
  options.scales.y.ticks.precision = 0;
  options.scales.y.transition = chartConfig.animation;

  options.plugins.tooltip.callbacks = {
    label: context => `${context.dataset.label || ''}: ${formatUtils.currency(context.raw)}`,
    title: context => {
      const year = new Date().getFullYear() + parseInt(context[0].label);
      return `${year}`;
    }
  };

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Proyección',
        data: data.standardValues,
        backgroundColor: chartConfig.colors.primary.light,
        borderColor: chartConfig.colors.primary.base,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        order: 1,
        fill: { target: 'origin', above: chartConfig.colors.primary.light },
        pointBackgroundColor: chartConfig.colors.primary.base
      },
      {
        label: 'Aporte',
        data: data.extraValues,
        backgroundColor: chartConfig.colors.secondary.light,
        borderColor: chartConfig.colors.secondary.base,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: { target: 0, above: chartConfig.colors.secondary.light },
        hidden: true,
        order: 2,
        pointBackgroundColor: chartConfig.colors.secondary.base
      }
    ]
  };

  const chart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options
  });

  const initialValue = chartData.datasets[0].data[0];
  const finalValue = chartData.datasets[0].data[chartData.datasets[0].data.length - 1];

  const totalRange = finalValue + initialValue;

  chart.options.scales.y.min = 0;
  chart.options.scales.y.max = totalRange;

  chart.update();

  createContributionToggle(chart, initialValue);

  return chart;
}

function createContributionToggle(chart, initialValue) {
  const legendContainer = document.querySelector('.chart-legend-container');
  if (!legendContainer) return;

  const toggleHTML = `
    <label class="toggle-switch" for="contribution-toggle">
      <input type="checkbox" id="contribution-toggle">
      <span class="toggle-slider"></span>
      <span class="toggle-label">Incluir aportes</span>
    </label>
  `;
  legendContainer.innerHTML = toggleHTML;

  const toggleInput = legendContainer.querySelector('#contribution-toggle');
  const datasetIndex = 1;

  chart.setDatasetVisibility(datasetIndex, false);
  chart.update();

  toggleInput.addEventListener('change', function() {
    const isVisible = this.checked;
    chart.setDatasetVisibility(datasetIndex, isVisible);

    let maxValue;

    if (isVisible) {
      const data1 = chart.data.datasets[0].data;
      const data2 = chart.data.datasets[1].data;
      maxValue = Math.max(Math.max(...data1), Math.max(...data2));
    } else {
      const data1 = chart.data.datasets[0].data;
      maxValue = Math.max(...data1);
    }

    const totalRange = maxValue + initialValue;
    chart.options.scales.y.min = 0;
    chart.options.scales.y.max = totalRange;

    chart.update({ duration: chartConfig.animation.duration, easing: chartConfig.animation.easing });
  });
}

function prepareProjectionData(capital, tasaAnual, years = 6) {
  const labels = Array.from({length: years + 1}, (_, i) => i);

  const standardValues = labels.map(year =>
    Number((capital * Math.pow(1 + tasaAnual / 100, year)).toFixed(2))
  );

  const aporteMensual = CONFIG.METAS.APORTE_MENSUAL;
  const extraValues = [capital];
  let valorConAportes = capital;
  const tasaMensual = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;

  for (let year = 1; year <= years; year++) {
    for (let mes = 1; mes <= 12; mes++) {
      valorConAportes += aporteMensual;
      valorConAportes *= (1 + tasaMensual);
    }
    extraValues.push(Number(valorConAportes.toFixed(2)));
  }

  return { labels, standardValues, extraValues };
}