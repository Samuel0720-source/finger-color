import { computeRecovery } from '../recovery.js';
import { describeChange } from '../plain.js';

// Turns a color recording into the Raynaud's features a camera can see:
//   which phases appeared (white / blue / red), how many fingers changed, whether the thumb was spared,
//   whether the change stopped at a sharp border, and how long each finger took to recover.
// Rows are one per finger per second with palm-referenced values (finger minus palm):
//   palm_dL, palm_da, palm_db for the fingertip, prox_dL, prox_da, prox_db for the base of the same finger.

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const PHASE_MIN = 6; // color change (CIELAB distance) that counts as a clear phase; 3 is barely visible
export const BORDER_RATIO = 0.4; // base of the finger changed less than 40% of the tip = sharp border
const END_SECONDS = 10;
// If the color of a STEADY hand already wobbles this much (mean + 2 SD of the reference samples), noise is close to
// the phase threshold and the camera cannot tell a real phase from noise. In the simulated population this happened
// only in dim light (noise 5-7.4 vs 1.5-3.9 in normal light), so the recording is not scored and the user is told why.
export const NOISE_MAX = 0.75 * PHASE_MIN;
const NAMES = { thumb: 'thumb', index: 'index finger', middle: 'middle finger', ring: 'ring finger', pinky: 'little finger' }; // episode mode: the last 10 s (hand warm again) become the reference

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const tipOf = (r) => ({ L: num(r.palm_dL), a: num(r.palm_da), b: num(r.palm_db) });
const proxOf = (r) => ({ L: num(r.prox_dL), a: num(r.prox_da), b: num(r.prox_db) });
const minus = (p, q) => ({ L: p.L - q.L, a: p.a - q.a, b: p.b - q.b });
const finite = (p) => [p.L, p.a, p.b].every(Number.isFinite);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));
const avgColor = (list) => ({ L: mean(list.map((p) => p.L)), a: mean(list.map((p) => p.a)), b: mean(list.map((p) => p.b)) });

// Reference color for each finger: the saved normal color, or (episode mode) the end of the recording.
// Episode mode trusts the end of the recording as "normal" only when warming was marked, at least
// END_AFTER_WARM seconds were recorded after it, and no fingertip still looks paler or bluer than the base
// of the same finger. Otherwise a hand that never recovered would become its own "normal" and look healthy.
export const END_AFTER_WARM = 60;
function stillChanged(fingers) {
  return FINGERS.filter((f) => {
    const { tip, prox } = fingers[f];
    if (!prox) return false;
    const gap = describeChange(minus(tip, prox));
    return gap.score >= PHASE_MIN && (gap.label === 'Paler' || gap.label === 'Bluer');
  });
}

function referenceFrom(rows, baseline) {
  if (baseline) {
    return {
      source: 'saved',
      fingers: Object.fromEntries(FINGERS.map((f) => [f, { tip: baseline.fingers[f], prox: baseline.fingers[f].prox || null }])),
      noise: Object.fromEntries(FINGERS.map((f) => [f, baseline.noiseByFinger?.[f] ?? baseline.noise])),
    };
  }
  const tEnd = Math.max(...rows.map((r) => num(r.t)));
  const fingers = {};
  const noise = {};
  for (const f of FINGERS) {
    const last = rows.filter((r) => r.finger === f && num(r.t) >= tEnd - END_SECONDS);
    const tips = last.map(tipOf).filter(finite);
    const proxes = last.map(proxOf).filter(finite);
    if (tips.length < 5) return null;
    const tip = avgColor(tips);
    const dist = tips.map((p) => Math.hypot(p.L - tip.L, p.a - tip.a, p.b - tip.b));
    fingers[f] = { tip, prox: proxes.length >= 5 ? avgColor(proxes) : null };
    noise[f] = mean(dist) + 2 * sd(dist);
  }
  return { source: 'end', fingers, noise, tEnd };
}

