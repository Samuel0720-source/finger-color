import Chart from 'chart.js/auto';
import { PIP, pipAngles } from '../angles.js';
import { FINGER_CHAINS, drawChain, drawDot } from '../draw.js';
import { summarizeFinger, OPEN_ANGLE, CLOSED_ANGLE } from './trigger-test.js';
import { downloadRows } from '../recorder.js';
import { saveSession } from '../history.js';

const FINGERS = Object.keys(PIP); // index, middle, ring, pinky
const COLORS = { index: '#10b981', middle: '#2563eb', ring: '#8b5cf6', pinky: '#ec4899' };
const NAMES = { index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const TARGET_CYCLES = 10;
const MAX_MS = 60000;
const CHART_EVERY_MS = 100;
const EXTRA_MS = 500; // keep recording a little after the last cycle so the smoothed angle also reaches 'open'

export function createTriggerPanel({ setStatus, setBusy, onSaved, fileName }) {
  const $ = (id) => document.getElementById(id);
  const btnStart = $('trig-start');
  const btnCsv = $('trig-csv');
  const liveEl = $('trig-live');
  const resultEl = $('trig-result');

  let running = false;
  let t0 = 0;
  let samples = []; // { t, index, middle, ring, pinky }
  let bent = false;
  let cycles = 0;
  let lastChart = 0;
  let lastSummary = null;
  let stopAt = null;

  const chart = new Chart($('trig-chart'), {
    type: 'line',
    data: {
      datasets: FINGERS.map((f) => ({
        label: NAMES[f],
        data: [],
        borderColor: COLORS[f],
        backgroundColor: COLORS[f],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.2,
      })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Seconds' }, grid: { display: false } },
        y: { suggestedMin: 60, suggestedMax: 180, title: { display: true, text: 'Middle joint angle (°)' } },
      },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } },
    },
  });

  btnStart.onclick = () => (running ? stop() : start());
  btnCsv.onclick = () => {
    if (!lastSummary) return;
    const rows = samples.map((s) => ({
      t_ms: s.t.toFixed(0),
      index_deg: s.index.toFixed(1),
      middle_deg: s.middle.toFixed(1),
      ring_deg: s.ring.toFixed(1),
      pinky_deg: s.pinky.toFixed(1),
    }));
    downloadRows(rows, fileName('catching') + '_angles.csv');
  };

  function start() {
    running = true;
    samples = [];
    bent = false;
    cycles = 0;
    stopAt = null;
    t0 = performance.now();
    chart.data.datasets.forEach((d) => (d.data = []));
    chart.update('none');
    btnStart.textContent = 'Stop Test';
    btnStart.classList.add('btn-recording');
    btnCsv.disabled = true;
    resultEl.className = 'result muted';
    resultEl.textContent = 'Testing... make a fist slowly, then open fully. Repeat.';
    setBusy(true);
    setStatus(`Make a fist and open it ${TARGET_CYCLES} times. Keep your whole hand in view.`);
  }

  function stop() {
    running = false;
    setBusy(false);
    btnStart.textContent = 'Start Test';
    btnStart.classList.remove('btn-recording');
    if (samples.length < 30) {
      resultEl.className = 'result muted';
      resultEl.textContent = 'Not enough data. Keep your hand in view and try again.';
      setStatus('Test stopped.');
      return;
    }
    const times = samples.map((s) => s.t);
    const perFinger = {};
    for (const f of FINGERS) perFinger[f] = summarizeFinger(times, samples.map((s) => s[f]));
    lastSummary = perFinger;
    showResult(perFinger);
    drawFinalChart(times, perFinger);
    btnCsv.disabled = false;
    const totalCatches = FINGERS.reduce((sum, f) => sum + perFinger[f].catches.length, 0);
    saveSession({ test: 'catching', result: totalCatches, cycles: perFinger.middle.cycles });
    onSaved();
    setStatus('Test finished.');
  }

  function showResult(perFinger) {
    const total = FINGERS.reduce((sum, f) => sum + perFinger[f].catches.length, 0);
    const rows = FINGERS.map((f) => {
      const r = perFinger[f];
      return `<tr><td>${NAMES[f]}</td><td>${r.cycles}</td><td>${r.rangeDeg.toFixed(0)}°</td>
        <td>${r.maxOpenSpeed.toFixed(0)}°/s</td><td class="${r.catches.length ? 'flag' : ''}">${r.catches.length}</td></tr>`;
    }).join('');
    const note =
      total === 0
        ? 'No catching was found. Every finger opened smoothly.'
        : 'A catch means the finger stopped partway, then snapped open. If this happens often or hurts, talk to a clinician.';
    resultEl.className = 'result';
    resultEl.innerHTML = `
      <div class="result-label">Catches found</div>
      <div class="result-big">${total}</div>
      <p class="result-note">${note}</p>
      <table class="mini-table">
        <thead><tr><th>Finger</th><th>Cycles</th><th>Range</th><th>Fastest opening</th><th>Catches</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function drawFinalChart(times, perFinger) {
    chart.data.datasets = FINGERS.map((f) => ({
      label: NAMES[f],
      data: perFinger[f].smoothed.map((a, i) => ({ x: times[i] / 1000, y: a })),
      borderColor: COLORS[f],
      backgroundColor: COLORS[f],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.2,
    }));
    const marks = FINGERS.flatMap((f) => perFinger[f].catches.map((c) => ({ x: c.t / 1000, y: c.angle })));
    if (marks.length) {
      chart.data.datasets.push({
        label: 'Catch',
        type: 'scatter',
        data: marks,
        pointRadius: 7,
        pointStyle: 'crossRot',
        borderColor: '#b91c1c',
        borderWidth: 3,
      });
    }
    chart.update('none');
  }

  function onFrame(hand, now, octx) {
    if (!hand) {
      if (running) liveEl.textContent = 'Hand not found. Move your whole hand into view.';
      return;
    }
    const angles = pipAngles(hand.world);

    // Draw each finger: green when straight, orange when bent.
    for (const f of FINGERS) {
      const color = angles[f] > OPEN_ANGLE ? '#22c55e' : angles[f] < CLOSED_ANGLE ? '#f97316' : '#facc15';
      drawChain(octx, hand.image, FINGER_CHAINS[f], color);
      drawDot(octx, hand.image[PIP[f][1]], color);
    }

    if (!running) {
      liveEl.textContent = `Middle finger joint: ${angles.middle.toFixed(0)}°`;
      return;
    }

    const t = now - t0;
    samples.push({ t, ...angles });

    // Live cycle count on the middle finger (same two limits as countCycles).
    if (!bent && angles.middle < CLOSED_ANGLE) bent = true;
    else if (bent && angles.middle > OPEN_ANGLE) {
      bent = false;
      cycles++;
    }
    liveEl.textContent = `Middle finger joint: ${angles.middle.toFixed(0)}° · Cycles ${cycles} / ${TARGET_CYCLES}`;

    if (now - lastChart > CHART_EVERY_MS) {
      lastChart = now;
      FINGERS.forEach((f, i) => chart.data.datasets[i].data.push({ x: t / 1000, y: angles[f] }));
      chart.update('none');
    }

    if (cycles >= TARGET_CYCLES && stopAt === null) stopAt = t + EXTRA_MS;
    if ((stopAt !== null && t >= stopAt) || t > MAX_MS) stop();
  }

  return {
    enable() {
      btnStart.disabled = false;
    },
    isRunning: () => running,
    onFrame,
  };
}
