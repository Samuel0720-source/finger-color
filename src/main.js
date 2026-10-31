// Font served from this site (no request to Google). Variable width + weight.
import '@fontsource-variable/instrument-sans/wdth.css';
import './style.css';
import { startCamera, stopCamera, isFrontCamera, tryLockCamera } from './camera.js';
import { loadHandModel, detectHand, fingertipSpots } from './hand.js';
import { averageRGB, toLinear, correctWithCard, linearToLab } from './color.js';
import * as rec from './recorder.js';
import { describeChange, renderFingers } from './plain.js';
import { createChart, addPoint, resetChart, chartImage } from './livechart.js';
import { computeRecovery } from './recovery.js';
import { saveSession } from './history.js';
import { createHistoryPanel } from './history-panel.js';
import { createTriggerPanel } from './tests/trigger-panel.js';
import { createTapPanel } from './tests/tap-panel.js';

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
const btnCameraStart = $('btn-camera-start');
const btnBaseline = $('btn-baseline');
const btnRecord = $('btn-record');
const btnWarm = $('btn-warm');
const btnTemp = $('btn-temp');
const btnPdf = $('btn-pdf');
const btnCsv = $('btn-csv');
const stage = $('stage');
const stageEmpty = $('stage-empty');

let cardPos = null;
let lastSample = 0;
let baseline = loadBaseline();
let baselineBuffer = null;
let timerId = null;
let lastResult = null;
let recordedSeconds = 0;
let usedCard = false;
let wakeLock = null;
let cameraOn = false;
let mirrored = false;

window.onerror = (msg) => {
  statusEl.textContent = 'Error: ' + msg;
};
window.onunhandledrejection = (e) => {
  statusEl.textContent = 'Error: ' + e.reason;
};

createChart($('chart'));
updateBaselineInfo();
renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));

// ---------- Tests (tabs) ----------

const MODES = ['color', 'catching', 'tapping'];
let mode = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'color';
let busy = false; // true while any test is running, so the user cannot switch tests in the middle

const historyPanel = createHistoryPanel();
const panelOptions = {
  setStatus: (text) => (statusEl.textContent = text),
  setBusy: (value) => (busy = value),
  onSaved: () => historyPanel.render(),
  fileName: (prefix) => todayName(prefix),
};
const trigger = createTriggerPanel(panelOptions);
const tap = createTapPanel(panelOptions);

const tabs = document.querySelectorAll('.tab');
tabs.forEach((tab) => (tab.onclick = () => setMode(tab.dataset.mode)));
setMode(mode);

