// Stand-ins for src/hand.js. The browser test swaps the real MediaPipe model for one of these,
// so each test knows exactly where the hand is and how it moves. Each export is JavaScript source text.
import { SPOTS, PALM, baseOf } from './video.mjs';

// Raynaud's: the color boxes sit on the colored squares painted in the episode video.
export const colorHand = `
export async function loadHandModel() {}
export function detectHand() {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  return { image: p, world: p };
}
const SPOTS = ${JSON.stringify(SPOTS)};
const BASES = ${JSON.stringify(Object.fromEntries(Object.entries(SPOTS).map(([f, s]) => [f, baseOf(s)])))};
export function fingertipSpots(pts, w, h) {
  const tips = {}, bases = {};
  for (const f of Object.keys(SPOTS)) {
    tips[f] = { x: SPOTS[f][0] * w, y: SPOTS[f][1] * h, size: 16 };
    bases[f] = { x: BASES[f][0] * w, y: BASES[f][1] * h, size: 10 };
  }
  tips.palm = { x: ${PALM[0]} * w, y: ${PALM[1]} * h, size: 30 };
  return { tips, bases };
}`;

// Trigger finger: all fingers open and close every 2 s. The ring finger catches once (stops at 130 deg,
// then snaps open) and the little finger never straightens past 128 deg. Time starts at window.__go.
export const triggerHand = `
export async function loadHandModel() {}
function base(ms) { const u = (ms % 2000) / 2000; return u < 0.5 ? 175 - 90 * (u / 0.5) : 85 + 90 * ((u - 0.5) / 0.5); }
function ringAngle(ms) {
  const c = Math.floor(ms / 2000), u = (ms % 2000) / 2000;
  if (c !== 2 || u < 0.5) return base(ms);
  const v = (u - 0.5) / 0.5;
  if (v < 0.35) return 85 + 45 * (v / 0.35);
  if (v < 0.6) return 130;
  if (v < 0.66) return 130 + 45 * ((v - 0.6) / 0.06);
  return 175;
}
function chain(w, start, x, ang) {
  const phi = (180 - ang) * Math.PI / 180;
  w[start] = { x, y: 0, z: 0 };
  w[start + 1] = { x, y: 0.04, z: 0 };
  w[start + 2] = { x, y: 0.04 + 0.03 * Math.cos(phi), z: 0.03 * Math.sin(phi) };
  w[start + 3] = { x, y: w[start + 2].y + 0.02 * Math.cos(phi), z: w[start + 2].z + 0.02 * Math.sin(phi) };
}
export function detectHand() {
  const ms = window.__go ? performance.now() - window.__go : -1;
  const a = ms < 0 ? 175 : base(ms);
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  w[0] = { x: 0, y: -0.08, z: 0 };
  chain(w, 5, -0.03, a);
  chain(w, 9, -0.01, a);
  chain(w, 13, 0.01, ms < 0 ? 175 : ringAngle(ms));
  chain(w, 17, 0.03, Math.min(a, 128));
  const th = 125 + (a - 85) * 0.5, phi = (180 - th) * Math.PI / 180;
  w[1] = { x: -0.05, y: -0.05, z: 0 }; w[2] = { x: -0.06, y: -0.02, z: 0 }; w[3] = { x: -0.06, y: 0.01, z: 0 };
  w[4] = { x: -0.06, y: 0.01 + 0.025 * Math.cos(phi), z: 0.025 * Math.sin(phi) };
  const image = w.map((p) => ({ x: 0.5 + p.x * 4, y: 0.7 - p.y * 4 - p.z * 2, z: 0 }));
  return { image, world: w };
}
export function fingertipSpots() { return null; }`;

// Carpal tunnel: the thumb touches the index, middle and ring fingertips but stops short of the little finger.
export const reachHand = `
export async function loadHandModel() {}
const tips = { 8: { x: -0.03, y: 0.1 }, 12: { x: -0.01, y: 0.11 }, 16: { x: 0.01, y: 0.1 }, 20: { x: 0.03, y: 0.09 } };
export function detectHand() {
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0.05, z: 0 }));
  w[0] = { x: 0, y: 0, z: 0 }; w[9] = { x: 0, y: 0.08, z: 0 };
  for (const [i, p] of Object.entries(tips)) w[i] = { ...p, z: 0 };
  const ms = window.__go ? performance.now() - window.__go : -1;
  const near = (i, off = 0.004) => ({ x: tips[i].x + off, y: tips[i].y - off, z: 0 });
  let thumb = { x: -0.07, y: 0.02, z: 0 };
  if (ms >= 0 && ms < 1500) thumb = near(8);
  else if (ms >= 1500 && ms < 3000) thumb = near(12);
  else if (ms >= 3000 && ms < 4500) thumb = near(16);
  else if (ms >= 4500) thumb = near(20, 0.035);
  w[4] = thumb;
  const image = w.map((p) => ({ x: 0.5 + p.x * 4, y: 0.8 - p.y * 4, z: 0 }));
  return { image, world: w };
}
export function fingertipSpots() { return null; }`;
