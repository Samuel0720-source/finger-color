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
  let trackedMs = 0;
  let previousFrame = null;
  let previousTracked = false;
  let maxGap = 0;
  let lastTracked = 0;

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
    trackedMs = 0;
    previousFrame = null;
    previousTracked = false;
    maxGap = 0;
    lastTracked = 0;
    meterFill.style.width = '0%';
    btnStart.textContent = 'Cancel test';
    btnCsv.disabled = true;
    resultEl.className = 'result muted';
    resultEl.textContent = 'Get ready...';
    setBusy(true);
    setStatus('Hold your thumb and index finger apart, in view of the camera.');
  }

  function cancel() {
    if (phase === 'idle') return;
    phase = 'idle';
    setBusy(false);
    btnStart.textContent = 'Start 10-second test';
    resultEl.className = 'result muted';
    resultEl.textContent = 'Test cancelled. Start again when ready.';
    setStatus('Test cancelled.');
  }

  function finish() {
    phase = 'idle';
    setBusy(false);
    btnStart.textContent = 'Start 10-second test';
    last = counter.result(TEST_MS);
    btnCsv.disabled = last.trace.length === 0;
    maxGap = Math.max(maxGap, TEST_MS - lastTracked);
    if (trackedMs < TEST_MS * 0.9 || maxGap > 500 || last.trace.length < 150) {
      resultEl.className = 'result muted';
      resultEl.textContent = 'Tracking was incomplete or too slow. This test was not scored or saved. Keep your whole hand visible and try again. Raw samples are available.';
      setStatus('Test needs another attempt.');
      return;
    }

    const tooFast = last.tapsPerSec > MAX_RELIABLE_TAPS_PER_SEC;
    const rhythm = last.rhythmCV === null ? 'Not enough taps' : `${last.rhythmCV.toFixed(0)}% variation`;
    resultEl.className = 'result';
    resultEl.innerHTML = `
      <div class="result-label">Taps in 10 seconds</div>
      <div class="result-big">${last.taps}</div>
      <div class="stat-row">
        <div><span>Speed</span><strong>${last.tapsPerSec.toFixed(1)} taps/s</strong></div>
        <div><span>Rhythm steadiness</span><strong>${rhythm}</strong></div>
      </div>
      <p class="result-note">Lower variation means a steadier rhythm. Compare with your own history below, not with other people.
      ${tooFast ? '<br><b>Faster than 6 taps a second, the camera can miss taps, so your real count may be higher.</b>' : ''}</p>`;
    const saved = saveSession({ test: 'tapping', algorithm: 2, result: Number(last.tapsPerSec.toFixed(2)), taps: last.taps });
    onSaved();
    setStatus(saved ? 'Test finished.' : 'Test finished. Browser storage is unavailable; download your results.');
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
      liveEl.textContent = hand ? 'Hand found. Press start when ready.' : 'Show your hand to the camera.';
      return;
    }

    const elapsed = now - tStart;
    if (phase === 'ready') {
      if (!hand) {
        tStart = now;
        liveEl.textContent = 'Show your hand to start the countdown.';
        return;
      }
      const left = Math.ceil((READY_MS - elapsed) / 1000);
      liveEl.textContent = `Get ready. Starting in ${left}`;
      if (elapsed >= READY_MS) {
        phase = 'testing';
        tStart = now;
        resultEl.textContent = 'Go. Tap your thumb and index finger together, fast and wide.';
      }
      return;
    }

    // End before sampling: frames outside the ten-second window do not count.
    if (elapsed >= TEST_MS) { finish(); return; }
    if (previousFrame !== null && previousTracked && hand) trackedMs += Math.min(elapsed - previousFrame, 100);
    previousFrame = elapsed;
    previousTracked = Boolean(hand);
    if (hand) {
      maxGap = Math.max(maxGap, elapsed - lastTracked);
      lastTracked = elapsed;
      const r = counter.update(hand.world, elapsed);
      if (!r) { previousTracked = false; return; }
      // Meter: 0% = touching, 100% = wide open (OPEN limit x 2)
      meterFill.style.width = `${Math.min(100, (r.gap / (OPEN * 2)) * 100)}%`;
      meterFill.classList.toggle('touching', r.gap < CLOSE);
      liveEl.textContent = `${r.taps} taps. ${Math.max(0, (TEST_MS - elapsed) / 1000).toFixed(1)} s left`;
    } else {
      liveEl.textContent = 'Hand not found. Keep your hand in view!';
    }

  }

  return {
    enable() {
      btnStart.disabled = false;
    },
    disable() {
      btnStart.disabled = true;
      liveEl.textContent = 'Start the camera first.';
    },
    tick(now) { if (phase === 'testing' && now - tStart >= TEST_MS) finish(); },
    cancel,
    isRunning: () => phase !== 'idle',
    onFrame,
  };
}

