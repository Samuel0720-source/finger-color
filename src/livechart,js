import Chart from 'chart.js/auto';

const FINGER_COLORS = {
  thumb: '#f59e0b',
  index: '#10b981',
  middle: '#2563eb',
  ring: '#8b5cf6',
  pinky: '#ec4899',
};
const MAX_POINTS = 1800;

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
      scales: {
        x: { title: { display: true, text: 'Minutes' }, ticks: { maxTicksLimit: 6 } },
        y: { beginAtZero: true, title: { display: true, text: 'Change score' } },
      },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
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