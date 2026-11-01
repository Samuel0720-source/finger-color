export function averageRGB(ctx, cx, cy, size) {
  // Clamp the box to the canvas. Pixels outside the canvas come back as
  // transparent black (0, 0, 0), which would make the color look darker.
  const half = Math.floor(size / 2);
  const x0 = Math.max(0, Math.round(cx - half));
  const y0 = Math.max(0, Math.round(cy - half));
  const x1 = Math.min(ctx.canvas.width, Math.round(cx - half) + size);
  const y1 = Math.min(ctx.canvas.height, Math.round(cy - half) + size);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;

  const data = ctx.getImageData(x0, y0, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / n, g: g / n, b: b / n };
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function toLinear(pixel) {
  return {
    r: srgbToLinear(pixel.r),
    g: srgbToLinear(pixel.g),
    b: srgbToLinear(pixel.b),
  };
}

const CARD_LINEAR = 0.18;

export function correctWithCard(pixel, card) {
  const p = toLinear(pixel);
  const c = toLinear(card);
  if ([c.r, c.g, c.b].some(v => !Number.isFinite(v) || v <= 0)) return null;
  return {
    r: p.r * (CARD_LINEAR / c.r),
    g: p.g * (CARD_LINEAR / c.g),
    b: p.b * (CARD_LINEAR / c.b),
  };
}

export function linearToLab(lin) {
  let X = lin.r * 0.4124564 + lin.g * 0.3575761 + lin.b * 0.1804375;
  let Y = lin.r * 0.2126729 + lin.g * 0.7151522 + lin.b * 0.072175;
  let Z = lin.r * 0.0193339 + lin.g * 0.119192 + lin.b * 0.9503041;

  X = X / 0.95047;
  Z = Z / 1.08883;

  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

