// The hand in the hero: the points the camera follows on a hand, drawn as a moving illustration
// of what each check looks at. It is a drawing, not a measurement, and the caption says so.
//
// The hand is a small 3D model: x goes right, y goes down, z comes toward you (palm facing you).
// Each finger is 4 points: knuckle, two joints, tip. To draw, we simply drop z.

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
const NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// base = knuckle position, dir = which way the finger points (degrees from straight up), len = bone lengths
const FINGERS = {
  thumb: { base: [150, 372, 0], dir: -50, len: [58, 44, 36], bend: [18, 34, 46], width: 40 },
  index: { base: [150, 232, 0], dir: -9, len: [64, 40, 30], bend: [78, 100, 62], width: 34 },
  middle: { base: [192, 218, 0], dir: -1, len: [72, 45, 32], bend: [78, 100, 62], width: 35 },
  ring: { base: [232, 228, 0], dir: 7, len: [66, 42, 30], bend: [78, 100, 62], width: 33 },
  pinky: { base: [268, 254, 0], dir: 17, len: [50, 30, 26], bend: [78, 100, 62], width: 29 },
};
const PALM = [[178, 432], [150, 372], [150, 232], [192, 218], [232, 228], [268, 254], [250, 428]];
// Where the thumb tip and each fingertip meet in the thumb reach test.
const MEET = { index: [172, 300, 62], middle: [190, 312, 66], ring: [208, 322, 64], pinky: [232, 322, 54] };

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// A finger curled by `curl` (0 = straight, 1 = fist). Each bone turns toward you by its share of the bend.
function fingerPoints(name, curl) {
  const f = FINGERS[name];
  const ux = Math.sin(f.dir * RAD);
  const uy = -Math.cos(f.dir * RAD);
  const pts = [f.base];
  let turn = 0;
  f.len.forEach((len, i) => {
    turn += f.bend[i] * curl * RAD;
    const [x, y, z] = pts[i];
    pts.push([x + len * Math.cos(turn) * ux, y + len * Math.cos(turn) * uy, z + len * Math.sin(turn)]);
  });
  return pts;
}

// Move the tip of a chain of bones onto a target, keeping every bone's length (the FABRIK method).
function reachTo(points, target) {
  const pts = points.map((p) => [...p]);
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const base = [...pts[0]];
  const pull = (from, to, len) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) || 1;
    return from.map((v, k) => v + ((to[k] - v) * len) / d);
  };
  for (let n = 0; n < 12; n++) {
    pts[pts.length - 1] = [...target];
    for (let i = pts.length - 2; i >= 0; i--) pts[i] = pull(pts[i + 1], pts[i], lens[i]);
    pts[0] = [...base];
    for (let i = 1; i < pts.length; i++) pts[i] = pull(pts[i - 1], pts[i], lens[i - 1]);
  }
  return pts;
}

const openPose = () => Object.fromEntries(NAMES.map((n) => [n, fingerPoints(n, 0)]));
const mix = (a, b, t) => a.map((p, i) => p.map((v, k) => lerp(v, b[i][k], t)));

// Angle at the middle joint, measured the way the app does it: 180 = straight.
function jointAngle([a, b, c]) {
  const v1 = a.map((v, k) => v - b[k]);
  const v2 = c.map((v, k) => v - b[k]);
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  return Math.acos(Math.min(1, Math.max(-1, dot / (Math.hypot(...v1) * Math.hypot(...v2))))) / RAD;
}

// ---------- The three scenes. Each returns the pose and labels for time t (seconds). ----------

