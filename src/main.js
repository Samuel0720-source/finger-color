// Font served from this site (no request to Google). Variable width + weight.
import '@fontsource-variable/instrument-sans/wdth.css';
import './style.css';
import { startCamera, stopCamera, isFrontCamera, tryLockCamera } from './camera.js';
import { loadHandModel, detectHand, fingertipSpots } from './hand.js';
import { averageRGB, toLinear, linearToLab } from './color.js';
import * as rec from './recorder.js';
import { describeChange, renderFingers } from './plain.js';
import { createChart, addPoint, resetChart, chartImage, drawFromRows } from './livechart.js';
import { analyzeColorRecording } from './assess/color-analysis.js';
import * as raynaud from './assess/raynaud.js';
import * as trigger from './assess/trigger.js';
import * as carpal from './assess/carpal.js';
import { mountQuestionnaire } from './questionnaire.js';
import { renderResult } from './result-panel.js';
import { drawPhaseStrip, PHASE_LEGEND } from './phase-strip.js';
import { saveSession } from './history.js';
import { createHistoryPanel } from './history-panel.js';
import { createTriggerPanel } from './tests/trigger-panel.js';
import { createReachPanel } from './tests/reach-panel.js';
import { mountGuidedTests } from './tests/cts-guided.js';

const SAMPLE_EVERY_MS = 1000;
const BASELINE_SECONDS = 10;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const CONDITIONS = { raynaud, trigger, carpal };
const MODES = Object.keys(CONDITIONS);
const SOURCES = {
  raynaud: [
    ['International consensus criteria for Raynaud\'s phenomenon (Maverakis et al., J Autoimmun 2014)', 'https://pubmed.ncbi.nlm.nih.gov/24491823/'],
    ['Raynaud phenomenon, Merck Manual Professional Edition', 'https://www.merckmanuals.com/professional/cardiovascular-disorders/peripheral-artery-disorders/raynaud-phenomenon'],
  ],
  trigger: [['Trigger finger: evaluation, management and outcomes (Green classification)', 'https://surgicoll.scholasticahq.com/article/68065-trigger-finger-evaluation-management-and-outcomes']],
  carpal: [
    ['CTS-6 (Graham et al.), MDCalc', 'https://www.mdcalc.com/calc/10631/carpal-tunnel-syndrome-6-cts-6'],
    ['Carpal tunnel syndrome referral criteria, NHS Scotland', 'https://www.rightdecisions.scot.nhs.uk/borders-ref-help-toolkit/orthopaedic/hand-and-wrist/carpal-tunnel-syndrome'],
  ],
};

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });
const statusEl = $('status');
const timerEl = $('timer');
const fingersEl = $('fingers');
const baselineInfo = $('baseline-info');
const tempInput = $('temp-input');
const btnCamera = $('btn-camera');
const btnCameraStart = $('btn-camera-start');
const btnBaseline = $('btn-baseline');
const btnRecord = $('btn-record');
const btnWarm = $('btn-warm');
const btnTemp = $('btn-temp');
const stage = $('stage');
const stageEmpty = $('stage-empty');
const trackingEl = $('tracking-state');

let mode = MODES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'raynaud';
let busy = false; // a timed test is running: do not switch condition or stop the camera
let cameraOn = false;
let mirrored = false;
let lastVideoTime = -1;
let frameId = null;
let fpsFrames = 0;
let fpsStart = 0;
let wakeLock = null;
let hand = loadHand();

// Color recording state
let lastSample = 0;
let baseline = null; // in memory only: a new camera session needs a new reference under the current light
let baselineBuffer = null;
let timerId = null;
let warmAt = null;
let sessionName = null;
let colorAnalysis = null;
let colorContext = {};

// Camera results that feed each assessment
const camera = { raynaud: null, trigger: null, carpal: null };

const setStatus = (text) => (statusEl.textContent = text);
window.onerror = (msg) => setStatus('Something went wrong: ' + msg);
window.onunhandledrejection = (e) => setStatus('Something went wrong: ' + (e.reason?.message || e.reason));

// ---------- Questions and results ----------

const forms = {};
const guided = {};
for (const m of MODES) {
  forms[m] = mountQuestionnaire($('q-' + m), m, CONDITIONS[m].QUESTIONS, () => {
    if (m === 'carpal') guided.carpal?.sync();
    updateResult(m);
  });
}
guided.carpal = mountGuidedTests($('cts-guided'), {
  get: () => forms.carpal.answers,
  set: (id, v) => forms.carpal.set(id, v),
});
const cameraInput = (m) => (m === 'carpal' ? (camera.carpal ? { reach: camera.carpal } : null) : camera[m]);

