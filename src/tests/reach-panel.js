import { drawDot } from '../draw.js';

// Thumb opposition ("thumb reach") test for carpal tunnel:
// touch the thumb tip to the index, middle, ring and little fingertips in turn within 20 seconds.
// The median nerve drives the thumb muscles that make this movement, so failing to reach the little finger
// supports the CTS-6 item "thenar weakness". It does not measure strength.

export const TARGETS = [
  ['index', 8],
  ['middle', 12],
  ['ring', 16],
  ['pinky', 20],
];
export const CONTACT = 0.2; // thumb-to-fingertip distance in hand sizes that counts as touching (engineering value)
export const OPEN_START = 0.45; // thumb must start away from the index finger
const LIMIT_MS = 20000;
const HOLD_FRAMES = 2; // two frames in a row, so one jittery frame cannot count as a touch
const NAMES = { index: 'index', middle: 'middle', ring: 'ring', pinky: 'little' };

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
export function gapTo(world, idx) {
  const size = dist(world[0], world[9]);
  return size > 0 ? dist(world[4], world[idx]) / size : Infinity;
}

// Pure step function so the rules can be tested without a camera.
export function createReachCounter() {
  let target = 0;
  let streak = 0;
  const reached = { index: false, middle: false, ring: false, pinky: false };
  const minGap = { index: Infinity, middle: Infinity, ring: Infinity, pinky: Infinity };
  return {
    update(world) {
      if (target >= TARGETS.length) return { done: true, target: null };
      const [name, idx] = TARGETS[target];
      const g = gapTo(world, idx);
      minGap[name] = Math.min(minGap[name], g);
      streak = g < CONTACT ? streak + 1 : 0;
      if (streak >= HOLD_FRAMES) {
        reached[name] = true;
        target++;
        streak = 0;
      }
      return { done: target >= TARGETS.length, target: TARGETS[target]?.[0] ?? null, gap: g };
    },
    // If time runs out on one finger, the user can still try the next ones.
    skip() {
      if (target < TARGETS.length) target++;
      streak = 0;
    },
    get target() {
      return TARGETS[target]?.[0] ?? null;
    },
    result: () => ({ reached: { ...reached }, minGap: { ...minGap } }),
  };
}

export function createReachPanel({ setStatus, setBusy, onResult }) {
  const $ = (id) => document.getElementById(id);
  const btn = $('reach-start');
  const live = $('reach-live');
  const detail = $('reach-detail');
  let phase = 'idle'; // idle -> ready -> testing
  let readyAt = null;
  let t0 = 0;
  let targetSince = 0;
  let frames = 0;
  let tracked = 0;
  let counter = null;

  btn.onclick = () => (phase === 'idle' ? start() : cancel('Test cancelled.'));

  function start() {
    phase = 'ready';
    readyAt = null;
    counter = createReachCounter();
    frames = 0;
    tracked = 0;
    btn.textContent = 'Cancel test';
    detail.innerHTML = '';
    setBusy(true);
    setStatus('Palm toward the camera, thumb away from your fingers.');
  }

  function cancel(msg) {
    phase = 'idle';
    setBusy(false);
    btn.textContent = 'Start thumb reach test';
    live.textContent = msg;
  }

  function finish(now) {
    const r = counter.result();
    const coverage = frames ? tracked / frames : 0;
    phase = 'idle';
    setBusy(false);
    btn.textContent = 'Repeat thumb reach test';
    const seconds = (now - t0) / 1000;
    if (coverage < 0.8) {
      detail.innerHTML = `<p class="quality-note">Not scored. Your hand was tracked in ${(coverage * 100).toFixed(0)}% of frames (80% needed). Use brighter light and keep the whole hand in view.</p>`;
      onResult({ ok: false });
      setStatus('Thumb reach test needs another attempt.');
      return;
    }
    const rows = TARGETS.map(([n]) => `<tr><th scope="row">${NAMES[n][0].toUpperCase() + NAMES[n].slice(1)} fingertip</th><td class="${r.reached[n] ? '' : 'flag'}">${r.reached[n] ? 'Reached' : 'Not reached'}</td><td>${Number.isFinite(r.minGap[n]) ? r.minGap[n].toFixed(2) : '–'}</td></tr>`).join('');
    detail.innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Target</th><th>Result</th><th>Closest gap</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="fine-print">Gap is the thumb-to-fingertip distance divided by hand size; under ${CONTACT} for two frames counts as a touch. Finished in ${seconds.toFixed(1)} s, hand tracked in ${(coverage * 100).toFixed(0)}% of frames.</p>`;
    onResult({ ok: true, reached: r.reached, minGap: r.minGap, seconds });
    setStatus('Thumb reach test finished.');
  }

  function onFrame(hand, now, octx) {
    if (phase === 'idle') {
      live.textContent = hand ? 'Hand found. Press start when ready.' : 'Show your hand to the camera.';
      return;
    }
    if (phase === 'ready') {
      if (!hand || gapTo(hand.world, 8) < OPEN_START) {
        readyAt = null;
        live.textContent = 'Hold your hand open with the thumb away from your fingers.';
        return;
      }
      if (readyAt === null) readyAt = now;
      live.textContent = `Get ready. Starting in ${Math.max(1, Math.ceil((2000 - (now - readyAt)) / 1000))}`;
      if (now - readyAt >= 2000) {
        phase = 'testing';
        t0 = now;
        targetSince = now;
      }
      return;
    }
    frames++;
    if (hand) {
      tracked++;
      const target = counter.target;
      const idx = TARGETS.find(([n]) => n === target)?.[1];
      if (idx !== undefined) {
        drawDot(octx, hand.image[4], '#22c55e', 9);
        drawDot(octx, hand.image[idx], '#f59e0b', 12);
      }
      const before = counter.target;
      const r = counter.update(hand.world);
      if (counter.target !== before) targetSince = now;
      if (r.done) return finish(now);
      live.textContent = `Touch your thumb to your ${NAMES[counter.target]} fingertip`;
    } else {
      live.textContent = 'Hand not found. Keep your whole hand in view.';
    }
    // 6 seconds per fingertip, 20 seconds in total.
    if (now - targetSince > 6000) {
      counter.skip();
      targetSince = now;
      if (!counter.target) return finish(now);
    }
    if (now - t0 > LIMIT_MS) finish(now);
  }

  return {
    enable() {
      btn.disabled = false;
    },
    disable() {
      btn.disabled = true;
      live.textContent = 'Start the camera first.';
    },
    cancel() {
      if (phase !== 'idle') cancel('Test interrupted. Start again with this page visible.');
    },
    isRunning: () => phase !== 'idle',
    onFrame,
  };
}
