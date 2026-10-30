import Chart from 'chart.js/auto';

const FINGER_COLORS = {
  thumb: '#f59e0b',
  index: '#10b981',
  middle: '#2563eb',
  ring: '#8b5cf6',
  pinky: '#ec4899',
};
const MAX_POINTS = 1800;
const MUTED = '#64748b';
const GRID = 'rgba(100, 116, 139, 0.15)';

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 12;

let chart = null;

export function createChart(canvas) {
  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: Object.entries(FINGER_COLORS).map(([name, color]) => ({
        label: name[0].toUpperCase() + name.slice(1),
        data: [],
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: 'Minutes', color: MUTED },
          ticks: { maxTicksLimit: 6, color: MUTED },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 10,
          title: { display: true, text: 'Change score', color: MUTED },
          ticks: { color: MUTED },
          grid: { color: GRID },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, color: MUTED } },
      },
    },
  });
}

export function addPoint(seconds, scores) {
  if (!chart) return;
  chart.data.labels.push((seconds / 60).toFixed(1));
  chart.data.datasets.forEach((dataset, i) => dataset.data.push(scores[i]));
  if (chart.data.labels.length > MAX_POINTS) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((dataset) => dataset.data.shift());
  }
  chart.update('none');
}

export function resetChart() {
  if (!chart) return;
  chart.data.labels = [];
  chart.data.datasets.forEach((dataset) => (dataset.data = []));
  chart.update('none');
}

export function chartImage() {
  return chart ? chart.toBase64Image('image/png', 1) : null;
}
