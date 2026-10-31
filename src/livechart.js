import { Chart, lineStyle, MUTED } from './chart-theme.js';
import { NORMAL_LIMIT } from './plain.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const MAX_POINTS = 1800;

let chart = null;

export function createChart(canvas) {
  chart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        ...FINGERS.map((name) => ({
          label: name[0].toUpperCase() + name.slice(1),
          data: [],
          spanGaps: true,
          ...lineStyle(name === 'middle'),
        })),
        {
          label: 'Visible change',
          data: [],
          borderColor: MUTED,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          order: 2,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          suggestedMax: 5,
          title: { display: true, text: 'Minutes since recording started' },
          ticks: { maxTicksLimit: 7, callback: (v) => Number(v).toFixed(0) },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 10,
          title: { display: true, text: 'Color change from normal' },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true } },
      },
    },
  });
}

export function addPoint(seconds, scores) {
  if (!chart) return;
  const x = seconds / 60;
  FINGERS.forEach((_, i) => chart.data.datasets[i].data.push({ x, y: scores[i] }));
  chart.data.datasets[FINGERS.length].data = [
    { x: 0, y: NORMAL_LIMIT },
    { x: Math.max(5, x), y: NORMAL_LIMIT },
  ];
  if (chart.data.datasets[0].data.length > MAX_POINTS) {
    FINGERS.forEach((_, i) => chart.data.datasets[i].data.shift());
  }
  chart.update('none');
}

export function resetChart() {
  if (!chart) return;
  chart.data.datasets.forEach((dataset) => (dataset.data = []));
  chart.update('none');
}

export function chartImage() {
  return chart ? chart.toBase64Image('image/png', 1) : null;
}