function assessment(m) {
  return CONDITIONS[m].assess(forms[m].answers, cameraInput(m));
}

function updateResult(m) {
  const r = assessment(m);
  renderResult($('result-' + m), r, { onPdf: (btn) => downloadReport(m, btn) });
  document.querySelector(`.cond[data-mode="${m}"]`).dataset.level = r.level;
}

// ---------- Condition picker ----------

const historyPanel = createHistoryPanel();
const conds = document.querySelectorAll('.cond');
conds.forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

function setMode(next) {
  if (busy || rec.isRecording() || baselineBuffer) {
    setStatus('Finish or stop the current test first.');
    return;
  }
  if (!MODES.includes(next)) return;
  mode = next;
  window.history.replaceState(null, '', '#' + mode);
  conds.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.querySelectorAll('[data-only]').forEach((el) => el.classList.toggle('hidden', el.dataset.only !== mode));
  octx.clearRect(0, 0, overlay.width, overlay.height);
  historyPanel.setMode(mode);
}

// ---------- Hand in view ----------

function loadHand() {
  try {
    return localStorage.getItem('hand') || '';
  } catch {
    return '';
  }
}
const handButtons = document.querySelectorAll('[data-hand]');
function syncHand() {
  handButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hand === hand)));
}
handButtons.forEach(
  (b) =>
    (b.onclick = () => {
      if (busy || rec.isRecording() || baselineBuffer) return;
      if (hand !== b.dataset.hand && baseline) {
        baseline = null; // a normal color belongs to one hand
        updateBaselineInfo();
      }
      hand = b.dataset.hand;
      try {
        localStorage.setItem('hand', hand);
      } catch {
        /* not essential */
      }
      syncHand();
    })
);
const context = () => ({ hand });

// ---------- Camera ----------

const panelOptions = {
  setStatus,
  setBusy: (v) => (busy = v),
  onSaved: () => historyPanel.render(),
  fileName: (prefix) => todayName(prefix),
  getContext: context,
};
const triggerPanel = createTriggerPanel({
  ...panelOptions,
  onResult: (r) => {
    camera.trigger = r;
    updateResult('trigger');
  },
});
const reachPanel = createReachPanel({
  ...panelOptions,
  onResult: (r) => {
    camera.carpal = r && r.ok ? r : null;
    updateResult('carpal');
  },
});

btnCameraStart.onclick = () => turnCameraOn();
btnCamera.onclick = () => turnCameraOff();

async function turnCameraOn() {
  btnCameraStart.disabled = true;
  setStatus('Opening camera...');
  let lockMsg;
  let track;
  try {
    track = await startCamera(video);
    lockMsg = await tryLockCamera(track);
  } catch (e) {
    setStatus(`Could not open the camera (${e.message}). Allow camera access in your browser and try again.`);
    btnCameraStart.disabled = false;
    return;
  }
  track.addEventListener('ended', () => {
    interruptAll();
    turnCameraOff(true);
    setStatus('Camera disconnected. Start it again to continue.');
  });
  mirrored = isFrontCamera(track);
  stage.classList.toggle('mirrored', mirrored);
  stage.classList.add('is-live');
  stageEmpty.classList.add('hidden');
  setStatus('Loading the hand model (about 8 MB, first time only)...');
  try {
    await loadHandModel();
  } catch (e) {
    stopCamera(video);
    stage.classList.remove('is-live');
    stageEmpty.classList.remove('hidden');
    setStatus(`Could not load the hand model (${e.message}). Check your internet connection and try again.`);
    btnCameraStart.disabled = false;
    return;
  }
  work.width = overlay.width = video.videoWidth;
  work.height = overlay.height = video.videoHeight;
  cameraOn = true;
  fpsFrames = 0;
  fpsStart = performance.now();
  setStatus(hand ? lockMsg : lockMsg + ' Choose which hand is in view.');
  btnCamera.classList.remove('hidden');
  trackingEl.classList.remove('hidden');
  btnCameraStart.disabled = false;
  btnBaseline.disabled = false;
  btnRecord.disabled = false;
  triggerPanel.enable();
  reachPanel.enable();
  frameId = requestAnimationFrame(loop);
}

