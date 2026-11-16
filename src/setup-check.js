// A small "is the camera set up well?" list under the video.
// It only gives tips. It does not change how any test is scored: each test still applies its own rules.
//
// Why it exists: in the pilot, 2 of 8 trigger finger runs were not scored, and a hand that is cut off
// or a slow camera are the usual reasons. Seeing the problem before pressing Start saves a wasted run.

export const MIN_FPS = 25; // the timed tests need at least this many frames per second
const EDGE = 0.03; // a point this close to the border is probably cut off
const MIN_SPAN = 0.3; // the hand should fill at least this share of the picture

// Pure function so it can be unit-tested. points: 21 landmarks with x and y from 0 to 1, or null.
export function checkSetup(points, fps) {
  const hand = Boolean(points && points.length);
  let framing = { ok: false, hint: 'Show your whole hand to the camera.' };
  if (hand) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const cut = Math.min(...xs) < EDGE || Math.max(...xs) > 1 - EDGE || Math.min(...ys) < EDGE || Math.max(...ys) > 1 - EDGE;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (cut) framing = { ok: false, hint: 'Part of your hand is at the edge. Move it to the middle or a little farther away.' };
    else if (span < MIN_SPAN) framing = { ok: false, hint: 'Your hand looks small. Move it closer to the camera.' };
    else framing = { ok: true, hint: '' };
  }
  const speed = { ok: fps >= MIN_FPS, hint: fps >= MIN_FPS ? '' : `The camera is running at ${Math.round(fps)} frames per second; timed tests need ${MIN_FPS}. Close other tabs and apps, and use brighter light.` };
  return {
    hand: { ok: hand, hint: hand ? '' : 'No hand found yet. Hold your open hand in front of the camera.' },
    framing,
    speed,
    ready: hand && framing.ok && speed.ok,
  };
}

export function createSetupCheck(root) {
  root.innerHTML = `
    <ul class="setup-list" aria-label="Camera setup">
      <li data-k="hand">Hand found</li>
      <li data-k="framing">Whole hand in the picture</li>
      <li data-k="speed">Camera fast enough</li>
    </ul>
    <p class="setup-hint" role="status"></p>`;
  const items = Object.fromEntries([...root.querySelectorAll('li')].map((li) => [li.dataset.k, li]));
  const hint = root.querySelector('.setup-hint');
  let frames = 0;
  let since = 0;
  let fps = 0;
  let lastText = '';

  return {
    show(on) {
      root.classList.toggle('hidden', !on);
      frames = 0;
      since = 0;
    },
    // Called once per video frame. The list is redrawn about twice a second, not on every frame.
    onFrame(hand, now) {
      frames++;
      if (!since) since = now;
      if (now - since < 500) return;
      fps = (frames * 1000) / (now - since);
      frames = 0;
      since = now;
      const c = checkSetup(hand ? hand.image : null, fps);
      for (const k of ['hand', 'framing', 'speed']) items[k].dataset.ok = String(c[k].ok);
      const text = c.ready ? 'Ready. You can start the test.' : c.hand.hint || c.framing.hint || c.speed.hint;
      if (text !== lastText) hint.textContent = lastText = text; // only speak to screen readers when the advice changes
      root.dataset.ready = String(c.ready);
    },
  };
}
