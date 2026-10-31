import { createTapCounter, CLOSE, OPEN, MAX_RELIABLE_TAPS_PER_SEC } from './tap-test.js';
import { drawDot } from '../draw.js';
import { downloadRows } from '../recorder.js';
import { saveSession } from '../history.js';

const READY_MS = 3000;
const TEST_MS = 10000;

export function createTapPanel({ setStatus, setBusy, onSaved, fileName }) {
  const $ = (id) => document.getElementById(id);
  const btnStart = $('tap-start');
  const btnCsv = $('tap-csv');
  const liveEl = $('tap-live');
  const meterFill = $('tap-meter-fill');
  const resultEl = $('tap-result');

  let phase = 'idle'; // idle -> ready -> testing -> idle
  let tStart = 0;
  let counter = null;
  let last = null;

  btnStart.onclick = () => (phase === 'idle' ? start() : cancel());
  btnCsv.onclick = () => {
    if (!last) return;
    const rows = last.trace.map((r) => ({
      t_ms: r.t.toFixed(0),
      gap: r.gap.toFixed(3),
      tap: last.tapTimes.includes(r.t) ? 1 : 0,
    }));
    downloadRows(rows, fileName('tapping') + '_gap.csv');
  };

  function start() {
    phase = 'ready';
    tStart = performance.now();
    counter = createTapCounter();
    btnStart.textContent = 'Cancel';
    btnCsv.disabled = true;
    resultEl.className = 'result muted';
    resultEl.textContent = 'Get ready...';
    setBusy(true);
    setStatus('Hold your thumb and index finger apart, in view of the camera.');
  }

  function cancel() {
    phase = 'idle';
    setBusy(false);
    btnStart.textContent = 'Start 10-second Test';
    resultEl.className = 'result muted';
    resultEl.textContent = 'Cancelled.';
    setStatus('Test cancelled.');
  }

  function finish() {
    phase = 'idle';
    setBusy(false);
    btnStart.textContent = 'Start 10-second Test';
    last = counter.result(TEST_MS);
    btnCsv.disabled = false;

    const tooFast = last.tapsPerSec > MAX_RELIABLE_TAPS_PER_SEC;
    const rhythm = last.rhythmCV === null ? 'not enough taps' : `${last.rhythmCV.toFixed(0)} %`;
    resultEl.className = 'result';
    resultEl.innerHTML = `
      <div class="result-label">Taps in 10 seconds</div>
      <div class="result-big">${last.taps}</div>
      <div class="stat-row">
        <div><span>Speed</span><strong>${last.tapsPerSec.toFixed(1)} taps/s</strong></div>
        <div><span>Rhythm change (CV)</span><strong>${rhythm}</strong></div>
      </div>
      <p class="result-note">Lower rhythm change means a steadier rhythm. Compare with your own earlier results.
      ${tooFast ? '<br><b>Above 6 taps per second the camera may miss taps, so the real number may be higher.</b>' : ''}</p>`;
    saveSession({ test: 'tapping', result: Number(last.tapsPerSec.toFixed(2)), taps: last.taps });
    onSaved();
    setStatus('Test finished.');
  }

  function onFrame(hand, now, octx) {
    if (hand) {
      // gap is computed once per frame inside the counter while testing; here we only draw.
      const color = phase === 'testing' ? '#22c55e' : '#facc15';
      drawDot(octx, hand.image[4], color, 9);
      drawDot(octx, hand.image[8], color, 9);
      const { width: w, height: h } = octx.canvas;
      octx.strokeStyle = color;
      octx.lineWidth = 3;
      octx.beginPath();
      octx.moveTo(hand.image[4].x * w, hand.image[4].y * h);
      octx.lineTo(hand.image[8].x * w, hand.image[8].y * h);
      octx.stroke();
    }

    if (phase === 'idle') {
      liveEl.textContent = hand ? 'Hand found. Press Start when ready.' : 'Show your hand to the camera.';
      return;
    }

    const elapsed = now - tStart;
    if (phase === 'ready') {
      const left = Math.ceil((READY_MS - elapsed) / 1000);
      liveEl.textContent = `Starting in ${left}...`;
      if (elapsed >= READY_MS) {
        phase = 'testing';
        tStart = now;
        resultEl.textContent = 'Tap thumb and index finger together, as fast and as wide as you can!';
      }
      return;
    }

    // phase === 'testing'
    if (hand) {
      const r = counter.update(hand.world, elapsed);
      // Meter: 0% = touching, 100% = wide open (OPEN limit x 2)
      meterFill.style.width = `${Math.min(100, (r.gap / (OPEN * 2)) * 100)}%`;
      meterFill.classList.toggle('touching', r.gap < CLOSE);
      liveEl.textContent = `Taps: ${r.taps} · ${Math.max(0, (TEST_MS - elapsed) / 1000).toFixed(1)} s left`;
    } else {
      liveEl.textContent = 'Hand not found. Keep your hand in view!';
    }
    if (elapsed >= TEST_MS) finish();
  }

  return {
    enable() {
      btnStart.disabled = false;
    },
    isRunning: () => phase !== 'idle',
    onFrame,
  };
}