function turnCameraOff(force = false) {
  if (!force && (busy || rec.isRecording() || baselineBuffer)) {
    setStatus('Finish or stop the current test first.');
    return;
  }
  cameraOn = false;
  baseline = null;
  updateBaselineInfo();
  cancelAnimationFrame(frameId);
  lastVideoTime = -1;
  renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));
  stopCamera(video);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  stage.classList.remove('is-live');
  stageEmpty.classList.remove('hidden');
  btnCamera.classList.add('hidden');
  trackingEl.classList.add('hidden');
  btnBaseline.disabled = true;
  btnRecord.disabled = true;
  triggerPanel.disable();
  reachPanel.disable();
  setStatus('Camera off.');
}

// One loop for every test: run the hand model once per new video frame, then pass the hand to the active test.
function loop(now) {
  if (!cameraOn) return;
  triggerPanel.tick(now);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) {
    frameId = requestAnimationFrame(loop);
    return;
  }
  lastVideoTime = video.currentTime;
  if (work.width !== video.videoWidth || work.height !== video.videoHeight) {
    work.width = overlay.width = video.videoWidth;
    work.height = overlay.height = video.videoHeight;
  }
  try {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const handNow = detectHand(video, now);
    fpsFrames++;
    if (now - fpsStart >= 1000) {
      trackingEl.textContent = `${handNow ? 'Hand found' : 'No hand'} · ${Math.round((fpsFrames * 1000) / (now - fpsStart))} fps`;
      trackingEl.dataset.ready = String(Boolean(handNow));
      fpsFrames = 0;
      fpsStart = now;
    }
    if (mode === 'raynaud') colorFrame(handNow, now);
    else if (mode === 'trigger') triggerPanel.onFrame(handNow, now, octx);
    else reachPanel.onFrame(handNow, now, octx);
  } catch (e) {
    setStatus('Tracking error: ' + e.message);
  }
  frameId = requestAnimationFrame(loop);
}

// ---------- Raynaud's: color sampling ----------

function colorFrame(handNow, now) {
  wctx.drawImage(video, 0, 0);
  const spots = handNow ? fingertipSpots(handNow.image, video.videoWidth, video.videoHeight) : null;
  if (spots) {
    for (const p of Object.values(spots.tips)) drawBox(p.x, p.y, p.size, '#4ade80');
    for (const f of FINGERS) drawBox(spots.bases[f].x, spots.bases[f].y, spots.bases[f].size, 'rgba(255,255,255,0.7)');
  }
  if (!spots && baselineBuffer && baselineBuffer.length) {
    baselineBuffer = [];
    setStatus('Hand lost. The normal color restarts when all fingertips are visible.');
  }
  if (spots && now - lastSample > SAMPLE_EVERY_MS) {
    if (baselineBuffer && lastSample && now - lastSample > 2500) baselineBuffer = [];
    lastSample = now;
    sample(spots);
  }
}

const inside = (p) => p.x - p.size / 2 >= 0 && p.y - p.size / 2 >= 0 && p.x + p.size / 2 <= work.width && p.y + p.size / 2 <= work.height;
const labOf = (p) => {
  const px = averageRGB(wctx, p.x, p.y, p.size);
  return px ? { rgb: px, lab: linearToLab(toLinear(px)) } : null;
};
const sub = (p, q) => ({ L: p.L - q.L, a: p.a - q.a, b: p.b - q.b });

function sample(spots) {
  if (![...Object.values(spots.tips)].every(inside)) {
    if (baselineBuffer) baselineBuffer = [];
    setStatus('Move your whole hand away from the edge of the picture.');
    return;
  }
  const palm = labOf(spots.tips.palm);
  if (!palm) return;
  const current = {};
  for (const f of FINGERS) {
    const tip = labOf(spots.tips[f]);
    if (!tip) return;
    const base = inside(spots.bases[f]) ? labOf(spots.bases[f]) : null;
    current[f] = { rgb: tip.rgb, d: sub(tip.lab, palm.lab), prox: base ? sub(base.lab, palm.lab) : null };
  }
  if (baselineBuffer) collectBaseline(current);

  const views = FINGERS.map((name) => {
    const now = current[name].rgb;
    if (!baseline) return { name, change: null, now };
    const diff = sub(current[name].d, baseline.fingers[name]);
    return { name, change: describeChange(diff), now, normal: baseline.fingers[name].rgb };
  });
  renderFingers(fingersEl, views);

  if (rec.isRecording()) {
    const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '');
    for (const v of views) {
      const c = current[v.name];
      rec.addRow({
        finger: v.name,
        palm_dL: f2(c.d.L),
        palm_da: f2(c.d.a),
        palm_db: f2(c.d.b),
        prox_dL: f2(c.prox?.L),
        prox_da: f2(c.prox?.a),
        prox_db: f2(c.prox?.b),
        change_score: v.change ? f2(v.change.score) : '',
        label: v.change ? v.change.label : '',
      });
    }
    if (baseline) addPoint(rec.elapsed(), views.map((v) => (v.change ? v.change.score : null)));
  }
}

