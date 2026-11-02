import {setObservation} from './features.js';
import {repeatSummary} from './research.js';
import {mountSession, sessionContext, lockSession} from './session.js';
import { mountGuidance, currentGuidance } from './guidance.js';
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
import { saveSession, loadHistory } from './history.js';
import { createHistoryPanel } from './history-panel.js';
import { createTriggerPanel } from './tests/trigger-panel.js';
import { createTapPanel } from './tests/tap-panel.js';

const CARD_BOX = 40;
let fpsFrames=0,fpsStart=0;
const SAMPLE_EVERY_MS = 1000;
const BASELINE_SECONDS = 10;
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
$('btn-demo').onclick = () => $('example-dialog').showModal();

let cardPos = null;
let lastSample = 0;
let baseline = null; // A new camera session requires a fresh reference under current lighting.
let colorContext = {};
let colorResults = {};
let colorStartedAt = null;
let warmAt = null;
let baselineBuffer = null;
let timerId = null;
let lastResult = null;
let recordedSeconds = 0;
let usedCard = false;
let wakeLock = null;
let cameraOn = false;
let mirrored = false;
let lastVideoTime = -1;
let frameId = null;
let sessionName = null;

window.onerror = (msg) => {
  statusEl.textContent = 'Error: ' + msg;
};
window.onunhandledrejection = (e) => {
  statusEl.textContent = 'Error: ' + e.reason;
};

mountSession();
mountGuidance();
document.addEventListener('session-context-change', () => {
 if (rec.isRecording() || baselineBuffer) return;
 if (baseline && (baseline.context.hand !== sessionContext().hand || baseline.context.setup !== sessionContext().setup)) {baseline=null;btnRecord.disabled=true;updateBaselineInfo();}
});
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
  setBusy: (value) => {busy = value;lockSession(value);},
  onSaved: () => historyPanel.render(),
  fileName: (prefix) => todayName(prefix),
};
const trigger = createTriggerPanel(panelOptions);
const tap = createTapPanel(panelOptions);

const tabs = document.querySelectorAll('.tab');
tabs.forEach((tab) => (tab.onclick = () => setMode(tab.dataset.mode)));
setMode(mode);

function setMode(next) {
  if (busy || rec.isRecording() || baselineBuffer) {
    statusEl.textContent = 'Finish or stop the current test first.';
    return;
  }
  if (!MODES.includes(next)) return;
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

  track.addEventListener('ended', () => {
    if (baselineBuffer) btnBaseline.click();
    trigger.cancel();
    tap.cancel();
    if (rec.isRecording()) { rec.addEvent('interrupted'); stopRecording(); }
    turnCameraOff();
    statusEl.textContent = 'Camera disconnected. Reconnect it and enable the camera again.';
  });
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
  cameraOn = true;fpsFrames=0;fpsStart=performance.now();
  statusEl.textContent = lockMsg;
  markStep(1, 'active');
  btnCamera.classList.remove('hidden');
  btnCameraStart.disabled = false;
  btnBaseline.disabled = false;
  btnRecord.disabled = !baseline;
  trigger.enable();
  tap.enable();
  frameId = requestAnimationFrame(loop);
}

function turnCameraOff() {
  if (busy || rec.isRecording() || baselineBuffer) {
    statusEl.textContent = 'Finish or stop the current test first.';
    return;
  }
  cameraOn = false;
  baseline=null;updateBaselineInfo();
  cancelAnimationFrame(frameId);
  lastVideoTime = -1;
  cardPos = null;
  renderFingers(fingersEl, FINGERS.map(name => ({ name, change: null })));
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
  $('tracking-state').textContent = 'Camera off';
  $('tracking-state').dataset.ready = 'false';
}

overlay.onclick = (e) => {
  if (mode !== 'color' || !cameraOn || rec.isRecording() || baselineBuffer) return; // the grey card is only used by the color test
  const rect = overlay.getBoundingClientRect();
  // When the picture is shown as a mirror, the click's x has to be flipped back to the camera's x.
  const fromLeft = mirrored ? rect.right - e.clientX : e.clientX - rect.left;
  cardPos = {
    x: fromLeft * (overlay.width / rect.width),
    y: (e.clientY - rect.top) * (overlay.height / rect.height),
  };
  statusEl.textContent = 'Grey card marked for the corrected-color CSV columns. Recovery still uses the palm reference.';
};

// ---------- Main loop ----------

