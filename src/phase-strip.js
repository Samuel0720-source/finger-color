// Draws each finger's color phase over time: white (pale), blue, red, near normal.
// One row per finger, one column per second. The darker the shade, the bigger the change.

// Near normal is a mid grey so that the white (pale) phase stands out as truly white.
const COLORS = {
  Paler: [252, 251, 248],
  Bluer: [70, 96, 170],
  Redder: [196, 64, 58],
  Darker: [120, 84, 60],
  'Near baseline': [196, 205, 201],
};
const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little' };
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export function drawPhaseStrip(canvas, rows, tWarm) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const rowH = 22;
  const labelW = 64;
  const height = FINGERS.length * (rowH + 6) + 24;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  const times = rows.map((r) => Number(r.t));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (t) => labelW + ((t - t0) / Math.max(1, t1 - t0)) * (width - labelW - 4);
  ctx.font = '12px "Instrument Sans Variable", system-ui, sans-serif';

  FINGERS.forEach((f, i) => {
    const y = i * (rowH + 6);
    ctx.fillStyle = '#4d5a6d';
    ctx.fillText(NAMES[f], 0, y + 15);
    const list = rows.filter((r) => r.finger === f).sort((p, q) => Number(p.t) - Number(q.t));
    list.forEach((r, k) => {
      const next = list[k + 1];
      const xa = x(Number(r.t));
      const xb = next ? x(Number(next.t)) : xa + 2;
      const base = COLORS[r.label] || COLORS['Near baseline'];
      const strength = Math.min(1, Number(r.change_score) / 15);
      const rgb = r.label === 'Near baseline' ? base : base.map((c, j) => Math.round(COLORS['Near baseline'][j] + (c - COLORS['Near baseline'][j]) * (0.35 + 0.65 * strength)));
      ctx.fillStyle = `rgb(${rgb.join(',')})`;
      ctx.fillRect(xa, y, Math.max(1, xb - xa + 0.5), rowH);
    });
    // Thin outline so a white phase is visible against the page.
    ctx.strokeStyle = '#a89c86';
    ctx.lineWidth = 1;
    ctx.strokeRect(labelW + 0.5, y + 0.5, width - labelW - 4, rowH - 1);
  });

  // Time labels along the bottom. The end label sits flush right; "Warming" moves left of the
  // marker when it would run into it, so the two never overlap.
  const endText = `${Math.round(t1 - t0)} s`;
  const endW = ctx.measureText(endText).width;
  ctx.fillStyle = '#4d5a6d';
  ctx.fillText('0 s', labelW, height - 6);
  ctx.fillText(endText, width - 4 - endW, height - 6);
  if (Number.isFinite(tWarm)) {
    const xw = x(tWarm);
    ctx.strokeStyle = '#0b1f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xw, 0);
    ctx.lineTo(xw, FINGERS.length * (rowH + 6) - 6);
    ctx.stroke();
    ctx.fillStyle = '#0b1f3a';
    const warmW = ctx.measureText('Warming').width;
    const right = width - 4 - endW - 8; // keep 8 px clear of the end label
    let lx = xw + 4; // normally just right of the marker
    if (lx + warmW > right) lx = Math.min(xw - 4, right) - warmW; // too close to the end: end it before the marker and the end label
    lx = Math.max(labelW + ctx.measureText('0 s').width + 8, lx); // and never on top of "0 s"
    ctx.fillText('Warming', lx, height - 6);
  }
}

export const PHASE_LEGEND = [
  ['White / pale', COLORS.Paler],
  ['Blue', COLORS.Bluer],
  ['Red', COLORS.Redder],
  ['Near normal', COLORS['Near baseline']],
];