btnBaseline.onclick = () => {
  if (baselineBuffer) {
    baselineBuffer = null;
    btnBaseline.textContent = baseline ? 'Save normal color again' : 'Save normal color';
    setStatus('Normal color cancelled.');
    return;
  }
  if (rec.isRecording()) return;
  baselineBuffer = [];
  btnBaseline.textContent = `Cancel (${BASELINE_SECONDS} s left)`;
  setStatus('Keep your hand still with all five fingertips in view.');
};

function collectBaseline(current) {
  baselineBuffer.push(current);
  const left = BASELINE_SECONDS - baselineBuffer.length;
  if (left > 0) {
    btnBaseline.textContent = `Cancel (${left} s left)`;
    return;
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = (xs) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));
  const avg = (list) => ({ L: mean(list.map((d) => d.L)), a: mean(list.map((d) => d.a)), b: mean(list.map((d) => d.b)) });
  const fingers = {};
  const noiseByFinger = {};
  for (const f of FINGERS) {
    const ds = baselineBuffer.map((s) => s[f].d);
    const proxes = baselineBuffer.map((s) => s[f].prox).filter(Boolean);
    const px = baselineBuffer.map((s) => s[f].rgb);
    fingers[f] = { ...avg(ds), prox: proxes.length >= 5 ? avg(proxes) : null, rgb: { r: mean(px.map((p) => p.r)), g: mean(px.map((p) => p.g)), b: mean(px.map((p) => p.b)) } };
    const dist = ds.map((d) => Math.hypot(d.L - fingers[f].L, d.a - fingers[f].a, d.b - fingers[f].b));
    noiseByFinger[f] = mean(dist) + 2 * sd(dist);
  }
  baseline = { savedAt: new Date().toISOString(), fingers, noise: noiseByFinger.middle, noiseByFinger, hand };
  baselineBuffer = null;
  updateBaselineInfo();
  setStatus('Normal color saved. Start recording when your fingers change color.');
}

function updateBaselineInfo() {
  btnBaseline.textContent = baseline ? 'Save normal color again' : 'Save normal color';
  baselineInfo.textContent = baseline
    ? `Saved ${new Date(baseline.savedAt).toLocaleTimeString()}. Save again if the room or light changes.`
    : 'Not saved. Recording is still possible: the app will use the end of the recording as your normal color.';
  markStep(1, baseline ? 'done' : '');
}

btnRecord.onclick = () => (rec.isRecording() ? stopRecording() : startRecording());

function startRecording() {
  if (baselineBuffer || !cameraOn) return;
  colorContext = { ...context(), startedAt: new Date().toLocaleString(), reference: baseline ? 'saved normal color' : 'end of recording' };
  sessionName = todayName('raynaud');
  rec.startRecording();
  rec.addEvent('algorithm_version', '3');
  if (baseline) rec.addEvent('baseline_noise', String(baseline.noise));
  warmAt = null;
  colorAnalysis = null;
  $('color-analysis').classList.add('hidden');
  btnBaseline.disabled = true;
  $('btn-events').disabled = true;
  $('btn-csv').disabled = true;
  keepScreenOn();
  markStep(2, 'active');
  resetChart();
  btnRecord.textContent = 'Stop recording';
  btnRecord.classList.add('btn-recording');
  btnWarm.disabled = false;
  btnTemp.disabled = false;
  timerEl.classList.remove('hidden');
  timerId = setInterval(updateTimer, 500);
  setStatus('Recording. Press "I\'m warming up now" the moment you start warming your hands.');
}