export function analyzeColorRecording(rows, events, baseline = null) {
  if (!rows || rows.length === 0) return { ok: false, reason: 'No color data was recorded.' };
  // Page hidden or camera lost mid-recording: the CSV can still be downloaded, but it is never scored.
  if (events.some((e) => e.type === 'interrupted')) return { ok: false, interrupted: true, reason: 'The recording was interrupted (the page was hidden or the camera stopped), so it was not scored. Record again.' };
  const ref = referenceFrom(rows, baseline);
  if (!ref) return { ok: false, reason: 'Keep your hand in view for the last 10 seconds so the app can learn your normal color.' };

  const warm = events.find((e) => e.type === 'warm_start');
  const tWarm = warm ? num(warm.t) : null;
  const noiseLevels = FINGERS.map((f) => ref.noise[f]).filter(Number.isFinite).sort((p, q) => p - q);
  const typicalNoise = noiseLevels[Math.floor(noiseLevels.length / 2)];
  if (typicalNoise >= NOISE_MAX) {
    return { ok: false, tooNoisy: true, noiseLevel: typicalNoise, reason: `The light is too dim or flickering: even a still hand changed by ${typicalNoise.toFixed(1)} (${NOISE_MAX.toFixed(1)} or less needed), so real color changes cannot be told apart from noise. Record again in brighter, steady light.` };
  }
  if (ref.source === 'end') {
    if (tWarm === null || ref.tEnd - tWarm < END_AFTER_WARM) {
      return { ok: false, reason: `Without a saved normal color, press "I'm warming up now" and keep recording at least ${END_AFTER_WARM} seconds after it, so the end of the recording shows your normal color.` };
    }
    const changed = stillChanged(ref.fingers);
    if (changed.length) {
      return { ok: false, notRecovered: changed, reason: `At the end of the recording your ${changed.map((f) => NAMES[f]).join(', ')} still looked paler or bluer than the base of the finger, so the app cannot use it as your normal color. Keep recording until the color is back, or save your normal color on a warm day.` };
    }
  }
  const perFinger = {};
  const rescored = [];

  for (const f of FINGERS) {
    const list = rows.filter((r) => r.finger === f).sort((p, q) => num(p.t) - num(q.t));
    const base = ref.fingers[f];
    const tips = list.map((r) => {
      const tip = tipOf(r);
      if (!finite(tip)) return null;
      const diff = minus(tip, base.tip);
      const change = describeChange(diff);
      const prox = base.prox && finite(proxOf(r)) ? describeChange(minus(proxOf(r), base.prox)).score : null;
      rescored.push({ ...r, change_score: change.score.toFixed(2), label: change.label });
      return { t: num(r.t), score: change.score, label: change.label, prox };
    }).filter(Boolean);

    // 3-sample median per label decision, so one noisy frame cannot create a phase.
    const phase = (label, from = -Infinity) => {
      for (let i = 1; i < tips.length - 1; i++) {
        const trio = tips.slice(i - 1, i + 2);
        if (trio[1].t < from) continue;
        if (trio.filter((p) => p.label === label && p.score >= PHASE_MIN).length >= 2) return true;
      }
      return false;
    };
    const peak = tips.reduce((best, p) => (p.score > best.score ? p : best), { score: 0, prox: null, t: null });
    const pale = phase('Paler');
    const blue = phase('Bluer');
    // Red counts only once warming has started (it is the rewarming phase).
    const red = tWarm !== null && phase('Redder', tWarm);
    const involved = peak.score >= PHASE_MIN;
    const border = involved && peak.prox !== null && peak.prox < BORDER_RATIO * peak.score;
    perFinger[f] = { peak: peak.score, pale, blue, red, involved, border, borderMeasured: peak.prox !== null };
  }

  const recovery = {};
  for (const f of FINGERS) {
    recovery[f] = computeRecovery(rescored, events, ref.noise[f], f);
    perFinger[f].recovery = recovery[f];
  }

  const list = (key) => FINGERS.filter((f) => perFinger[f][key]);
  const involved = list('involved');
  return {
    ok: true,
    source: ref.source,
    noise: ref.noise,
    fingers: perFinger,
    involved,
    pale: list('pale'),
    blue: list('blue'),
    red: list('red'),
    border: list('border'),
    borderMeasured: FINGERS.some((f) => perFinger[f].borderMeasured),
    thumbSpared: involved.length >= 2 && !perFinger.thumb.involved,
    middle: recovery.middle,
    rows: rescored,
  };
}
