export const SMOOTH_SECONDS = 10;
export const HOLD_SECONDS = 30;
export const RECOVERY_FRACTION = 0.1;

export function smooth(values, windowSize = SMOOTH_SECONDS) {
  const before = windowSize - 1 - Math.floor(windowSize / 2);
  const after = Math.floor(windowSize / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - before);
    const end = Math.min(values.length - 1, i + after);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += values[j];
    return sum / (end - start + 1);
  });
}

// This is a recording-quality rule, not a clinically validated threshold.
export const MAX_GAP_SECONDS = 2.5;
export function computeRecovery(rows, events, noise, finger = 'middle') {
  const fail = (reason) => ({ ok: false, reason });
  if (events.some(e => e.type === 'interrupted')) return fail('Recording interrupted when the page was hidden. Raw data is available; repeat for a recovery estimate.');
  const warm = events.find(e => e.type === 'warm_start');
  if (!warm || !Number.isFinite(Number(warm.t))) return fail('Mark the start of warming before finishing the recording.');
  if (!Number.isFinite(noise) || noise < 0) return fail('Save a valid normal-color baseline first.');
  const series = rows.filter(r => r.finger === finger && r.change_score !== '' && r.change_score != null)
    .map(r => ({ t: Number(r.t), v: Number(r.change_score) }))
    .filter(s => Number.isFinite(s.t) && Number.isFinite(s.v) && s.v >= 0)
    .sort((a, b) => a.t - b.t);
  const tWarm = Number(warm.t);
  const after = series.filter(s => s.t >= tWarm);
  if (after.length < 2 || after.at(-1).t - after[0].t < 60) return fail('Record at least 60 seconds of visible-hand data after warming begins.');
  if (after[0].t - tWarm > MAX_GAP_SECONDS) return fail('Hand tracking was missing at the start of warming. A recovery time cannot be estimated.');
  if (after.some((s, i) => i > 0 && (s.t <= after[i - 1].t || s.t - after[i - 1].t > MAX_GAP_SECONDS))) {
    return fail('Hand tracking has gaps. This session cannot support a continuous recovery estimate; raw data is available.');
  }
  // A trailing, timestamp-based window avoids looking ahead or bridging missing samples.
  const vals = after.map((s, i) => {
    const window = after.slice(0, i + 1).filter(p => s.t - p.t < SMOOTH_SECONDS);
    return window.reduce((sum, p) => sum + p.v, 0) / window.length;
  });
  const startScore = vals[0];
  const threshold = Math.max(RECOVERY_FRACTION * startScore, noise);
  if (startScore <= threshold) return { ok: true, startScore, threshold, noise, recoverySec: null, noChange: true, algorithm: 2 };
  let belowSince = null;
  let recoverySec = null;
  for (let i = 0; i < after.length; i++) {
    if (vals[i] > threshold) belowSince = null;
    else {
      if (belowSince === null) belowSince = after[i].t;
      if (after[i].t - belowSince >= HOLD_SECONDS) {
        recoverySec = belowSince - tWarm;
        break;
      }
    }
  }
  return { ok: true, startScore, threshold, noise, recoverySec, algorithm: 2 };
}