function stopRecording() {
  rec.stopRecording();
  releaseScreen();
  clearInterval(timerId);
  timerEl.classList.add('hidden');
  btnRecord.textContent = 'Start recording';
  btnRecord.classList.remove('btn-recording');
  btnWarm.disabled = true;
  btnTemp.disabled = true;
  btnBaseline.disabled = !cameraOn;
  $('btn-csv').disabled = rec.getRows().length === 0;
  $('btn-events').disabled = false;

  const rows = rec.getRows();
  const events = rec.getEvents();
  colorAnalysis = analyzeColorRecording(rows, events, baseline);
  if (!colorAnalysis.ok) {
    camera.raynaud = null;
    setStatus('Recording stopped. ' + colorAnalysis.reason);
    updateResult('raynaud');
    return;
  }
  markStep(2, 'done');
  camera.raynaud = colorAnalysis;
  if (colorAnalysis.middle.ok) rec.addEvent('app_recovery_sec', colorAnalysis.middle.recoverySec === null ? '' : colorAnalysis.middle.recoverySec.toFixed(2));
  showColorAnalysis(colorAnalysis, events);
  if (colorAnalysis.involved.length && colorAnalysis.middle.ok && !colorAnalysis.middle.noChange) {
    saveSession({ test: 'color', algorithm: 3, result: colorAnalysis.middle.recoverySec === null ? null : colorAnalysis.middle.recoverySec / 60, context: colorContext });
    historyPanel.render();
  }
  updateResult('raynaud');
  setStatus(colorAnalysis.involved.length ? 'Recording analysed. See the color phases below and your result in step 3.' : 'No clear color change was seen in this recording. Record during an episode to measure one.');
}

