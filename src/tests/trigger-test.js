import { smooth } from '../recovery.js';

export const STUCK_RANGE = 8; // degrees: moved less than this during MIN_STUCK_MS = finger is stuck
export const MIN_STUCK_MS = 150;
export const SNAP_DEG = 25; // degrees gained...
export const SNAP_MS = 120; // ...within this time after being stuck = finger snapped open
export const SMOOTH_SAMPLES = 3; // ~0.1 s at 30 fps. A 10-sample window would blur the snap away.

export const OPEN_ANGLE = 150; // PIP angle above this = finger open
export const CLOSED_ANGLE = 120; // PIP angle below this = finger bent

// samples: [{ t: ms, angle: degrees }, ...] for one finger
// Checks a whole time window instead of two frames, because the model wobbles a few degrees every frame.
export function findCatches(samples) {
  const catches = [];
  let lastStuck = null; // { t, angle } = the most recent moment the finger was stuck
  let start = 0; // first sample inside the stuck window
  for (let i = 0; i < samples.length; i++) {
    const now = samples[i];
    while (now.t - samples[start].t > MIN_STUCK_MS) start++;

    // 1) Was the finger stuck for the last MIN_STUCK_MS, somewhere in the middle of the movement?
    const covered = start > 0 && now.t - samples[start - 1].t >= MIN_STUCK_MS;
    if (covered) {
      const window = samples.slice(start, i + 1).map((s) => s.angle);
      const lo = Math.min(...window);
      const hi = Math.max(...window);
      const mid = (lo + hi) / 2;
      if (hi - lo < STUCK_RANGE && mid > 100 && mid < 165) lastStuck = { t: now.t, angle: mid };
    }

    // 2) Did it jump open quickly right after being stuck?
    if (lastStuck && now.t > lastStuck.t && now.t - lastStuck.t <= SNAP_MS) {
      const gained = now.angle - lastStuck.angle;
      if (gained >= SNAP_DEG) {
        catches.push({ t: now.t, angle: lastStuck.angle, speed: gained / ((now.t - lastStuck.t) / 1000) });
        lastStuck = null;
      }
    } else if (lastStuck && now.t - lastStuck.t > SNAP_MS) {
      lastStuck = null;
    }
  }
  return catches;
}

// One cycle = finger goes from bent (below CLOSED_ANGLE) back to open (above OPEN_ANGLE).
// Two limits instead of one so wobbling around a single limit is not counted many times.
export function countCycles(angles) {
  let bent = false;
  let cycles = 0;
  for (const a of angles) {
    if (!bent && a < CLOSED_ANGLE) bent = true;
    else if (bent && a > OPEN_ANGLE) {
      bent = false;
      cycles++;
    }
  }
  return cycles;
}

// times: ms, rawAngles: degrees for ONE finger
export function summarizeFinger(times, rawAngles) {
  if (times.length < 2) return { cycles: 0, catches: [], rangeDeg: 0, maxOpenSpeed: 0, smoothed: rawAngles };
  const angles = smooth(rawAngles, SMOOTH_SAMPLES);
  const samples = times.map((t, i) => ({ t, angle: angles[i] }));

  let maxOpenSpeed = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const opening = (samples[i].angle - samples[i - 1].angle) / dt; // positive = straightening
    if (opening > maxOpenSpeed) maxOpenSpeed = opening;
  }

  return {
    cycles: countCycles(angles),
    catches: findCatches(samples),
    rangeDeg: Math.max(...angles) - Math.min(...angles),
    maxOpenSpeed,
    smoothed: angles,
  };
}
