const chartConfig = {
  colors: {
    primary: {
      // Usar los mismos colores de acento definidos en CSS
      base: 'rgba(79, 133, 255, 1)', // var(--color-accent-primary)
      light: 'rgba(79, 133, 255, 0.2)'
    },
    secondary: {
      // Un color secundario que contraste bien en el tema oscuro
      base: 'rgba(72, 187, 120, 1)', // var(--color-positive)
      light: 'rgba(72, 187, 120, 0.2)'
    },
    // Usar colores de texto y rejilla definidos en CSS
    text: 'rgba(160, 174, 192, 0.7)', // var(--color-text-secondary) con opacidad
    grid: 'rgba(255, 255, 255, 0.05)' // var(--color-border) o similar
  },
  fonts: {
    family: '"Inter", sans-serif', // Mantener fuente
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
        grid: { color: chartConfig.colors.grid }, // Usar nuevo color de rejilla
        ticks: {
          color: chartConfig.colors.text, // Usar nuevo color de texto
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
        grid: { color: chartConfig.colors.grid }, // Usar nuevo color de rejilla
        ticks: {
          color: chartConfig.colors.text, // Usar nuevo color de texto
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
        backgroundColor: 'rgba(21, 28, 46, 0.9)', // Fondo de tooltip más oscuro (var(--color-bg-card) con opacidad)
        titleFont: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.large },
        bodyFont: { family: chartConfig.fonts.family, size: chartConfig.fonts.sizes.medium },
        titleColor: 'rgba(224, 230, 241, 0.9)', // var(--color-text-primary) con opacidad
        bodyColor: 'rgba(160, 174, 192, 0.9)', // var(--color-text-secondary) con opacidad
        usePointStyle: true,
        boxPadding: 6,
        borderColor: 'rgba(255, 255, 255, 0.1)', // Borde sutil para tooltip
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
  const options = getBaseChartOptions(); // Obtiene las nuevas opciones base

  // ... (configuración específica de escalas x/y como antes) ...
  options.scales.x.ticks.autoSkip = false;
  options.scales.x.ticks.callback = value => {
    const year = new Date().getFullYear() + parseInt(value);
    return year.toString().slice(-2);
  };
  options.scales.x.min = 0;
  options.scales.x.offset = false;

  // Ajustes iniciales para Y
  options.scales.y.min = 0; // Mantener el mínimo absoluto en 0 si es apropiado
  options.scales.y.ticks.count = 7;
  options.scales.y.ticks.precision = 0;
  // options.scales.y.grace = 0; // No usaremos grace, controlaremos con suggestedMin/Max
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
        backgroundColor: chartConfig.colors.primary.light, // Nuevo color
        borderColor: chartConfig.colors.primary.base, // Nuevo color
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        order: 1,
        fill: { target: 'origin', above: chartConfig.colors.primary.light }, // Nuevo color
        pointBackgroundColor: chartConfig.colors.primary.base // Nuevo color
      },
      {
        label: 'Aporte',
        data: data.extraValues,
        backgroundColor: chartConfig.colors.secondary.light, // Nuevo color
        borderColor: chartConfig.colors.secondary.base, // Nuevo color
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: { target: 0, above: chartConfig.colors.secondary.light }, // Nuevo color
        hidden: true,
        order: 2,
        pointBackgroundColor: chartConfig.colors.secondary.base // Nuevo color
      }
    ]
  };

  const chart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options // Usa las opciones actualizadas
  });

  // Calcular las escalas de forma simétrica
  const initialValue = chartData.datasets[0].data[0]; // Valor inicial (capital)
  const finalValue = chartData.datasets[0].data[chartData.datasets[0].data.length - 1]; // Valor final

  // El rango total debe ser: (finalValue - 0) + (initialValue - 0) = finalValue + initialValue
  // Para que haya simetría, initialValue debe estar a la misma distancia de 0 que finalValue del límite superior
  const totalRange = finalValue + initialValue;
  
  chart.options.scales.y.min = 0;
  chart.options.scales.y.max = totalRange;
  
  chart.update(); // Actualizar con los nuevos límites calculados

  createContributionToggle(chart, initialValue);

  return chart;
}

// Modificada para recibir initialValue para cálculos de simetría
function createContributionToggle(chart, initialValue) {
  const legendContainer = document.querySelector('.chart-legend-container');
  if (!legendContainer) return;

  // HTML para el interruptor (toggle switch) con texto simplificado
  const toggleHTML = `
    <label class="toggle-switch" for="contribution-toggle">
      <input type="checkbox" id="contribution-toggle">
      <span class="toggle-slider"></span>
      <span class="toggle-label">Incluir aportes</span>
    </label>
  `;
  legendContainer.innerHTML = toggleHTML;

  const toggleInput = legendContainer.querySelector('#contribution-toggle');
  const datasetIndex = 1; // Índice del dataset "Aporte"

  // Asegurarse de que el dataset de aporte esté oculto inicialmente
  chart.setDatasetVisibility(datasetIndex, false);
  chart.update(); // Actualizar gráfico para reflejar estado inicial

  toggleInput.addEventListener('change', function() {
    const isVisible = this.checked;
    chart.setDatasetVisibility(datasetIndex, isVisible);

    // Calcular límites para mantener la simetría visual
    let maxValue;
    
    if (isVisible) {
      // Considerar el máximo entre ambos datasets
      const data1 = chart.data.datasets[0].data;
      const data2 = chart.data.datasets[1].data;
      maxValue = Math.max(Math.max(...data1), Math.max(...data2));
      
      // Se eliminó el padding adicional del 5%
    } else {
      // Solo considerar el dataset principal
      const data1 = chart.data.datasets[0].data;
      maxValue = Math.max(...data1);
    }

    // Establecer el máximo para mantener simetría: initialValue abajo, maxValue arriba
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

  const aporteMensual = APORTE_MENSUAL;
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

function prepareCustomProjectionData(capital, tasaAnual, years = 6) {
  const labels = [0];
  const standardValues = [capital];
  const extraValues = [capital];
  const yearlyWithdrawals = [0];

  const aporteMensual = APORTE_MENSUAL;
  let capitalAcumulado = capital;
  let aporteTotal = 0;

  for (let year = 1; year <= years; year++) {
    labels.push(year);

    const valorEstandar = capital * Math.pow(1 + tasaAnual / 100, year);
    standardValues.push(Number(valorEstandar.toFixed(2)));

    let valorAnual = capitalAcumulado;
    const aporteAnual = aporteMensual * 12;
    aporteTotal += aporteAnual;

    valorAnual += aporteAnual;
    valorAnual *= Math.pow(1 + tasaAnual / 100, 1);

    const gananciaAnual = valorAnual - (capitalAcumulado + aporteAnual);
    yearlyWithdrawals.push(Number(gananciaAnual.toFixed(2)));

    capitalAcumulado += aporteAnual;
    extraValues.push(Number(capitalAcumulado.toFixed(2)));
  }

  return { labels, standardValues, extraValues, yearlyWithdrawals };
}