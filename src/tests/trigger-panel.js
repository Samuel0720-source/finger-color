import {repeatSummary} from '../research.js';
import {sessionContext} from '../session.js';
import { Chart, lineStyle, ALERT } from '../chart-theme.js';
import { PIP, pipAngles } from '../angles.js';
import { FINGER_CHAINS, drawChain, drawDot } from '../draw.js';
import { summarizeFinger, OPEN_ANGLE, CLOSED_ANGLE } from './trigger-test.js';
import { downloadRows } from '../recorder.js';
import { currentGuidance } from '../guidance.js';
import { saveSession, loadHistory } from '../history.js';

const FINGERS = Object.keys(PIP); // index, middle, ring, pinky
const NAMES = { index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const TARGET_CYCLES = 10;
const MAX_MS = 60000;
const CHART_EVERY_MS = 100;
const EXTRA_MS = 500; // keep recording a little after the last cycle so the smoothed angle also reaches 'open'

export function createTriggerPanel({ setStatus, setBusy, onSaved, fileName }) {
  const $ = (id) => document.getElementById(id);
  const btnStart = $('trig-start');
  const btnCsv = $('trig-csv');
  const btnPdf = $('trig-pdf');
  let report = null;
  const liveEl = $('trig-live');
  const resultEl = $('trig-result');

  let running = false;
  let preparing = false;
  let readyAt = null;
  let context = {};
  let startedAt = null;
  let t0 = 0;
  let samples = []; // { t, index, middle, ring, pinky }
  let bent = false;
  let cycles = 0;
  let lastChart = 0;
  let lastSummary = null;
  let stopAt = null;
  let trackingLost = false;
  let lastTracked = 0;
  let maxFrameGap = 0;

  const chart = new Chart($('trig-chart'), {
    type: 'line',
    data: {
      datasets: FINGERS.map((f) => ({ label: NAMES[f], data: [], ...lineStyle(f === 'middle') })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Seconds' }, grid: { display: false } },
        y: { suggestedMin: 60, suggestedMax: 180, title: { display: true, text: 'Middle joint angle (degrees)' } },
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

  btnPdf.onclick = async () => {
    if (!report) return;
    btnPdf.disabled = true;
    try { const { makeMovementReport } = await import('../movement-report.js'); makeMovementReport({ ...report, repeat:repeatSummary(loadHistory(),context,'catching'), guidance: currentGuidance('catching') }); }
    catch (e) { setStatus('PDF could not be created. Try again: ' + e.message); }
    finally { btnPdf.disabled = false; }
  };

  function start() {
    report = null;
    btnPdf.disabled = true;
    running = true;preparing=true;readyAt=null;context=sessionContext();startedAt=new Date().toLocaleString();
    samples = [];
    bent = false;
    cycles = 0;
    stopAt = null;
    trackingLost = false;
    lastTracked = 0;
    maxFrameGap = 0;
    t0 = performance.now();
    chart.data.datasets = FINGERS.map(f => ({ label: NAMES[f], data: [], ...lineStyle(f === 'middle') }));
    chart.update('none');
    btnStart.textContent = 'Stop test';
    btnStart.classList.add('btn-recording');
    btnCsv.disabled = true;
    resultEl.className = 'result muted';
    resultEl.textContent = 'Testing. Your result appears here when the 10 cycles are done.';
    setBusy(true);
    setStatus(`Hold your hand open, then make a fist and open it ${TARGET_CYCLES} times. Keep your whole hand in view.`);
  }

  function stop() {
    running = false;preparing=false;
    setBusy(false);
    btnStart.textContent = 'Start test';
    btnStart.classList.remove('btn-recording');
    if (performance.now() - t0 - lastTracked > 500) trackingLost = true;
    report = {test:'catching',name:fileName('catching'),date:startedAt,measurementContext:context,status:'Not scored',metrics:[['Completed middle-finger cycles',cycles]],explanation:'This recording is incomplete. No disease conclusion or catch score is available.',events:[]};
    btnPdf.disabled = false;
    if (samples.length < 30) {
      resultEl.className = 'result muted';
      resultEl.textContent = 'Not enough data. Keep your hand in view and try again.';
      setStatus('Test stopped.');
      return;
    }
    const frameRate = (samples.length - 1) * 1000 / (samples.at(-1).t - samples[0].t);
    report.metrics.push(['Tracked frames',samples.length],['Observed frame rate',frameRate.toFixed(1)+' fps'],['Largest frame gap',maxFrameGap.toFixed(0)+' ms']);
    if (cycles < TARGET_CYCLES || trackingLost || frameRate < 25 || maxFrameGap > 100) {
      lastSummary = {};
      btnCsv.disabled = false;
      resultEl.className = 'result muted';
      resultEl.textContent = 'Not scored: complete 10 cycles with continuous tracking at 25+ frames/second and no gaps over 100 ms. Low frame rates can miss rapid opening. Try better light and close other apps. Raw angles and an incomplete-attempt PDF are available.';
      setStatus('Test needs another attempt.');
      return;
    }
    const times = samples.map((s) => s.t);
    const perFinger = {};
    for (const f of FINGERS) perFinger[f] = summarizeFinger(times, samples.map((s) => s[f]));
    lastSummary = perFinger;
    showResult(perFinger);
    drawFinalChart(times, perFinger);
    btnCsv.disabled = false;
    report.status = 'Usable recording';
    report.metrics = [...report.metrics,...FINGERS.map(f => [NAMES[f], `${perFinger[f].cycles} cycles; ${perFinger[f].catches.length} flagged finger-events; ${perFinger[f].rangeDeg.toFixed(0)} degree range`])];
    report.explanation = 'A flagged finger-event is a brief pause followed by rapid opening in the estimated joint angle. Events are summed across four fingers: three events do not mean three affected fingers, three episodes, or disease severity. Voluntary pauses and tracking errors can produce this pattern. Thumb catching is not measured.';
    report.events = FINGERS.flatMap(f => perFinger[f].catches.map(c => `${NAMES[f]} at ${(c.t/1000).toFixed(2)} s: pause ${c.pauseMs.toFixed(0)} ms, then opened ${c.deltaDeg.toFixed(1)} degrees in ${c.snapMs.toFixed(0)} ms.`));
    report.chartImg = chart.toBase64Image('image/png',1);
    const totalCatches = FINGERS.reduce((sum, f) => sum + perFinger[f].catches.length, 0);
    const saved = saveSession({ test: 'catching', algorithm: 3, result: totalCatches, cycles: perFinger.middle.cycles, context, perFinger:Object.fromEntries(FINGERS.map(f=>[f,{cycles:perFinger[f].cycles,events:perFinger[f].catches.length}])) });
    const repeat=document.createElement('p');repeat.className='hint small';repeat.textContent=repeatSummary(loadHistory(),context,'catching').lines.join(' ');resultEl.append(repeat);
    onSaved();
    setStatus(saved ? 'Test finished.' : 'Test finished. Browser storage is unavailable; download your results.');
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
        ? 'No catch-like events detected in the recorded movement. This does not rule out a problem.'
        : 'The camera flagged pauses followed by rapid opening. If it happens often or hurts, show this result to a clinician.';
    resultEl.className = 'result';
    resultEl.innerHTML = `
      <div class="result-label">Flagged finger-events (not a diagnosis)</div>
      <div class="result-big">${total}</div>
      <p class="result-note">${note}</p>
      <p class="result-note">${total} means ${total} detected pause-and-release patterns summed across four fingers. It is not the number of affected fingers or a severity grade. Intentional pauses and camera jitter can also trigger a flag. Thumb catching is not measured.</p>
      <p class="quality-pill">Recording checks passed · 10 middle-finger cycles</p><div class="table-scroll"><table class="mini-table">
        <thead><tr><th>Finger</th><th>Fist cycles</th><th>Bend range</th><th>Fastest opening</th><th>Flags</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <details class="advanced"><summary>Why were events flagged?</summary>
      <p class="hint">Rule: less than 8° change for at least 150 ms in mid-bend, followed by at least 25° opening within 120 ms. These experimental thresholds are not clinical criteria.</p>
      <ul>${FINGERS.flatMap(f => perFinger[f].catches.map(c => `<li>${NAMES[f]} · ${(c.t/1000).toFixed(2)} s: paused ${c.pauseMs.toFixed(0)} ms, then opened ${c.deltaDeg.toFixed(1)}° in ${c.snapMs.toFixed(0)} ms.</li>`)).join('') || '<li>No events met the rule.</li>'}</ul></details>`;
  }

  function drawFinalChart(times, perFinger) {
    chart.data.datasets = FINGERS.map((f) => ({
      label: NAMES[f],
      data: perFinger[f].smoothed.map((a, i) => ({ x: times[i] / 1000, y: a })),
      ...lineStyle(f === 'middle'),
    }));
    const marks = FINGERS.flatMap((f) => perFinger[f].catches.map((c) => ({ x: c.t / 1000, y: c.angle })));
    if (marks.length) {
      chart.data.datasets.push({
        label: 'Catch',
        type: 'scatter',
        data: marks,
        pointRadius: 7,
        pointStyle: 'crossRot',
        borderColor: ALERT,
        order: -1,
        borderWidth: 3,
      });
    }
    chart.update('none');
  }

  function onFrame(hand, now, octx) {
    if (running && !preparing && (now - t0 >= MAX_MS || (stopAt !== null && now - t0 >= stopAt))) { stop(); return; }
    if (!hand) {
      if(preparing)readyAt=null;
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
      liveEl.textContent = `Middle finger joint ${angles.middle.toFixed(0)}°. Make a fist to see it change.`;
      return;
    }

    if(preparing){
      if(!FINGERS.every(f=>Number.isFinite(angles[f]))||angles.middle<OPEN_ANGLE){readyAt=null;liveEl.textContent='Hold your hand open, palm toward camera, to start the countdown.';return;}
      if(readyAt===null)readyAt=now;
      liveEl.textContent='Keep open · starting in '+Math.max(1,Math.ceil((3000-(now-readyAt))/1000));
      if(now-readyAt<3000)return;
      preparing=false;t0=now;setStatus('Bend and open comfortably. Stop if it hurts.');
    }
    if(!FINGERS.every(f=>Number.isFinite(angles[f])))return;
    const t = now - t0;
    if (t - lastTracked > 500) { trackingLost = true; bent = false; }
    if (samples.length) maxFrameGap = Math.max(maxFrameGap, t - lastTracked);
    lastTracked = t;
    samples.push({ t, ...angles });

    // Live cycle count on the middle finger (same two limits as countCycles).
    if (!bent && angles.middle < CLOSED_ANGLE) bent = true;
    else if (bent && angles.middle > OPEN_ANGLE) {
      bent = false;
      cycles++;
    }
    liveEl.textContent = `Cycle ${Math.min(cycles + 1, TARGET_CYCLES)} of ${TARGET_CYCLES}. Middle joint ${angles.middle.toFixed(0)}°`;

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
    tick(now) { if (running && now - t0 >= (preparing?30000:MAX_MS)) stop(); },
    cancel() {
      if (!running) return;
      running = false;preparing=false;
      setBusy(false);
      btnStart.textContent = 'Start test';
      btnStart.classList.remove('btn-recording');
      resultEl.textContent = 'Test interrupted. Start again with this page visible.';
    },
    isRunning: () => running,
    onFrame,
  };
}

