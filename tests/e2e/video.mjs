// Writes small test videos in the Y4M format that Chrome can use as a fake camera
// (--use-file-for-fake-video-capture). Generated at test time so no large video is stored in the repo.
import { openSync, writeSync, closeSync } from 'node:fs';

// RGB -> YCbCr (full range, as in JPEG). Y is brightness, Cb and Cr are color.
const toYUV = ([r, g, b]) => [
  0.299 * r + 0.587 * g + 0.114 * b,
  128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
  128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
].map((v) => Math.max(0, Math.min(255, Math.round(v))));

// paint(t) returns { background: [r,g,b], patches: [{ x, y, size, rgb }] } for the frame at t seconds.
export function writeY4M(path, { width, height, fps, seconds, paint }) {
  const fd = openSync(path, 'w');
  writeSync(fd, `YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`);
  const Y = Buffer.alloc(width * height);
  const U = Buffer.alloc((width / 2) * (height / 2));
  const V = Buffer.alloc((width / 2) * (height / 2));
  for (let i = 0; i < fps * seconds; i++) {
    const { background, patches = [] } = paint(i / fps);
    const [y0, u0, v0] = toYUV(background);
    Y.fill(y0);
    U.fill(u0);
    V.fill(v0);
    for (const p of patches) {
      const [y, u, v] = toYUV(p.rgb);
      const x1 = Math.max(0, Math.round(p.x - p.size / 2));
      const y1 = Math.max(0, Math.round(p.y - p.size / 2));
      const x2 = Math.min(width, x1 + p.size);
      const y2 = Math.min(height, y1 + p.size);
      for (let r = y1; r < y2; r++) Y.fill(y, r * width + x1, r * width + x2);
      for (let r = y1 >> 1; r < y2 >> 1; r++) {
        U.fill(u, r * (width / 2) + (x1 >> 1), r * (width / 2) + (x2 >> 1));
        V.fill(v, r * (width / 2) + (x1 >> 1), r * (width / 2) + (x2 >> 1));
      }
    }
    writeSync(fd, 'FRAME\n');
    writeSync(fd, Y);
    writeSync(fd, U);
    writeSync(fd, V);
  }
  closeSync(fd);
}

// Where the fake hand model says each color box is (fractions of the picture). Shared with fake-hands.mjs.
export const SPOTS = { thumb: [0.2, 0.5], index: [0.35, 0.3], middle: [0.5, 0.25], ring: [0.65, 0.3], pinky: [0.8, 0.4] };
export const PALM = [0.5, 0.7];
export const baseOf = ([x, y]) => [x + (PALM[0] - x) * 0.35, y + (PALM[1] - y) * 0.35];

const SKIN = [200, 150, 130];
const PALE = [238, 222, 214];
const BLUE = [150, 140, 175];
const RED = [218, 108, 98];

// A Raynaud's episode on index, middle and ring: white until 25 s, blue until 45 s,
// red while rewarming until 75 s, then normal. The thumb, little finger, finger bases and palm stay normal.
export function writeEpisodeVideo(path) {
  const width = 320;
  const height = 240;
  writeY4M(path, {
    width,
    height,
    fps: 5,
    seconds: 140,
    paint: (t) => {
      const tipColor = t < 25 ? PALE : t < 45 ? BLUE : t < 75 ? RED : SKIN;
      const patches = [{ x: PALM[0] * width, y: PALM[1] * height, size: 40, rgb: SKIN }];
      for (const [f, spot] of Object.entries(SPOTS)) {
        const active = ['index', 'middle', 'ring'].includes(f);
        const [bx, by] = baseOf(spot);
        patches.push({ x: bx * width, y: by * height, size: 14, rgb: SKIN });
        patches.push({ x: spot[0] * width, y: spot[1] * height, size: 24, rgb: active ? tipColor : SKIN });
      }
      return { background: [60, 60, 60], patches };
    },
  });
}

// A plain grey 30 fps video for the movement tests (the fake hand model supplies the joints).
export function writeBlankVideo(path) {
  writeY4M(path, { width: 160, height: 120, fps: 30, seconds: 10, paint: () => ({ background: [90, 90, 90] }) });
}