function showColorAnalysis(a, events) {
  $('color-analysis').classList.remove('hidden');
  const warm = events.find((e) => e.type === 'warm_start');
  drawPhaseStrip($('phase-strip'), a.rows, warm ? Number(warm.t) : NaN);
  drawFromRows(a.rows);
  const yesNo = (v) => (v ? '<span class="dot on">Yes</span>' : '<span class="dot">No</span>');
  const time = (r) => (!r.ok ? 'Not scored' : r.noChange ? 'No change' : r.recoverySec === null ? 'Not yet' : r.recoverySec < 60 ? `${Math.round(r.recoverySec)} s` : `${(r.recoverySec / 60).toFixed(1)} min`);
  const names = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little' };
  $('color-detail').innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Finger</th><th>Biggest change</th><th>White</th><th>Blue</th><th>Red</th><th>Sharp border</th><th>Recovery</th></tr></thead>
      <tbody>${FINGERS.map((f) => {
        const x = a.fingers[f];
        return `<tr><th scope="row">${names[f]}</th><td>${x.peak.toFixed(1)}</td><td>${yesNo(x.pale)}</td><td>${yesNo(x.blue)}</td><td>${yesNo(x.red)}</td><td>${x.borderMeasured ? yesNo(x.border) : '–'}</td><td>${time(x.recovery)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="fine-print">Reference color: ${a.source === 'saved' ? 'your saved normal color' : 'the last 10 seconds of the recording'}. A phase counts when the change is 6 or more (3 is barely visible) in 2 of 3 consecutive seconds. A sharp border means the base of the finger changed less than 40% as much as the tip. Recovery is the first time the color stays near normal for 30 seconds, using a 10-second average.</p>`;
}

function updateTimer() {
  const s = Math.floor(rec.elapsed());
  timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  if (warmAt !== null) {
    const e = rec.elapsed() - warmAt;
    setStatus(e < 61 ? `Warming for ${Math.floor(e)} s. Keep your hand in view at least ${Math.ceil(61 - e)} s more.` : 'Keep recording until the color looks normal, then press Stop.');
  }
}

btnWarm.onclick = () => {
  rec.addEvent('warm_start');
  warmAt = rec.elapsed();
  btnWarm.disabled = true;
};

btnTemp.onclick = () => {
  if (!rec.isRecording() || tempInput.value === '' || !tempInput.checkValidity()) return;
  rec.addEvent('finger_temp_c', tempInput.value);
  setStatus(`Logged ${tempInput.value} °C.`);
  tempInput.value = '';
};

$('btn-csv').onclick = () => rec.downloadCSV(sessionName);
$('btn-events').onclick = () => rec.downloadEvents(sessionName);

// ---------- Reports ----------

async function downloadReport(m, btn) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Making PDF...';
  try {
    const { makeDoctorReport } = await import('./doctor-report.js');
    const { measurements, images } = reportMeasurements(m);
    makeDoctorReport({
      assessment: assessment(m),
      questions: CONDITIONS[m].QUESTIONS,
      answers: forms[m].answers,
      measurements,
      images,
      sources: SOURCES[m],
      fileName: todayName(m + '_report'),
    });
  } catch (e) {
    setStatus('The PDF could not be created: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function reportMeasurements(m) {
  const measurements = [];
  const images = [];
  const fmt = (s) => (s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
  if (m === 'raynaud' && colorAnalysis?.ok) {
    const a = colorAnalysis;
    measurements.push(['Recorded', `${colorContext.startedAt}, ${colorContext.hand || 'hand not specified'} hand, reference: ${colorContext.reference}`]);
    measurements.push(['Fingers that changed color', a.involved.length ? a.involved.join(', ') : 'none']);
    measurements.push(['Phases seen', `white: ${a.pale.join(', ') || 'none'}; blue: ${a.blue.join(', ') || 'none'}; red after warming: ${a.red.join(', ') || 'none'}`]);
    measurements.push(['Sharp border', a.borderMeasured ? a.border.join(', ') || 'none' : 'not measured']);
    measurements.push(['Recovery time', FINGERS.map((f) => {
      const r = a.fingers[f].recovery;
      return `${f} ${!r.ok ? 'not scored' : r.noChange ? 'no change' : r.recoverySec === null ? 'not recovered' : fmt(r.recoverySec)}`;
    }).join('; ')]);
    const temps = rec.getEvents().filter((e) => e.type === 'finger_temp_c');
    if (temps.length) measurements.push(['Finger temperature log', temps.map((e) => `${Math.round(e.t)} s: ${e.value} C`).join('; ')]);
    const strip = $('phase-strip');
    images.push({ title: 'Color phase of each finger over time (white, blue, red, normal)', src: strip.toDataURL('image/png'), height: Math.min(60, (170 * strip.height) / strip.width) });
    images.push({ title: 'Color change from normal (middle finger highlighted)', src: chartImage(), height: 62 });
  }
  if (m === 'trigger' && camera.trigger) {
    const t = camera.trigger;
    measurements.push(['Recording quality', `${t.quality.fps.toFixed(0)} fps, largest gap ${t.quality.maxFrameGap.toFixed(0)} ms, ${t.quality.cycles} fist cycles`]);
    for (const [f, x] of Object.entries(t.fingers)) measurements.push([f, `straightest ${x.maxAngle.toFixed(0)} deg, most bent ${x.minAngle.toFixed(0)} deg, ${x.catches} catches`]);
    t.events.forEach((e) => measurements.push(['Catch', e]));
    images.push({ title: 'Joint angle over time (180 deg = straight, X = catch)', src: t.chartImg, height: 62 });
  }
  if (m === 'carpal' && camera.carpal) {
    const r = camera.carpal;
    measurements.push(['Thumb reach test', Object.entries(r.reached).map(([f, ok]) => `${f === 'pinky' ? 'little' : f} ${ok ? 'reached' : 'not reached'}`).join('; ') + `, ${r.seconds.toFixed(1)} s`]);
  }
  return { measurements, images };
}

// ---------- Interruptions ----------

function interruptAll() {
  if (baselineBuffer) {
    baselineBuffer = null;
    updateBaselineInfo();
  }
  triggerPanel.cancel();
  reachPanel.cancel();
  if (rec.isRecording()) {
    rec.addEvent('interrupted');
    stopRecording();
  }
}
// A hidden page may pause the video. Never score an interrupted timed test.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) interruptAll();
});
window.addEventListener('pagehide', () => {
  cameraOn = false;
  cancelAnimationFrame(frameId);
  stopCamera(video);
  releaseScreen();
});

// ---------- Helpers ----------

function todayName(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function markStep(n, state) {
  const el = document.querySelector(`[data-step="${n}"]`);
  if (el) el.dataset.state = state;
}

async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // Not supported or denied. Recording still works if the screen stays on.
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

// ---------- Start ----------

createChart($('chart'));
$('phase-legend').innerHTML = PHASE_LEGEND.map(([l, c]) => `<span><i style="background:rgb(${c.join(',')})"></i>${l}</span>`).join('');
renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));
updateBaselineInfo();
syncHand();
for (const m of MODES) updateResult(m);
setMode(mode);
