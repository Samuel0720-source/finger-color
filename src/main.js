import './style.css';
import { startCamera, tryLockCamera } from './camera.js';
import { loadHandModel, findFingertips } from './hand.js';
import { averageRGB, toLinear, correctWithCard, linearToLab } from './color.js';
import * as rec from './recorder.js';
import { describeChange, renderFingers } from './plain.js';
import { createChart, addPoint, resetChart, chartImage } from './livechart.js';
import { computeRecovery } from './recovery.js';
import { makeReport } from './report.js';

const CARD_BOX = 40;
const SAMPLE_EVERY_MS = 1000;
const BASELINE_SECONDS = 10;
const BASELINE_KEY = 'finger-color-baseline';
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });
const statusEl = $('status');
const timerEl = $('timer');
const fingersEl = $('fingers');
const resultEl = $('result');
const baselineInfo = $('baseline-info');
const tempInput = $('temp-input');
const btnCamera = $('btn-camera');
const btnBaseline = $('btn-baseline');
const btnRecord = $('btn-record');
const btnWarm = $('btn-warm');
const btnTemp = $('btn-temp');
const btnPdf = $('btn-pdf');
const btnCsv = $('btn-csv');

let cardPos = null;
let lastSample = 0;
let baseline = loadBaseline();
let baselineBuffer = null;
let timerId = null;
let lastResult = null;
let recordedSeconds = 0;
let usedCard = false;

window.onerror = (msg) => {
  statusEl.textContent = 'Error: ' + msg;
};
window.onunhandledrejection = (e) => {
  statusEl.textContent = 'Error: ' + e.reason;
};

createChart($('chart'));
updateBaselineInfo();
renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));

// ---------- Camera ----------

btnCamera.onclick = async () => {
  btnCamera.disabled = true;
  statusEl.textContent = 'Loading camera and hand model...';
  try {
    const track = await startCamera(video);
    const lockMsg = await tryLockCamera(track);
    await loadHandModel();
    work.width = overlay.width = video.videoWidth;
    work.height = overlay.height = video.videoHeight;
    statusEl.textContent = lockMsg + '. Show your palm to the camera.';
    btnBaseline.disabled = false;
    btnRecord.disabled = false;
    requestAnimationFrame(loop);
  } catch (e) {
    statusEl.textContent = 'Camera error: ' + e.message;
    btnCamera.disabled = false;
  }
};

overlay.onclick = (e) => {
  const rect = overlay.getBoundingClientRect();
  cardPos = {
    x: (e.clientX - rect.left) * (overlay.width / rect.width),
    y: (e.clientY - rect.top) * (overlay.height / rect.height),
  };
  statusEl.textContent = 'Grey card position saved.';
};

// ---------- Main loop ----------

