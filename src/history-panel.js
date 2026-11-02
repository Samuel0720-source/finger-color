import { Chart, FOCUS } from './chart-theme.js';
import { loadHistory } from './history.js';
import { downloadRows } from './recorder.js';

// Completed camera measurements. Older methods stay in the table and CSV but are not charted with new ones.
const TESTS = {
  color: { name: 'Color recovery', unit: 'min', label: 'Middle finger recovery time (min)', current: 3 },
  catching: { name: 'Finger catching', unit: 'catches', label: 'Catches per movement test', current: 4 },
  tapping: { name: 'Thumb tapping (retired)', unit: 'taps/s', label: '', current: null },
};
const MODE_TEST = { raynaud: 'color', trigger: 'catching', carpal: null };

function format(s) {
  const t = TESTS[s.test];
  if (s.result === null || s.result === undefined) return s.test === 'color' ? 'Not back to normal' : '–';
  if (s.test === 'color') return s.result < 1 ? `${Math.round(s.result * 60)} s` : `${Number(s.result).toFixed(1)} min`;
  return `${s.test === 'catching' ? s.result : Number(s.result).toFixed(1)} ${t.unit}`;
}

export function createHistoryPanel() {
  const $ = (id) => document.getElementById(id);
  const tbody = $('history-body');
  const emptyEl = $('history-empty');
  const titleEl = $('history-chart-title');
  const chartWrap = $('history-chart-wrap');
  const gridEl = $('history-grid');
  const btnCsv = $('history-csv');
  let mode = 'raynaud';

  const chart = new Chart($('history-chart'), {
    type: 'line',
    data: { labels: [], datasets: [] },
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
    if (!list.length) return;
    downloadRows(
      list.map((s) => ({ saved_at: s.savedAt, test: s.test, result: s.result ?? '', unit: TESTS[s.test]?.unit ?? '', method_version: s.algorithm ?? 1, hand: s.context?.hand || '' })),
      'finger-color_history.csv'
    );
  };

  function render() {
    const list = loadHistory();
    emptyEl.classList.toggle('hidden', list.length > 0);
    gridEl.classList.toggle('hidden', list.length === 0);
    btnCsv.disabled = list.length === 0;
    tbody.innerHTML = list
      .slice(-10)
      .reverse()
      .map((s) => {
        const t = TESTS[s.test];
        const old = t.current !== null && s.algorithm !== t.current ? ' <span class="muted">(older method)</span>' : '';
        return `<tr><td>${new Date(s.savedAt).toLocaleString()}</td><td>${t.name}${s.context?.hand ? `, ${s.context.hand.toLowerCase()} hand` : ''}${old}</td><td>${format(s)}</td></tr>`;
      })
      .join('');

    const test = MODE_TEST[mode];
    const mine = test ? list.filter((s) => s.test === test && s.algorithm === TESTS[test].current && Number.isFinite(s.result)) : [];
    chartWrap.classList.toggle('hidden', mine.length < 2);
    titleEl.textContent = !test ? 'Carpal tunnel results are not charted. Download your report after each check instead.' : mine.length < 2 ? `Chart appears after 2 ${TESTS[test].name.toLowerCase()} measurements.` : `${TESTS[test].label}, ${mine.length} measurements`;
    chart.data.labels = mine.map((s) => new Date(s.savedAt).toLocaleDateString());
    chart.data.datasets = [{ data: mine.map((s) => s.result), borderColor: FOCUS, backgroundColor: FOCUS, pointRadius: 4, borderWidth: 2 }];
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