// One loop for every test: run the hand model once per frame, then hand the result to the chosen test.
function loop(now) {
  if (!cameraOn) return;
  trigger.tick(now);
  tap.tick(now);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) {
    frameId = requestAnimationFrame(loop);
    return;
  }
  lastVideoTime = video.currentTime;
  if (work.width !== video.videoWidth || work.height !== video.videoHeight) {
    work.width = overlay.width = video.videoWidth;
    work.height = overlay.height = video.videoHeight;
    cardPos = null;
  }
  try {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const hand = detectHand(video, now);
    fpsFrames++;if(now-fpsStart>=1000){$('tracking-state').textContent=(hand?'Hand detected':'Hand not detected')+' · '+Math.round(fpsFrames*1000/(now-fpsStart))+' fps';fpsFrames=0;fpsStart=now;}
    $('tracking-state').dataset.ready = String(Boolean(hand));
    if (mode === 'color') colorFrame(hand, now);
    else if (mode === 'catching') trigger.onFrame(hand, now, octx);
    else tap.onFrame(hand, now, octx);
  } catch (e) {
    statusEl.textContent = 'Loop error: ' + e.message;
  }
  frameId = requestAnimationFrame(loop);
}

function colorFrame(hand, now) {
  wctx.drawImage(video, 0, 0); // only the color test needs the pixels
  const spots = hand ? fingertipSpots(hand.image, video.videoWidth, video.videoHeight) : null;

  if (cardPos) drawBox(cardPos.x, cardPos.y, CARD_BOX, 'yellow');
  if (spots) {
    for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
  }

  if (!spots && baselineBuffer) {
    baselineBuffer = [];
    btnBaseline.textContent = 'Cancel baseline';
    statusEl.textContent = 'Hand lost. Baseline restarts when all fingertips are visible.';
  }
  if (spots && now - lastSample > SAMPLE_EVERY_MS) {
    if(baselineBuffer && lastSample && now-lastSample>2500)baselineBuffer=[];
    lastSample = now;
    sample(spots);
  }
}