function loop(now) {
  try {
    wctx.drawImage(video, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const spots = findFingertips(video, now);

    if (cardPos) drawBox(cardPos.x, cardPos.y, CARD_BOX, 'yellow');
    if (spots) {
      for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
    }

    if (spots && now - lastSample > SAMPLE_EVERY_MS) {
      lastSample = now;
      sample(spots);
    }
  } catch (e) {
    statusEl.textContent = 'Loop error: ' + e.message;
  }
  requestAnimationFrame(loop);
}

function sample(spots) {
  const palmPixel = averageRGB(wctx, spots.palm.x, spots.palm.y, spots.palm.size);
  const palmLab = linearToLab(toLinear(palmPixel));
  const card = cardPos ? averageRGB(wctx, cardPos.x, cardPos.y, CARD_BOX) : null;

  const current = {};
  for (const name of FINGERS) {
    const p = spots[name];
    const pixel = averageRGB(wctx, p.x, p.y, p.size);
    const raw = linearToLab(toLinear(pixel));
    current[name] = {
      raw,
      lab: card ? linearToLab(correctWithCard(pixel, card)) : null,
      d: { L: raw.L - palmLab.L, a: raw.a - palmLab.a, b: raw.b - palmLab.b },
    };
  }

  if (baselineBuffer) collectBaseline(current);

  const views = FINGERS.map((name) => {
    if (!baseline) return { name, diff: null, change: null };
    const base = baseline.fingers[name];
    const d = current[name].d;
    const diff = { L: d.L - base.L, a: d.a - base.a, b: d.b - base.b };
    return { name, diff, change: describeChange(diff) };
  });
  renderFingers(fingersEl, views);

  if (rec.isRecording()) {
    for (const view of views) rec.addRow(makeRow(view, current[view.name], card));
    addPoint(rec.elapsed(), views.map((v) => (v.change ? v.change.score : null)));
  }
}

function makeRow(view, c, card) {
  const f = (x) => x.toFixed(2);
  return {
    finger: view.name,
    raw_L: f(c.raw.L),
    raw_a: f(c.raw.a),
    raw_b: f(c.raw.b),
    L: c.lab ? f(c.lab.L) : '',
    a: c.lab ? f(c.lab.a) : '',
    b: c.lab ? f(c.lab.b) : '',
    palm_dL: f(c.d.L),
    palm_da: f(c.d.a),
    palm_db: f(c.d.b),
    change_L: view.diff ? f(view.diff.L) : '',
    change_a: view.diff ? f(view.diff.a) : '',
    change_b: view.diff ? f(view.diff.b) : '',
    change_score: view.change ? f(view.change.score) : '',
    label: view.change ? view.change.label : '',
    card_r: card ? card.r.toFixed(1) : '',
    card_g: card ? card.g.toFixed(1) : '',
    card_b: card ? card.b.toFixed(1) : '',
  };
}

// ---------- Normal color (baseline) ----------

btnBaseline.onclick = () => {
  baselineBuffer = [];
  btnBaseline.disabled = true;
  statusEl.textContent = 'Keep your hand still...';
};

function collectBaseline(current) {
  baselineBuffer.push(current);
  const left = BASELINE_SECONDS - baselineBuffer.length;
  if (left > 0) {
    statusEl.textContent = `Saving your normal color... keep still (${left} s)`;
    return;
  }

  const fingers = {};
  for (const name of FINGERS) {
    const ds = baselineBuffer.map((s) => s[name].d);
    fingers[name] = {
      L: mean(ds.map((d) => d.L)),
      a: mean(ds.map((d) => d.a)),
      b: mean(ds.map((d) => d.b)),
    };
  }
  const m = fingers.middle;
  const scores = baselineBuffer.map((s) =>
    Math.hypot(s.middle.d.L - m.L, s.middle.d.a - m.a, s.middle.d.b - m.b)
  );

  baseline = { savedAt: new Date().toISOString(), fingers, noise: mean(scores) + 2 * std(scores) };
  saveBaseline(baseline);
  baselineBuffer = null;
  btnBaseline.disabled = false;
  updateBaselineInfo();
  statusEl.textContent = 'Normal color saved.';
}

function loadBaseline() {
  try {
    const text = localStorage.getItem(BASELINE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function saveBaseline(value) {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private mode). The baseline still works until the page closes.
  }
}

function updateBaselineInfo() {
  if (!baseline) {
    baselineInfo.textContent = 'No normal color saved yet. Save it while your hands are warm.';
    return;
  }
  const when = new Date(baseline.savedAt).toLocaleString();
  baselineInfo.textContent = `Normal color saved ${when}. Save it again if the light or place changes.`;
}

// ---------- Recording ----------

btnRecord.onclick = () => (rec.isRecording() ? stopRecording() : startRecording());

function startRecording() {
  if (!baseline) {
    const ok = confirm('You have not saved your normal color yet. Results and the PDF need it. Record anyway?');
    if (!ok) return;
  }
  rec.startRecording();
  resetChart();
  lastResult = null;
  btnRecord.textContent = 'Stop Recording';
  btnRecord.classList.add('btn-recording');
  btnWarm.disabled = false;
  btnTemp.disabled = false;
  btnPdf.disabled = true;
  btnCsv.disabled = true;
  resultEl.className = 'result muted';
  resultEl.textContent = 'Recording...';
  timerEl.classList.remove('hidden');
  timerId = setInterval(updateTimer, 500);
  statusEl.textContent = 'Recording. Press "I\'m Back in the Warm" as soon as you sit down.';
}

function stopRecording() {
  recordedSeconds = rec.elapsed();
  usedCard = cardPos !== null;
  rec.stopRecording();
  clearInterval(timerId);
  timerEl.classList.add('hidden');
  btnRecord.textContent = 'Start Recording';
  btnRecord.classList.remove('btn-recording');
  btnWarm.disabled = true;
  btnTemp.disabled = true;
  btnCsv.disabled = false;
  lastResult = baseline ? computeRecovery(rec.getRows(), rec.getEvents(), baseline.noise) : null;
  showResult(lastResult);
  btnPdf.disabled = !lastResult;
  statusEl.textContent = 'Recording stopped.';
}

function updateTimer() {
  const s = Math.floor(rec.elapsed());
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
}

btnWarm.onclick = () => {
  rec.addEvent('warm_start');
  btnWarm.disabled = true;
  statusEl.textContent = 'Got it. Keep your hand still and log your finger temperature every minute.';
};

btnTemp.onclick = () => {
  if (tempInput.value === '') return;
  rec.addEvent('finger_temp_c', tempInput.value);
  statusEl.textContent = `Logged ${tempInput.value} °C`;
  tempInput.value = '';
};

// ---------- Results ----------

function showResult(r) {
  if (!r) {
    resultEl.className = 'result muted';
    resultEl.textContent = 'Save your normal color first to get results.';
    return;
  }
  if (!r.ok) {
    resultEl.className = 'result muted';
    resultEl.textContent = r.reason;
    return;
  }
  let note = 'Time for your middle finger to return to its normal color after you came back in the warm.';
  if (r.recoverySec === null) {
    note = 'Your middle finger did not return to its normal color before you stopped. Try recording longer.';
  } else if (r.startScore <= r.threshold) {
    note = 'Your finger was already close to normal when you came in, so this number may be too small.';
  }
  resultEl.className = 'result';
  resultEl.innerHTML = `
    <div class="result-label">Recovery time</div>
    <div class="result-big">${headlineText(r)}</div>
    <p class="result-note">${note}</p>`;
}

function headlineText(r) {
  if (!r.ok) return r.reason;
  if (r.recoverySec === null) return 'Not back to normal yet';
  return `${(r.recoverySec / 60).toFixed(1)} minutes`;
}

function fingerSummary(rows, finger, tWarm) {
  const list = rows.filter((r) => r.finger === finger && r.change_score !== '' && Number(r.t) >= tWarm);
  if (list.length === 0) return { name: finger, peak: 0, endScore: 0, endLabel: '-' };
  const scores = list.map((r) => Number(r.change_score));
  const last = list[list.length - 1];
  return { name: finger, peak: Math.max(...scores), endScore: Number(last.change_score), endLabel: last.label };
}

btnPdf.onclick = () => {
  const name = prompt('Report name', todayName('recovery'));
  if (!name) return;
  const rows = rec.getRows();
  const events = rec.getEvents();
  const warm = events.find((e) => e.type === 'warm_start');
  const tWarm = warm ? Number(warm.t) : 0;
  makeReport({
    name,
    date: new Date().toLocaleString(),
    durationSec: recordedSeconds,
    mode: usedCard ? 'Grey card + palm reference' : 'Palm reference',
    headline: headlineText(lastResult),
    pattern: null,
    chartImg: chartImage(),
    fingers: FINGERS.map((f) => fingerSummary(rows, f, tWarm)),
    temps: events
      .filter((e) => e.type === 'finger_temp_c')
      .map((e) => ({ min: (Number(e.t) - tWarm) / 60, value: e.value })),
  });
};

btnCsv.onclick = () => {
  const name = prompt('File name', todayName('recovery'));
  if (name) rec.downloadCSV(name);
};

function todayName(prefix) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${mm}${dd}`;
}

// ---------- Helpers ----------

function drawBox(x, y, size, color) {
  octx.strokeStyle = color;
  octx.lineWidth = 3;
  octx.strokeRect(x - size / 2, y - size / 2, size, size);
}

function mean(list) {
  return list.reduce((sum, x) => sum + x, 0) / list.length;
}

function std(list) {
  const m = mean(list);
  return Math.sqrt(list.reduce((sum, x) => sum + (x - m) ** 2, 0) / (list.length - 1));
}