// Trigger finger: two smooth fists, then one where the middle finger catches half-way and snaps open.
function triggerScene(t) {
  const T = t % 7.2;
  let all = 0;
  let middle = 0;
  let note = 'Smooth';
  const fist = (start) => {
    const x = (T - start) / 1.9;
    return x <= 0 || x >= 1 ? 0 : ease(x < 0.5 ? x * 2 : (1 - x) * 2);
  };
  if (T < 4) {
    all = middle = Math.max(fist(0.2), fist(2.1));
  } else {
    const x = T - 4;
    if (x < 0.95) all = middle = ease(clamp01(x / 0.95));
    else if (x < 1.9) {
      all = 1 - ease(clamp01((x - 0.95) / 0.95));
      middle = Math.max(all, 0.5); // the middle finger stops half-way
      if (all < 0.5) note = 'Catch';
    } else if (x < 2.45) {
      middle = 0.5;
      note = 'Catch';
    } else if (x < 2.57) {
      middle = 0.5 * (1 - (x - 2.45) / 0.12); // then snaps open
      note = 'Snap';
    }
  }
  const pose = {};
  for (const n of NAMES) pose[n] = fingerPoints(n, n === 'middle' ? middle : n === 'thumb' ? all * 0.8 : all);
  const angle = jointAngle(pose.middle);
  return { pose, chip: `Middle finger ${angle.toFixed(0)}°`, tag: note === 'Smooth' ? '' : note === 'Catch' ? 'Catch: paused mid-bend' : 'Snapped open', arc: true, alert: note !== 'Smooth' };
}

// Carpal tunnel: the thumb reaches to each fingertip in turn.
const TOUCH = {};
function touchPose(target) {
  if (!TOUCH[target]) {
    const pose = openPose();
    pose.thumb = reachTo(fingerPoints('thumb', 0.9), MEET[target]);
    pose[target] = reachTo(fingerPoints(target, 0.55), MEET[target]);
    TOUCH[target] = pose;
  }
  return TOUCH[target];
}
const REACH_ORDER = ['index', 'middle', 'ring', 'pinky'];
function carpalScene(t) {
  const step = 1.7;
  // Rounding can make the division land exactly on 4 at the end of a loop, so keep the index inside the list.
  const i = Math.min(REACH_ORDER.length - 1, Math.max(0, Math.floor((t % (step * 4)) / step)));
  const x = (t % step) / step;
  const target = REACH_ORDER[i];
  const amount = x < 0.4 ? ease(x / 0.4) : x < 0.72 ? 1 : 1 - ease((x - 0.72) / 0.28);
  const open = openPose();
  const touch = touchPose(target);
  const pose = {};
  for (const n of NAMES) pose[n] = mix(open[n], touch[n], amount);
  const label = target === 'pinky' ? 'little' : target;
  return { pose, chip: `Thumb to ${label} fingertip`, tag: amount === 1 ? 'Reached' : '', ping: amount === 1 ? MEET[target] : null };
}

// Raynaud's: three fingertips turn white, then blue, then red as they warm, then back to normal.
const PHASES = [
  ['normal', 'Normal color', 2],
  ['white', 'White: blood flow drops', 2.2],
  ['blue', 'Blue: low oxygen', 2.2],
  ['red', 'Red: warming up again', 2.2],
  ['normal', 'Back to normal', 1.6],
];
const PHASE_TOTAL = PHASES.reduce((s, p) => s + p[2], 0);
function raynaudScene(t) {
  let T = t % PHASE_TOTAL;
  let phase = PHASES[0];
  for (const p of PHASES) {
    if (T < p[2]) {
      phase = p;
      break;
    }
    T -= p[2];
  }
  const sway = 0.03 + 0.02 * Math.sin(t * 1.3);
  const pose = {};
  for (const n of NAMES) pose[n] = fingerPoints(n, sway);
  return { pose, chip: phase[1], tag: '', tips: phase[0] };
}

const SCENES = { raynaud: raynaudScene, trigger: triggerScene, carpal: carpalScene };
// A still frame of each scene, for people who have asked their device for less motion.
const STILL = { raynaud: 5, trigger: 6.2, carpal: 0.9 };
const ALT = {
  raynaud: 'Illustration: a hand with three fingertips changing color, as in a Raynaud\'s episode.',
  trigger: 'Illustration: a hand making a fist, with the angle of the middle finger\'s joint shown.',
  carpal: 'Illustration: a thumb touching each fingertip in turn.',
};

