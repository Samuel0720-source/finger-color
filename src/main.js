// Font served from this site (no request to Google). Variable width + weight.
import '@fontsource-variable/instrument-sans/wdth.css';
import { startCamera, stopCamera, isFrontCamera, tryLockCamera } from './camera.js';
import { loadHandModel, detectHand } from './hand.js';
import * as raynaud from './assess/raynaud.js';
import * as trigger from './assess/trigger.js';
import * as carpal from './assess/carpal.js';
import { mountQuestionnaire } from './questionnaire.js';
import { renderResult } from './result-panel.js';
import { LEVELS } from './assess/levels.js';
import { createHistoryPanel, historyForReport } from './history-panel.js';
import { createTriggerPanel } from './tests/trigger-panel.js';
import { createReachPanel } from './tests/reach-panel.js';
import { createColorPanel } from './tests/color-panel.js';
import { mountGuidedTests } from './tests/cts-guided.js';

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
const statusEl = $('status');
const btnCamera = $('btn-camera');
const btnCameraStart = $('btn-camera-start');
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
let hand = loadHand();

// Camera results that feed each assessment
const camera = { raynaud: null, trigger: null, carpal: null };
// A PDF needs at least one answer or measurement. ready[m] remembers that for each condition.
const ready = {};

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
  ready[m] = r.summary.known > 0;
  document.querySelectorAll(`[data-report="${m}"]`).forEach((b) => (b.disabled = !ready[m]));
  if (m === mode) $('history-pdf').disabled = !ready[m];
  const card = document.querySelector(`.cond[data-mode="${m}"]`);
  if (card.dataset.level && card.dataset.level !== r.level && m === mode) {
    $('result-announce').textContent = `${CONDITIONS[m].NAME} result: ${LEVELS[r.level].headline}.`;
  }
  card.dataset.level = r.level;
}

// ---------- Condition picker ----------

const historyPanel = createHistoryPanel();
const conds = document.querySelectorAll('.cond');
conds.forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

function setMode(next) {
  if (busy || colorPanel.isBusy()) {
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
  $('history-pdf').disabled = !ready[mode];
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
      if (busy || colorPanel.isBusy()) return;
      if (hand !== b.dataset.hand) colorPanel.handChanged();
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
const colorPanel = createColorPanel({
  ...panelOptions,
  video,
  onResult: (a) => {
    camera.raynaud = a;
    updateResult('raynaud');
  },
});
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
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  cameraOn = true;
  fpsFrames = 0;
  fpsStart = performance.now();
  setStatus(hand ? lockMsg : lockMsg + ' Choose which hand is in view.');
  btnCamera.classList.remove('hidden');
  trackingEl.classList.remove('hidden');
  btnCameraStart.disabled = false;
  colorPanel.enable();
  triggerPanel.enable();
  reachPanel.enable();
  frameId = requestAnimationFrame(loop);
}

function turnCameraOff(force = false) {
  if (!force && (busy || colorPanel.isBusy())) {
    setStatus('Finish or stop the current test first.');
    return;
  }
  cameraOn = false;
  cancelAnimationFrame(frameId);
  lastVideoTime = -1;
  stopCamera(video);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  stage.classList.remove('is-live');
  stageEmpty.classList.remove('hidden');
  btnCamera.classList.add('hidden');
  trackingEl.classList.add('hidden');
  colorPanel.disable();
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
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
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
    if (mode === 'raynaud') colorPanel.onFrame(handNow, now, octx);
    else if (mode === 'trigger') triggerPanel.onFrame(handNow, now, octx);
    else reachPanel.onFrame(handNow, now, octx);
  } catch (e) {
    setStatus('Tracking error: ' + e.message);
  }
  frameId = requestAnimationFrame(loop);
}

// ---------- Reports ----------

// Every PDF button outside the Result panel has data-report: which condition it reports on,
// or "current" for the History button, which follows the condition you picked.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-report]');
  if (btn && !btn.disabled) downloadReport(btn.dataset.report === 'current' ? mode : btn.dataset.report, btn);
});

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
      history: historyForReport(m),
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
  if (m === 'raynaud') return colorPanel.report();
  const measurements = [];
  const images = [];
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
  colorPanel.cancel();
  triggerPanel.cancel();
  reachPanel.cancel();
}
// A hidden page may pause the video. Never score an interrupted timed test.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) interruptAll();
});
window.addEventListener('pagehide', () => {
  cameraOn = false;
  cancelAnimationFrame(frameId);
  stopCamera(video);
  colorPanel.releaseScreen();
});

// ---------- Helpers ----------

function todayName(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------- Start ----------

syncHand();
for (const m of MODES) updateResult(m);
setMode(mode);
// Typing #trigger (or using Back/Forward) in the address bar switches the condition too.
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (next !== mode) setMode(next);
  if (next !== mode) window.history.replaceState(null, '', '#' + mode); // switch refused (test running)
});
