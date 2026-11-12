import { Chart, lineStyle, ALERT } from '../chart-theme.js';
import { JOINTS, pipAngles } from '../angles.js';
import { FINGER_CHAINS, drawChain, drawDot } from '../draw.js';
import { summarizeFinger, cycleLimits, START_MIN_ANGLE } from './trigger-test.js';
import { downloadRows } from '../recorder.js';
import { saveSession } from '../history.js';

const FINGERS = Object.keys(JOINTS); // thumb, index, middle, ring, pinky
const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little' };
const TARGET_CYCLES = 10;
const MAX_MS = 60000;
const CHART_EVERY_MS = 100;
const EXTRA_MS = 500; // keep recording a little after the last cycle so the smoothed angle also reaches 'open'
const COUNTDOWN_MS = 3000;
const DIP_GRACE_MS = 400; // a short wobble below the start line does not restart the countdown

// Quality rules from the reliability review: a score needs 10 cycles, 25+ fps and no gap over 100 ms.
export const MIN_FPS = 25;
export const MAX_GAP_MS = 100;

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
}

export function createTriggerPanel({ setStatus, setBusy, onSaved, onResult, fileName, getContext }) {
  const $ = (id) => document.getElementById(id);
  const btnStart = $('trig-start');
  const btnCsv = $('trig-csv');
  const liveEl = $('trig-live');
  const detailEl = $('trig-detail');

  let running = false;
  let preparing = false;
  let readyAt = null;
  let lastOpenAt = 0;
  let openSamples = []; // angles seen during the countdown
  let openRef = {}; // each finger's own "open" angle, the median of the countdown
  let limits = cycleLimits(); // middle finger fist lines used for the live count
  let t0 = 0;
  let samples = [];
  let bent = false;
  let cycles = 0;
  let lastChart = 0;
  let stopAt = null;
  let trackingLost = false;
  let lastTracked = 0;
  let maxFrameGap = 0;
  let quality = null;

  const chart = new Chart($('trig-chart'), {
    type: 'line',
    data: { datasets: FINGERS.map((f) => ({ label: NAMES[f], data: [], ...lineStyle(f === 'middle') })) },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Seconds' }, grid: { display: false } },
        y: { suggestedMin: 60, suggestedMax: 180, title: { display: true, text: 'Joint angle (180° = straight)' } },
      },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } },
    },
  });

  btnStart.onclick = () => (running ? stop() : start());
  btnCsv.onclick = () => {
    if (!samples.length) return;
    downloadRows(samples.map((s) => ({ t_ms: s.t.toFixed(0), ...Object.fromEntries(FINGERS.map((f) => [f + '_deg', s[f].toFixed(1)])) })), fileName('catching') + '_angles.csv');
  };

  function start() {
    running = true;
    preparing = true;
    readyAt = null;
    openSamples = [];
    openRef = {};
    limits = cycleLimits();
    samples = [];
    bent = false;
    cycles = 0;
    stopAt = null;
    trackingLost = false;
    lastTracked = 0;
    maxFrameGap = 0;
    t0 = performance.now();
    chart.data.datasets = FINGERS.map((f) => ({ label: NAMES[f], data: [], ...lineStyle(f === 'middle') }));
    chart.update('none');
    btnStart.textContent = 'Stop test';
    btnStart.classList.add('btn-recording');
    btnCsv.disabled = true;
    detailEl.innerHTML = '';
    setBusy(true);
    setStatus(`Hold your hand open. Then make a fist and open it ${TARGET_CYCLES} times.`);
  }

  function finishRun() {
    running = false;
    preparing = false;
    setBusy(false);
    btnStart.textContent = 'Start test';
    btnStart.classList.remove('btn-recording');
  }

  function stop() {
    finishRun();
    if (performance.now() - t0 - lastTracked > 500) trackingLost = true;
    btnCsv.disabled = samples.length === 0;
    if (samples.length < 30) {
      quality = { ok: false, reason: 'Not enough tracked frames. Keep your whole hand in view and try again.' };
      showQuality();
      onResult(null);
      setStatus('Test stopped.');
      return;
    }
    const fps = ((samples.length - 1) * 1000) / (samples.at(-1).t - samples[0].t);
    quality = { ok: true, fps, maxFrameGap, cycles };
    if (cycles < TARGET_CYCLES || trackingLost || fps < MIN_FPS || maxFrameGap > MAX_GAP_MS) {
      quality.ok = false;
      quality.reason = `Not scored. The test needs ${TARGET_CYCLES} fist cycles with steady tracking at ${MIN_FPS}+ frames per second and no gap over ${MAX_GAP_MS} ms. This attempt: ${cycles} cycles, ${fps.toFixed(0)} fps, largest gap ${maxFrameGap.toFixed(0)} ms. Use brighter light and close other apps.`;
      showQuality();
      onResult(null);
      setStatus('Test needs another attempt.');
      return;
    }
    const times = samples.map((s) => s.t);
    const perFinger = {};
    for (const f of FINGERS) perFinger[f] = summarizeFinger(times, samples.map((s) => s[f]), cycleLimits(openRef[f]));
    showDetail(perFinger);
    drawFinalChart(times, perFinger);
    const totalCatches = FINGERS.reduce((sum, f) => sum + perFinger[f].catches.length, 0);
    const saved = saveSession({ test: 'catching', algorithm: 4, result: totalCatches, cycles, context: getContext() });
    onSaved();
    onResult({
      fingers: Object.fromEntries(FINGERS.map((f) => [f, { catches: perFinger[f].catches.length, maxAngle: perFinger[f].maxAngle, minAngle: perFinger[f].minAngle, cycles: perFinger[f].cycles }])),
      quality,
      events: FINGERS.flatMap((f) => perFinger[f].catches.map((c) => `${NAMES[f]} at ${(c.t / 1000).toFixed(1)} s: paused ${c.pauseMs.toFixed(0)} ms, then opened ${c.deltaDeg.toFixed(0)}° in ${c.snapMs.toFixed(0)} ms`)),
      chartImg: chart.toBase64Image('image/png', 1),
    });
    setStatus(saved ? 'Test finished. Your result is below.' : 'Test finished. Browser storage is unavailable; download your report.');
  }

  function showQuality() {
    detailEl.innerHTML = `<p class="quality-note">${quality.reason}</p>`;
  }

  function showDetail(perFinger) {
    const rows = FINGERS.map((f) => {
      const r = perFinger[f];
      return `<tr><th scope="row">${NAMES[f]}</th><td>${r.maxAngle.toFixed(0)}°</td><td>${r.minAngle.toFixed(0)}°</td><td>${r.cycles}</td><td class="${r.catches.length ? 'flag' : ''}">${r.catches.length}</td></tr>`;
    }).join('');
    detailEl.innerHTML = `
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Finger</th><th>Straightest</th><th>Most bent</th><th>Cycles</th><th>Catches</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="fine-print">Recording quality: ${quality.fps.toFixed(0)} fps, largest gap ${quality.maxFrameGap.toFixed(0)} ms, ${quality.cycles} middle-finger cycles. Your open hand read ${openRef.middle.toFixed(0)}° for the middle finger, so a fist counted below ${limits.closed.toFixed(0)}° and opening above ${limits.open.toFixed(0)}°. A catch is a pause of 150 ms or more in mid-bend (100 to 165°) followed by opening at least 25° within 120 ms. Engineering rule, not a clinical cut-off.</p>`;
  }

  function drawFinalChart(times, perFinger) {
    chart.data.datasets = FINGERS.map((f) => ({
      label: NAMES[f],
      data: perFinger[f].smoothed.map((a, i) => ({ x: times[i] / 1000, y: a })),
      ...lineStyle(f === 'middle'),
    }));
    const marks = FINGERS.flatMap((f) => perFinger[f].catches.map((c) => ({ x: c.t / 1000, y: c.angle })));
    if (marks.length) {
      chart.data.datasets.push({ label: 'Catch', type: 'scatter', data: marks, pointRadius: 7, pointStyle: 'crossRot', borderColor: ALERT, borderWidth: 3, order: -1 });
    }
    chart.update('none');
  }

  function onFrame(hand, now, octx) {
    if (running && !preparing && stopAt !== null && now - t0 >= stopAt) {
      stop();
      return;
    }
    if (!hand) {
      if (preparing) readyAt = null;
      if (running) liveEl.textContent = 'Hand not found. Move your whole hand into view.';
      return;
    }
    const angles = pipAngles(hand.world);

    for (const f of FINGERS) {
      const lim = cycleLimits(openRef[f]);
      const color = angles[f] > lim.open ? '#22c55e' : angles[f] < lim.closed ? '#f97316' : '#facc15';
      drawChain(octx, hand.image, FINGER_CHAINS[f], color);
      drawDot(octx, hand.image[JOINTS[f][1]], color);
    }

    if (!running) {
      liveEl.textContent = `Middle finger ${angles.middle.toFixed(0)}°, thumb ${angles.thumb.toFixed(0)}°. Make a fist to see them change.`;
      return;
    }
    if (preparing) {
      const open = FINGERS.every((f) => Number.isFinite(angles[f])) && angles.middle >= START_MIN_ANGLE;
      if (open) lastOpenAt = now;
      if (!open && (readyAt === null || now - lastOpenAt > DIP_GRACE_MS)) {
        readyAt = null;
        openSamples = [];
        liveEl.textContent = Number.isFinite(angles.middle)
          ? `Open your hand fully, palm toward the camera. Middle finger ${angles.middle.toFixed(0)}°; the countdown starts at ${START_MIN_ANGLE}°.`
          : 'Hold your hand open, palm toward the camera, to start the countdown.';
        return;
      }
      if (readyAt === null) readyAt = now;
      if (open) openSamples.push(angles);
      liveEl.textContent = 'Keep it open. Starting in ' + Math.max(1, Math.ceil((COUNTDOWN_MS - (now - readyAt)) / 1000));
      if (now - readyAt < COUNTDOWN_MS) return;
      for (const f of FINGERS) openRef[f] = median(openSamples.map((s) => s[f]));
      limits = cycleLimits(openRef.middle);
      preparing = false;
      t0 = now;
      setStatus('Bend and open at a comfortable speed. Stop if it hurts.');
    }
    if (!FINGERS.every((f) => Number.isFinite(angles[f]))) return;
    const t = now - t0;
    if (t - lastTracked > 500) {
      trackingLost = true;
      bent = false;
    }
    if (samples.length) maxFrameGap = Math.max(maxFrameGap, t - lastTracked);
    lastTracked = t;
    samples.push({ t, ...angles });

    if (!bent && angles.middle < limits.closed) bent = true;
    else if (bent && angles.middle > limits.open) {
      bent = false;
      cycles++;
    }
    liveEl.textContent = `Fist ${Math.min(cycles + 1, TARGET_CYCLES)} of ${TARGET_CYCLES}. Middle finger ${angles.middle.toFixed(0)}°`;

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
      liveEl.textContent = 'Show your hand to the camera.';
    },
    disable() {
      btnStart.disabled = true;
      liveEl.textContent = 'Start the camera first.';
    },
    tick(now) {
      if (running && now - t0 >= (preparing ? 30000 : MAX_MS)) stop();
    },
    cancel() {
      if (!running) return;
      finishRun();
      liveEl.textContent = 'Test interrupted. Start again with this page visible.';
    },
    isRunning: () => running,
    onFrame,
  };
}
