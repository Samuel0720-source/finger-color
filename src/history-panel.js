import { Chart, FOCUS } from './chart-theme.js';
import { loadHistory } from './history.js';
import { downloadRows } from './recorder.js';

const TESTS = {
  color: { name: 'Color recovery', unit: 'min', label: 'Recovery time (min)' },
  catching: { name: 'Finger catching', unit: 'finger-events', label: 'Flagged finger-events per test' },
  tapping: { name: 'Thumb tapping', unit: 'taps/s', label: 'Taps per second' },
};

function format(s) {
  const t = TESTS[s.test];
  if (!t) return '';
  if (s.result === null || s.result === undefined) return 'Not back to normal';
  if (s.test === 'color' && s.result < 1) return `${Math.round(s.result * 60)} s`;
  const value = s.test === 'catching' ? String(s.result) : Number(s.result).toFixed(1);
  return `${value} ${t.unit}`;
}

export function createHistoryPanel() {
  const $ = (id) => document.getElementById(id);
  const tbody = $('history-body');
  const emptyEl = $('history-empty');
  const titleEl = $('history-chart-title');
  const chartWrap = $('history-chart-wrap');
  const gridEl = $('history-grid');
  const btnCsv = $('history-csv');
  let mode = 'color';

  const chart = new Chart($('history-chart'), {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: FOCUS, backgroundColor: FOCUS, borderWidth: 2, pointRadius: 4, spanGaps: true }] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
      plugins: { legend: { display: false } },
    },
  });

  btnCsv.onclick = () => {
    const list = loadHistory();
    if (list.length === 0) return;
    downloadRows(
      list.map((s) => ({ saved_at: s.savedAt, test: s.test, result: s.result ?? '', unit: TESTS[s.test]?.unit ?? '', algorithm: s.algorithm ?? 1 })),
      'finger-color_history.csv'
    );
  };

  function render() {
    const list = loadHistory();
    emptyEl.classList.toggle('hidden', list.length > 0);
    gridEl.classList.toggle('hidden', list.length === 0);
    btnCsv.disabled = list.length === 0;

    tbody.innerHTML = list
      .slice(-8)
      .reverse()
      .map((s) => `<tr><td>${new Date(s.savedAt).toLocaleString()}</td><td>${TESTS[s.test]?.name ?? s.test}${s.algorithm !== (s.test === 'color' ? 2 : 3) ? ' (legacy)' : ''}</td><td>${format(s)}</td></tr>`)
      .join('');

    const mine = list.filter((s) => s.test === mode && s.algorithm === (mode === 'color' ? 2 : 3));
    chartWrap.classList.toggle('hidden', mine.length === 0);
    titleEl.textContent =
      mine.length === 0
        ? `No current-method ${TESTS[mode].name.toLowerCase()} results yet. Older results remain in the table and CSV.`
        : `${TESTS[mode].label}, ${mine.length} session${mine.length === 1 ? '' : 's'}`;
    chart.data.labels = mine.map((s) => new Date(s.savedAt).toLocaleDateString());
    chart.data.datasets[0].data = mine.map((s) => (s.result === null || s.result === undefined ? null : Number(s.result)));
    chart.update('none');
  }

  return {
    render,
    setMode(m) {
      mode = m;
      render();
    },
  };
}

