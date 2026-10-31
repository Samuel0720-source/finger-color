export const CLOSE = 0.15; // gap smaller than this (in hand sizes) = fingers touching
export const OPEN = 0.3; // gap bigger than this = fingers apart again
export const MAX_RELIABLE_TAPS_PER_SEC = 6; // at 30 fps, faster taps can fall between frames

function dist(p, q) {
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

export function createTapCounter() {
  let touching = false;
  const tapTimes = [];
  const trace = []; // every frame: { t, gap }, for the CSV
  return {
    update(world, tMs) {
      const handSize = dist(world[0], world[9]); // wrist to middle knuckle
      const gap = dist(world[4], world[8]) / handSize; // thumb tip to index tip
      if (!touching && gap < CLOSE) {
        touching = true;
        tapTimes.push(tMs);
      } else if (touching && gap > OPEN) {
        touching = false;
      }
      trace.push({ t: tMs, gap });
      return { gap, touching, taps: tapTimes.length };
    },
    result(durationMs) {
      const gaps = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
      if (gaps.length < 2) {
        return { taps: tapTimes.length, tapsPerSec: tapTimes.length / (durationMs / 1000), rhythmCV: null, tapTimes, trace };
      }
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / (gaps.length - 1));
      return { taps: tapTimes.length, tapsPerSec: 1000 / mean, rhythmCV: (sd / mean) * 100, tapTimes, trace };
    },
  };
}