export function mountHeroHand(root) {
  const el = (tag, attrs = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent?.appendChild(node);
    return node;
  };
  const svg = el('svg', { viewBox: '15 50 320 400', class: 'hh-svg', role: 'img' });
  const flesh = el('g', { class: 'hh-flesh' }, svg);
  const palmFlesh = el('polygon', {}, flesh);
  const fleshLines = Object.fromEntries(NAMES.map((n) => [n, el('polyline', { 'stroke-width': FINGERS[n].width }, flesh)]));
  const bones = el('g', { class: 'hh-bones' }, svg);
  const palmLine = el('polyline', {}, bones);
  const boneLines = Object.fromEntries(NAMES.map((n) => [n, el('polyline', {}, bones)]));
  const arc = el('path', { class: 'hh-arc' }, svg);
  const joints = el('g', { class: 'hh-joints' }, svg);
  const dots = Object.fromEntries(NAMES.map((n) => [n, [0, 1, 2, 3].map((i) => el('circle', { r: i === 3 ? 7 : 4.5, class: i === 3 ? 'hh-tip' : '' }, joints))]));
  const wristDot = el('circle', { r: 4.5, cx: 214, cy: 430 }, joints);
  const ping = el('circle', { class: 'hh-ping', r: 16 }, svg);

  const chip = document.createElement('p');
  chip.className = 'hh-chip';
  const tag = document.createElement('p');
  tag.className = 'hh-tag';
  root.append(svg, chip, tag);

  let mode = 'raynaud';
  let visible = true;
  let frame = null;
  let t0 = performance.now();
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  const xy = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  function draw(t) {
    const s = SCENES[mode](t);
    palmFlesh.setAttribute('points', xy(PALM));
    palmLine.setAttribute('points', xy([[214, 430], ...NAMES.map((n) => s.pose[n][0]), [214, 430]]));
    for (const n of NAMES) {
      fleshLines[n].setAttribute('points', xy(s.pose[n]));
      boneLines[n].setAttribute('points', xy(s.pose[n]));
      s.pose[n].forEach((p, i) => {
        dots[n][i].setAttribute('cx', p[0].toFixed(1));
        dots[n][i].setAttribute('cy', p[1].toFixed(1));
      });
      const changing = s.tips && s.tips !== 'normal' && ['index', 'middle', 'ring'].includes(n);
      dots[n][3].dataset.tone = changing ? s.tips : '';
    }
    wristDot.setAttribute('cx', 214);
    if (s.arc) {
      // A small arc at the middle finger's middle joint, where the app measures the angle.
      const [a, b, c] = s.pose.middle;
      const r = 17;
      const unit = (p) => {
        const d = Math.hypot(p[0] - b[0], p[1] - b[1]) || 1;
        return [(p[0] - b[0]) / d, (p[1] - b[1]) / d];
      };
      const u1 = unit(a);
      const u2 = unit(c);
      const sweep = u1[0] * u2[1] - u1[1] * u2[0] > 0 ? 1 : 0;
      arc.setAttribute('d', `M${(b[0] + u1[0] * r).toFixed(1)} ${(b[1] + u1[1] * r).toFixed(1)} A${r} ${r} 0 0 ${sweep} ${(b[0] + u2[0] * r).toFixed(1)} ${(b[1] + u2[1] * r).toFixed(1)}`);
    }
    arc.style.display = s.arc ? '' : 'none';
    ping.style.display = s.ping ? '' : 'none';
    if (s.ping) {
      ping.setAttribute('cx', s.ping[0]);
      ping.setAttribute('cy', s.ping[1]);
    }
    if (chip.textContent !== s.chip) chip.textContent = s.chip;
    if (tag.textContent !== s.tag) tag.textContent = s.tag;
    tag.hidden = !s.tag;
    root.dataset.alert = String(Boolean(s.alert));
  }

  function loop(now) {
    draw((now - t0) / 1000);
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = null;
    if (calm.matches) draw(STILL[mode]);
    else if (visible && !document.hidden) frame = requestAnimationFrame(loop);
  }

  // Only animate while the drawing is on screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }).observe(root);
  }
  document.addEventListener('visibilitychange', sync);
  calm.addEventListener?.('change', sync);

  return {
    setMode(next) {
      if (!SCENES[next]) return;
      mode = next;
      t0 = performance.now();
      root.dataset.mode = mode;
      svg.setAttribute('aria-label', ALT[mode]);
      sync();
      if (!frame) draw(calm.matches ? STILL[mode] : 0);
    },
  };
}
