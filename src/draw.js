// Small helpers that draw the hand on the overlay canvas.
// pts are MediaPipe image landmarks (x, y from 0 to 1), so multiply by the canvas size.

export const FINGER_CHAINS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export function drawChain(ctx, pts, chain, color, width = 3) {
  const { width: w, height: h } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  chain.forEach((i, k) => {
    const x = pts[i].x * w;
    const y = pts[i].y * h;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function drawDot(ctx, p, color, radius = 7) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2);
  ctx.fill();
}
