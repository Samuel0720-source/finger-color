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

export function computeRecovery(rows, events, noise, finger = 'middle') {
  const warm = events.find((e) => e.type === 'warm_start');
  if (!warm) {
    return { ok: false, reason: 'You did not press "I\'m Back in the Warm".' };
  }

  const series = rows
    .filter((r) => r.finger === finger && r.change_score !== '')
    .map((r) => ({ t: Number(r.t), v: Number(r.change_score) }));
  if (series.length < 60) {
    return { ok: false, reason: 'The recording is too short. Record at least a few minutes.' };
  }

  const tWarm = Number(warm.t);
  const smoothed = smooth(series.map((s) => s.v));
  const times = [];
  const vals = [];
  series.forEach((s, i) => {
    if (s.t >= tWarm) {
      times.push(s.t - tWarm);
      vals.push(smoothed[i]);
    }
  });
  if (times.length === 0) {
    return { ok: false, reason: 'There is no data after you came back in the warm.' };
  }

  const startScore = vals[0];
  const threshold = Math.max(RECOVERY_FRACTION * startScore, noise);
  const last = times[times.length - 1];
  let recoverySec = null;

  for (let i = 0; i < times.length; i++) {
    if (times[i] + HOLD_SECONDS > last) break;
    let allBelow = true;
    for (let j = i; j < times.length && times[j] <= times[i] + HOLD_SECONDS; j++) {
      if (vals[j] > threshold) {
        allBelow = false;
        break;
      }
    }
    if (allBelow) {
      recoverySec = times[i];
      break;
    }
  }

  return { ok: true, startScore, threshold, noise, recoverySec };
}