function sample(spots) {
  const inside = Object.values(spots).every(p => p.x - p.size / 2 >= 0 && p.y - p.size / 2 >= 0 && p.x + p.size / 2 <= work.width && p.y + p.size / 2 <= work.height);
  if (!inside) {
    if (baselineBuffer) baselineBuffer = [];
    statusEl.textContent = 'Move your whole hand away from the edge of the camera view.';
    return;
  }
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
    const corrected = card ? correctWithCard(pixel, card) : null;
    current[name] = {
      rgb: pixel,
      raw,
      lab: corrected ? linearToLab(corrected) : null,
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
  if (baselineBuffer) {
    baselineBuffer = null;
    lockSession(false);
    btnBaseline.textContent = baseline ? 'Save baseline color again' : 'Save baseline color';
    btnRecord.disabled = !baseline;
    statusEl.textContent = 'Baseline cancelled.';
    return;
  }
  if (rec.isRecording()) return;
  baselineBuffer = [];
  lockSession(true);
  btnRecord.disabled = true;
  btnBaseline.textContent = `Cancel baseline · ${BASELINE_SECONDS} samples left`;
  statusEl.textContent = 'Keep your hand still with all five fingertips in view.';
};

function collectBaseline(current) {
  baselineBuffer.push(current);
  const left = BASELINE_SECONDS - baselineBuffer.length;
  if (left > 0) {
    btnBaseline.textContent = `Cancel baseline · ${left} samples left`;
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

  const noiseByFinger = Object.fromEntries(FINGERS.map(f => {const values=baselineBuffer.map(s=>Math.hypot(s[f].d.L-fingers[f].L,s[f].d.a-fingers[f].a,s[f].d.b-fingers[f].b));return [f,mean(values)+2*std(values)];}));
  baseline = { savedAt: new Date().toISOString(), fingers, noise: mean(scores) + 2 * std(scores),noiseByFinger,context:sessionContext() };
  lockSession(false);
  // The reference stays in memory so old lighting cannot silently become a new baseline.
  baselineBuffer = null;
  btnBaseline.disabled = false;
  btnRecord.disabled = false;
  updateBaselineInfo();
  statusEl.textContent = 'Normal color saved. You can start recording.';
}

function updateBaselineInfo() {
  if (!baseline) {
    baselineInfo.textContent = 'Not saved yet. Recording unlocks after this step.';
    return;
  }
  const when = new Date(baseline.savedAt).toLocaleString();
  baselineInfo.textContent = `Saved ${when}. Save again if the room or light changes.`;
  btnBaseline.textContent = 'Save baseline color again';
  markStep(1, 'done');
}

// ---------- Recording ----------

btnRecord.onclick = () => (rec.isRecording() ? stopRecording() : startRecording());

function startRecording() {
  if (!baseline || baselineBuffer || !cameraOn) return; // the button stays disabled until a baseline color is saved
  colorContext=sessionContext();colorStartedAt=new Date().toLocaleString();warmAt=null;lockSession(true);
  sessionName = todayName('recovery');
  rec.startRecording();
  rec.addEvent('algorithm_version', '2');
  btnBaseline.disabled = true;
  $('btn-events').disabled = true;
  // Save the noise level with the data so the Python analysis uses the same number as the app.
  if (baseline) rec.addEvent('baseline_noise', String(baseline.noise));
  keepScreenOn();
  markStep(2, 'active');
  resetChart();
  lastResult = null;setObservation('color',null);
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
  recordedSeconds = rec.elapsed();lockSession(false);
  usedCard = cardPos !== null;
  lastResult = baseline ? computeRecovery(rec.getRows(), rec.getEvents(), baseline.noise) : null;
  colorResults=Object.fromEntries(FINGERS.map(f=>[f,computeRecovery(rec.getRows(),rec.getEvents(),baseline?.noiseByFinger?.[f]??baseline?.noise,f)]));
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
  btnCsv.disabled = rec.getRows().length === 0;
  $('btn-events').disabled = false;
  btnBaseline.disabled = false;
  if (lastResult && lastResult.ok && !lastResult.noChange) {
    lastResult.saved = saveSession({ test: 'color', result: lastResult.recoverySec === null ? null : lastResult.recoverySec / 60, algorithm: 2, context:colorContext });
    historyPanel.render();
  }
  setObservation('color',{valid:!!lastResult?.ok,summary:FINGERS.map(f=>{const r=colorResults[f];return f+': '+(!r?.ok?'not scored':r.noChange?'no clear change to time':r.recoverySec===null?'return to baseline not observed':r.recoverySec.toFixed(1)+' s color-signal recovery');}).join('; ')+'. Experimental signal only; no clinical recovery cutoff.'});
  showResult(lastResult);
  if(lastResult?.ok)appendColorDetails();
  btnPdf.disabled = false; // A failed attempt can still be documented.
  if (lastResult && lastResult.ok) markStep(4, 'done');
  statusEl.textContent = lastResult?.saved === false ? 'Recording stopped. Browser storage is unavailable; download your results.' : 'Recording stopped.';
}

function updateTimer() {
  const s = Math.floor(rec.elapsed());
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
  if(warmAt!==null){const elapsed=rec.elapsed()-warmAt;statusEl.textContent=elapsed<61?`Warming recorded: ${Math.floor(elapsed)} s. Keep the hand visible for at least ${Math.ceil(61-elapsed)} more seconds.`:'Minimum recording time reached. Stop when ready; the result checks for a sustained return to baseline.';}
}

btnWarm.onclick = () => {
  rec.addEvent('warm_start');warmAt=rec.elapsed();
  btnWarm.disabled = true;
  statusEl.textContent = 'Warm-up started. Keep your hand still. Log a finger temperature each minute if you have a thermometer.';
};

btnTemp.onclick = () => {
  if (!rec.isRecording() || tempInput.value === '' || !tempInput.checkValidity() || !Number.isFinite(Number(tempInput.value))) return;
  rec.addEvent('finger_temp_c', tempInput.value);
  statusEl.textContent = `Logged ${tempInput.value} °C`;
  tempInput.value = '';
};

// ---------- Results ----------

function showResult(r) {
  if (!r) {
    resultEl.className = 'result muted';
    resultEl.textContent = 'Save your baseline color first to get results.';
    return;
  }
  if (!r.ok) {
    resultEl.className = 'result muted';
    resultEl.textContent = 'Repeat needed: '+r.reason+' You can download an attempt report and review symptom guidance below.';
    return;
  }
  let note = 'How long your middle finger took to return to its baseline color after you came back into the warm.';
  if (r.noChange) {
    note = 'There was no clear color change to time. This session is not saved as a recovery time. Do not deliberately cool your hands to create a result.';
  } else if (r.recoverySec === null) {
    note = 'Your middle finger had not returned to its baseline color when you stopped. Next time, record for longer.';
  } else if (r.startScore <= r.threshold) {
    note = 'Your finger was already close to its baseline color when you came in, so there was nothing to time. No recovery time can be inferred from this session. Do not deliberately cool your hands to create a result.';
  }
  resultEl.className = 'result';
  resultEl.innerHTML = `
    <div class="result-label">Recovery time, middle finger</div>
    <div class="result-big">${headlineText(r)}</div>
    <p class="result-note">${note}</p><p class="quality-pill">Recording checks passed · this is not a health grade</p><p class="result-note">This times a smoothed camera signal, not blood flow. A trailing 10-second average reduces noise and can delay the estimate. The signal must stay below the experimental threshold for 30 seconds to confirm it.</p>`;
}

function appendColorDetails(){
 const table=document.createElement('div');table.className='table-scroll';
 table.innerHTML=`<table class="mini-table"><thead><tr><th>Finger</th><th>Color-signal recovery</th></tr></thead><tbody>${FINGERS.map(f=>{const r=colorResults[f];return `<tr><td>${f}</td><td>${!r?.ok?'Not scored':r.noChange?'No clear change':r.recoverySec===null?'Not observed':Math.round(r.recoverySec)+' s'}</td></tr>`;}).join('')}</tbody></table><p class="hint small">Each finger uses its own baseline noise. These are experimental signal timings, not circulation measurements or clinical recovery cutoffs.</p>`;
 resultEl.append(table);const repeat=document.createElement('p');repeat.className='hint small';repeat.textContent=repeatSummary(loadHistory(),colorContext,'color').lines.join(' ');resultEl.append(repeat);
}

function headlineText(r) {
  if (!r.ok) return r.reason;
  if (r.noChange) return 'No clear change to time';
  if (r.recoverySec === null) return 'Not observed in this recording';
  if (r.startScore <= r.threshold) return 'Already near baseline';
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
  const name = sessionName || todayName('recovery');
  btnPdf.disabled = true;
  btnPdf.textContent = 'Making PDF...';
  // jsPDF is big, so it is only downloaded when someone asks for a report.
  try {
    const { makeMovementReport } = await import('./movement-report.js');
    buildReport(makeMovementReport, name);
  } catch(e){statusEl.textContent='PDF could not be created. Please try again. '+e.message;} finally {
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
    repeat:repeatSummary(loadHistory(),colorContext,'color'),
    test:'color', name, guidance:currentGuidance('color'),date:colorStartedAt,
    status:lastResult?.ok?'Usable recording':'Not scored',measurementContext:colorContext,
    metrics:[['Recording length',recordedSeconds.toFixed(0)+' s'],['Middle-finger result',lastResult?.ok?headlineText(lastResult):'Not scored'],...FINGERS.map(f=>{const r=colorResults[f];return [f+' recovery',!r?.ok?'Not scored':r.noChange?'No clear change':r.recoverySec===null?'Not observed':r.recoverySec.toFixed(1)+' s'];}),...FINGERS.map(f=>{const v=fingerSummary(rows,f,tWarm);return [f+' signal change',`Peak ${v.peak.toFixed(1)}; end ${v.endScore.toFixed(1)}`];}),...events.filter(e=>e.type==='finger_temp_c').map(e=>['Temperature at '+(Number(e.t)-tWarm).toFixed(0)+' s',e.value+' C'])],
    explanation:lastResult?.ok?'Each finger is compared with its own saved baseline. A trailing 10-second average and 30-second confirmation define this experimental signal time. No clear change and recovery not observed are different outcomes. Camera exposure and lighting can affect every value. This does not measure blood flow.':lastResult?.reason||'No usable recording.',
    chartImg:rows.length?chartImage():null,events:[],
  });
}

// prompt() is blocked inside some in-app browsers (Instagram, KakaoTalk), so files are named automatically.
btnCsv.onclick = () => rec.downloadCSV(sessionName);
$('btn-events').onclick = () => rec.downloadEvents(sessionName);

// A hidden page may suspend video. Never score an interrupted timed test.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (baselineBuffer) btnBaseline.click();
  trigger.cancel();
  tap.cancel();
  if (rec.isRecording()) {
    rec.addEvent('interrupted');
    stopRecording();
  }
});
window.addEventListener('pagehide', () => {
  cameraOn = false;
  cancelAnimationFrame(frameId);
  stopCamera(video);
  releaseScreen();
});

function todayName(prefix) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${mm}${dd}_${hh}${mi}_${String(d.getSeconds()).padStart(2,'0')}`;
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
