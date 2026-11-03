// Raynaud's color recording screen: optional normal-color baseline, recording, warming mark,
// temperature log, analysis (phases, fingers, border, recovery) and the CSV downloads.
// Same shape as trigger-panel.js and reach-panel.js: main.js passes each video frame to onFrame().
import { fingertipSpots } from '../hand.js';
import { averageRGB, toLinear, linearToLab } from '../color.js';
import * as rec from '../recorder.js';
import { describeChange, renderFingers } from '../plain.js';
import { createChart, addPoint, resetChart, chartImage, drawFromRows } from '../livechart.js';
import { analyzeColorRecording } from '../assess/color-analysis.js';
import { drawPhaseStrip, PHASE_LEGEND } from '../phase-strip.js';
import { saveSession } from '../history.js';

const SAMPLE_EVERY_MS = 1000;
const BASELINE_SECONDS = 10;
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little' };
const $ = (id) => document.getElementById(id);
const sub = (p, q) => ({ L: p.L - q.L, a: p.a - q.a, b: p.b - q.b });

export function createColorPanel({ video, setStatus, onResult, onSaved, fileName, getContext }) {
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const fingersEl = $('fingers');
  const baselineInfo = $('baseline-info');
  const tempInput = $('temp-input');
  const timerEl = $('timer');
  const btnBaseline = $('btn-baseline');
  const btnRecord = $('btn-record');
  const btnWarm = $('btn-warm');
  const btnTemp = $('btn-temp');

  let lastSample = 0;
  let baseline = null; // in memory only: a new camera session needs a new reference under the current light
  let baselineBuffer = null; // samples while saving the normal color
  let timerId = null;
  let warmAt = null;
  let sessionName = null;
  let analysis = null;
  let context = {};
  let wakeLock = null;

  createChart($('chart'));
  $('phase-legend').innerHTML = PHASE_LEGEND.map(([l, c]) => `<span><i style="background:rgb(${c.join(',')})"></i>${l}</span>`).join('');
  renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));
  updateBaselineInfo();

  // ---------- Each video frame ----------

  function onFrame(handNow, now, octx) {
    if (work.width !== video.videoWidth || work.height !== video.videoHeight) {
      work.width = video.videoWidth;
      work.height = video.videoHeight;
    }
    wctx.drawImage(video, 0, 0);
    const spots = handNow ? fingertipSpots(handNow.image, video.videoWidth, video.videoHeight) : null;
    if (spots) {
      for (const p of Object.values(spots.tips)) drawBox(octx, p, '#4ade80');
      for (const f of FINGERS) drawBox(octx, spots.bases[f], 'rgba(255,255,255,0.7)');
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

  function sample(spots) {
    if (!Object.values(spots.tips).every(inside)) {
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

  // ---------- Normal color (baseline) ----------

  btnBaseline.onclick = () => {
    if (baselineBuffer) {
      baselineBuffer = null;
      updateBaselineInfo();
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
    baseline = { savedAt: new Date().toISOString(), fingers, noise: noiseByFinger.middle, noiseByFinger, hand: getContext().hand };
    baselineBuffer = null;
    updateBaselineInfo();
    setStatus('Normal color saved. Start recording when your fingers change color.');
  }

  function updateBaselineInfo() {
    btnBaseline.textContent = baseline ? 'Save normal color again' : 'Save normal color';
    baselineInfo.textContent = baseline
      ? `Saved ${new Date(baseline.savedAt).toLocaleTimeString()}. Save again if the room or light changes.`
      : 'Not saved. You can still record: mark warming and keep recording 60 seconds after it, and the app uses the end of the recording as your normal color.';
    markStep(1, baseline ? 'done' : '');
  }

  // ---------- Recording ----------

  btnRecord.onclick = () => (rec.isRecording() ? stopRecording() : startRecording());

  function startRecording() {
    if (baselineBuffer || !enabled) return;
    context = { ...getContext(), startedAt: new Date().toLocaleString(), reference: baseline ? 'saved normal color' : 'end of recording' };
    sessionName = fileName('raynaud');
    rec.startRecording();
    rec.addEvent('algorithm_version', '3');
    if (baseline) rec.addEvent('baseline_noise', String(baseline.noise));
    warmAt = null;
    analysis = null;
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
    btnBaseline.disabled = !enabled;
    $('btn-csv').disabled = rec.getRows().length === 0;
    $('btn-events').disabled = false;

    const rows = rec.getRows();
    const events = rec.getEvents();
    analysis = analyzeColorRecording(rows, events, baseline);
    if (!analysis.ok) {
      onResult(null);
      setStatus('Recording stopped. ' + analysis.reason);
      return;
    }
    markStep(2, 'done');
    // Written so analysis/analyze.py can repeat the calculation from the downloaded files.
    rec.addEvent('reference', analysis.source);
    rec.addEvent('reference_noise', String(analysis.noise.middle));
    if (analysis.middle.ok) rec.addEvent('app_recovery_sec', analysis.middle.recoverySec === null ? '' : analysis.middle.recoverySec.toFixed(2));
    showAnalysis(analysis, events);
    if (analysis.involved.length && analysis.middle.ok && !analysis.middle.noChange) {
      saveSession({ test: 'color', algorithm: 3, result: analysis.middle.recoverySec === null ? null : analysis.middle.recoverySec / 60, context });
      onSaved();
    }
    onResult(analysis);
    setStatus(analysis.involved.length ? 'Recording analysed. See the color phases below and your result in step 3.' : 'No clear color change was seen in this recording. Record during an episode to measure one.');
  }

  function showAnalysis(a, events) {
    $('color-analysis').classList.remove('hidden');
    const warm = events.find((e) => e.type === 'warm_start');
    drawPhaseStrip($('phase-strip'), a.rows, warm ? Number(warm.t) : NaN);
    drawFromRows(a.rows);
    const yesNo = (v) => (v ? '<span class="dot on">Yes</span>' : '<span class="dot">No</span>');
    const time = (r) => (!r.ok ? 'Not scored' : r.noChange ? 'No change' : r.recoverySec === null ? 'Not yet' : r.recoverySec < 60 ? `${Math.round(r.recoverySec)} s` : `${(r.recoverySec / 60).toFixed(1)} min`);
    $('color-detail').innerHTML = `
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Finger</th><th>Biggest change</th><th>White</th><th>Blue</th><th>Red</th><th>Sharp border</th><th>Recovery</th></tr></thead>
        <tbody>${FINGERS.map((f) => {
          const x = a.fingers[f];
          return `<tr><th scope="row">${NAMES[f]}</th><td>${x.peak.toFixed(1)}</td><td>${yesNo(x.pale)}</td><td>${yesNo(x.blue)}</td><td>${yesNo(x.red)}</td><td>${x.borderMeasured ? yesNo(x.border) : '–'}</td><td>${time(x.recovery)}</td></tr>`;
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

  // After analysis the re-scored rows are saved, so change_score matches what the app used.
  $('btn-csv').onclick = () => rec.downloadCSV(sessionName, analysis?.ok ? analysis.rows : rec.getRows());
  $('btn-events').onclick = () => rec.downloadEvents(sessionName);

  // ---------- PDF report content ----------

  function report() {
    const measurements = [];
    const images = [];
    if (!analysis?.ok) return { measurements, images };
    const a = analysis;
    const fmt = (s) => (s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
    measurements.push(['Recorded', `${context.startedAt}, ${context.hand || 'hand not specified'} hand, reference: ${context.reference}`]);
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
    return { measurements, images };
  }

  // ---------- Helpers ----------

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

  function drawBox(octx, p, color) {
    octx.strokeStyle = color;
    octx.lineWidth = 3;
    octx.strokeRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  let enabled = false;

  return {
    onFrame,
    report,
    // true while recording or saving the normal color: do not switch condition, hand or camera
    isBusy: () => rec.isRecording() || baselineBuffer !== null,
    enable() {
      enabled = true;
      btnBaseline.disabled = false;
      btnRecord.disabled = false;
    },
    // Camera off: the normal color belongs to that camera session and light.
    disable() {
      enabled = false;
      baseline = null;
      updateBaselineInfo();
      renderFingers(fingersEl, FINGERS.map((name) => ({ name, change: null })));
      btnBaseline.disabled = true;
      btnRecord.disabled = true;
    },
    // A normal color belongs to one hand.
    handChanged() {
      if (!baseline) return;
      baseline = null;
      updateBaselineInfo();
    },
    // Page hidden or camera lost: never score an interrupted recording.
    cancel() {
      if (baselineBuffer) {
        baselineBuffer = null;
        updateBaselineInfo();
      }
      if (rec.isRecording()) {
        rec.addEvent('interrupted');
        stopRecording();
      }
    },
    releaseScreen,
  };
}
