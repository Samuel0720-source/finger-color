import './style.css';
import { startCamera, tryLockCamera } from './camera.js';
import { loadHandModel, findFingertips } from './hand.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const statusEl = document.getElementById('status');

document.getElementById('btn-camera').onclick = async () => {
  statusEl.textContent = 'Loading camera and hand model...';
  const track = await startCamera(video);
  const lockMsg = await tryLockCamera(track);
  await loadHandModel();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  statusEl.textContent = lockMsg;
  requestAnimationFrame(loop);
};

function loop(now) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const spots = findFingertips(video, now);
  if (spots) {
    for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
  }
  requestAnimationFrame(loop);
}

function drawBox(x, y, size, color) {
  octx.strokeStyle = color;
  octx.lineWidth = 3;
  octx.strokeRect(x - size / 2, y - size / 2, size, size);
}