function setMode(next) {
  if (busy || rec.isRecording()) {
    statusEl.textContent = 'Finish or stop the current test first.';
    return;
  }
  mode = next;
  window.history.replaceState(null, '', '#' + mode);
  tabs.forEach((tab) => {
    const on = tab.dataset.mode === mode;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('[data-only]').forEach((el) => el.classList.toggle('hidden', el.dataset.only !== mode));
  historyPanel.setMode(mode);
}

// ---------- Camera ----------

btnCameraStart.onclick = () => turnCameraOn();
btnCamera.onclick = () => turnCameraOff();

async function turnCameraOn() {
  btnCameraStart.disabled = true;
  statusEl.textContent = 'Opening camera...';
  let lockMsg;
  let track;
  try {
    track = await startCamera(video);
    lockMsg = await tryLockCamera(track);
  } catch (e) {
    statusEl.textContent = `Could not open the camera (${e.message}). Allow camera access in your browser and try again.`;
    btnCameraStart.disabled = false;
    return;
  }

  mirrored = isFrontCamera(track);
  stage.classList.toggle('mirrored', mirrored);
  stage.classList.add('is-live');
  stageEmpty.classList.add('hidden');
  statusEl.textContent = 'Loading the hand model (about 8 MB, first time only)...';
  try {
    await loadHandModel();
  } catch (e) {
    stopCamera(video);
    stage.classList.remove('is-live');
    stageEmpty.classList.remove('hidden');
    statusEl.textContent = `Could not load the hand model (${e.message}). Check your internet connection and try again.`;
    btnCameraStart.disabled = false;
    return;
  }

  work.width = overlay.width = video.videoWidth;
  work.height = overlay.height = video.videoHeight;
  cameraOn = true;
  statusEl.textContent = lockMsg;
  markStep(1, 'active');
  btnCamera.classList.remove('hidden');
  btnCameraStart.disabled = false;
  btnBaseline.disabled = false;
  btnRecord.disabled = !baseline;
  trigger.enable();
  tap.enable();
  requestAnimationFrame(loop);
}

function turnCameraOff() {
  if (busy || rec.isRecording() || baselineBuffer) {
    statusEl.textContent = 'Finish or stop the current test first.';
    return;
  }
  cameraOn = false;
  stopCamera(video);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  stage.classList.remove('is-live');
  stageEmpty.classList.remove('hidden');
  btnCamera.classList.add('hidden');
  btnBaseline.disabled = true;
  btnRecord.disabled = true;
  trigger.disable();
  tap.disable();
  statusEl.textContent = 'Camera off.';
}

overlay.onclick = (e) => {
  if (mode !== 'color') return; // the grey card is only used by the color test
  const rect = overlay.getBoundingClientRect();
  // When the picture is shown as a mirror, the click's x has to be flipped back to the camera's x.
  const fromLeft = mirrored ? rect.right - e.clientX : e.clientX - rect.left;
  cardPos = {
    x: fromLeft * (overlay.width / rect.width),
    y: (e.clientY - rect.top) * (overlay.height / rect.height),
  };
  statusEl.textContent = 'Grey card marked. Its color will be used to correct the light.';
};

// ---------- Main loop ----------

// One loop for every test: run the hand model once per frame, then hand the result to the chosen test.
function loop(now) {
  if (!cameraOn) return;
  try {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const hand = detectHand(video, now);
    if (mode === 'color') colorFrame(hand, now);
    else if (mode === 'catching') trigger.onFrame(hand, now, octx);
    else tap.onFrame(hand, now, octx);
  } catch (e) {
    statusEl.textContent = 'Loop error: ' + e.message;
  }
  requestAnimationFrame(loop);
}

function colorFrame(hand, now) {
  wctx.drawImage(video, 0, 0); // only the color test needs the pixels
  const spots = hand ? fingertipSpots(hand.image, video.videoWidth, video.videoHeight) : null;

  if (cardPos) drawBox(cardPos.x, cardPos.y, CARD_BOX, 'yellow');
  if (spots) {
    for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
  }

  if (spots && now - lastSample > SAMPLE_EVERY_MS) {
    lastSample = now;
    sample(spots);
  }
}

function sample(spots) {
  const palmPixel = averageRGB(wctx, spots.palm.x, spots.palm.y, spots.palm.size);
  if (!palmPixel) return;
  const palmLab = linearToLab(toLinear(palmPixel));
  const card = cardPos ? averageRGB(wctx, cardPos.x, cardPos.y, CARD_BOX) : null;

  const current = {};
  for (const name of FINGERS) {
    const p = spots[name];
    const pixel = averageRGB(wctx, p.x, p.y, p.size);
    if (!pixel) return; // A fingertip is outside the picture. Skip this sample.
    const raw = linearToLab(toLinear(pixel));
    current[name] = {
      rgb: pixel,
      raw,
      lab: card ? linearToLab(correctWithCard(pixel, card)) : null,
      d: { L: raw.L - palmLab.L, a: raw.a - palmLab.a, b: raw.b - palmLab.b },
    };
  }

  if (baselineBuffer) collectBaseline(current);

  const views = FINGERS.map((name) => {
    const now = current[name].rgb;
    if (!baseline) return { name, diff: null, change: null, now };
    const base = baseline.fingers[name];
    const d = current[name].d;
    const diff = { L: d.L - base.L, a: d.a - base.a, b: d.b - base.b };
    return { name, diff, change: describeChange(diff), now, normal: base.rgb || null };
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
  btnBaseline.textContent = `Hold still... ${BASELINE_SECONDS} s`;
  statusEl.textContent = 'Keep your hand still with all five fingertips in view.';
};

function collectBaseline(current) {
  baselineBuffer.push(current);
  const left = BASELINE_SECONDS - baselineBuffer.length;
  if (left > 0) {
    btnBaseline.textContent = `Hold still... ${left} s`;
    return;
  }

  const fingers = {};
  for (const name of FINGERS) {
    const ds = baselineBuffer.map((s) => s[name].d);
    const px = baselineBuffer.map((s) => s[name].rgb);
    fingers[name] = {
      L: mean(ds.map((d) => d.L)),
      a: mean(ds.map((d) => d.a)),
      b: mean(ds.map((d) => d.b)),
      rgb: { r: mean(px.map((p) => p.r)), g: mean(px.map((p) => p.g)), b: mean(px.map((p) => p.b)) },
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
  btnRecord.disabled = false;
  updateBaselineInfo();
  statusEl.textContent = 'Normal color saved. You can start recording.';
}

function loadBaseline() {
  try {
    const text = localStorage.getItem(BASELINE_KEY);
    const value = text ? JSON.parse(text) : null;
    // A baseline saved by an older version of the app has a different shape. Ignore it.
    const valid = value && value.fingers && FINGERS.every((f) => value.fingers[f]) && Number.isFinite(value.noise);
    return valid ? value : null;
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
    baselineInfo.textContent = 'Not saved yet. Recording unlocks after this step.';
    return;
  }
  const when = new Date(baseline.savedAt).toLocaleString();
  baselineInfo.textContent = `Saved ${when}. Save again if the room or light changes.`;
  btnBaseline.textContent = 'Save normal color again';
  markStep(1, 'done');
}

// ---------- Recording ----------

btnRecord.onclick = () => (rec.isRecording() ? stopRecording() : startRecording());

function startRecording() {
  if (!baseline) return; // the button stays disabled until a normal color is saved
  rec.startRecording();
  // Save the noise level with the data so the Python analysis uses the same number as the app.
  if (baseline) rec.addEvent('baseline_noise', baseline.noise.toFixed(4));
  keepScreenOn();
  markStep(2, 'active');
  resetChart();
  lastResult = null;
  btnRecord.textContent = 'Stop recording';
  btnRecord.classList.add('btn-recording');
  btnWarm.disabled = false;
  btnTemp.disabled = false;
  btnPdf.disabled = true;
  btnCsv.disabled = true;
  resultEl.className = 'result muted';
  resultEl.textContent = 'Recording. Your result appears here when you stop.';
  timerEl.classList.remove('hidden');
  timerId = setInterval(updateTimer, 500);
  statusEl.textContent = 'Recording. Press "I\'m back in the warm" the moment you sit down.';
}

function stopRecording() {
  recordedSeconds = rec.elapsed();
  usedCard = cardPos !== null;
  lastResult = baseline ? computeRecovery(rec.getRows(), rec.getEvents(), baseline.noise) : null;
  // Save the app's answer in the events file so the Python analysis can check it gets the same number.
  if (lastResult && lastResult.ok) {
    rec.addEvent('app_recovery_sec', lastResult.recoverySec === null ? '' : lastResult.recoverySec.toFixed(2));
  }
  rec.stopRecording();
  releaseScreen();
  markStep(2, 'done');
  clearInterval(timerId);
  timerEl.classList.add('hidden');
  btnRecord.textContent = 'Start recording';
  btnRecord.classList.remove('btn-recording');
  btnWarm.disabled = true;
  btnTemp.disabled = true;
  btnCsv.disabled = false;
  if (lastResult && lastResult.ok) {
    saveSession({ test: 'color', result: lastResult.recoverySec === null ? null : lastResult.recoverySec / 60 });
    historyPanel.render();
  }
  showResult(lastResult);
  btnPdf.disabled = !(lastResult && lastResult.ok);
  if (lastResult && lastResult.ok) markStep(4, 'done');
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
  statusEl.textContent = 'Warm-up started. Keep your hand still. Log a finger temperature each minute if you have a thermometer.';
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
  let note = 'How long your middle finger took to return to its normal color after you came back into the warm.';
  if (r.recoverySec === null) {
    note = 'Your middle finger had not returned to its normal color when you stopped. Next time, record for longer.';
  } else if (r.startScore <= r.threshold) {
    note = 'Your finger was already close to its normal color when you came in, so there was nothing to time. Try a longer or colder exposure.';
  }
  resultEl.className = 'result';
  resultEl.innerHTML = `
    <div class="result-label">Recovery time, middle finger</div>
    <div class="result-big">${headlineText(r)}</div>
    <p class="result-note">${note}</p>`;
}

function headlineText(r) {
  if (!r.ok) return r.reason;
  if (r.recoverySec === null) return 'Not back to normal yet';
  if (r.startScore <= r.threshold) return 'Already normal';
  const min = r.recoverySec / 60;
  return min < 1 ? `${Math.round(r.recoverySec)} seconds` : `${min.toFixed(1)} minutes`;
}

function fingerSummary(rows, finger, tWarm) {
  const list = rows.filter((r) => r.finger === finger && r.change_score !== '' && Number(r.t) >= tWarm);
  if (list.length === 0) return { name: finger, peak: 0, endScore: 0, endLabel: '-' };
  const scores = list.map((r) => Number(r.change_score));
  const last = list[list.length - 1];
  return { name: finger, peak: Math.max(...scores), endScore: Number(last.change_score), endLabel: last.label };
}

btnPdf.onclick = async () => {
  const name = todayName('recovery');
  btnPdf.disabled = true;
  btnPdf.textContent = 'Making PDF...';
  // jsPDF is big, so it is only downloaded when someone asks for a report.
  try {
    const { makeReport } = await import('./report.js');
    buildReport(makeReport, name);
  } finally {
    btnPdf.disabled = false;
    btnPdf.textContent = 'Download PDF report';
  }
};

function buildReport(makeReport, name) {
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
}

// prompt() is blocked inside some in-app browsers (Instagram, KakaoTalk), so files are named automatically.
btnCsv.onclick = () => rec.downloadCSV(todayName('recovery'));

function todayName(prefix) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${mm}${dd}_${hh}${mi}`;
}

// ---------- Helpers ----------

// Shows which step the user is on: '' (not yet), 'active' (now), 'done' (finished).
function markStep(n, state) {
  const el = document.querySelector(`[data-step="${n}"]`);
  if (!el || (state === 'active' && el.dataset.state === 'done')) return;
  el.dataset.state = state;
}

// A phone that goes to sleep stops the camera, which ruins a 10-minute recording.
async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Not supported or denied. The recording still works if the user keeps the screen on.
  }
}

function releaseScreen() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

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