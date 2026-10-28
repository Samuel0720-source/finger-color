import './style.css';
import { startCamera, tryLockCamera } from './camera.js';

const video = document.getElementById('video');
const statusEl = document.getElementById('status');

document.getElementById('btn-camera').onclick = async () => {
  statusEl.textContent = 'Starting camera...';
  const track = await startCamera(video);
  statusEl.textContent = await tryLockCamera(track);
};