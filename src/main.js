import './style.css';
import { startCamera, tryLockCamera } from './camera.js';
import { loadHandModel, findFingertips } from './hand.js';
import { averageRGB, toLinear, correctWithCard, linearToLab } from './color.js';
import * as rec from './recorder.js';

const CARD_BOX = 40;
const SAMPLE_EVERY_MS = 1000;

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });
const statusEl = document.getElementById('status');
const readout = document.getElementById('readout');
const btnCamera = document.getElementById('btn-camera');
const btnRecord = document.getElementById('btn-record');
const btnWarm = document.getElementById('btn-warm');
const btnTemp = document.getElementById('btn-temp');
const btnCsv = document.getElementById('btn-csv');
const tempInput = document.getElementById('temp-input');

let cardPos = null;
let lastSample = 0;
let warmLogged = false;

btnCamera.onclick = async () => {
  btnCamera.disabled = true;
  statusEl.textContent = 'Loading camera and hand model...';
  try {
    const track = await startCamera(video);
    const lockMsg = await tryLockCamera(track);
    await loadHandModel();
    work.width = overlay.width = video.videoWidth;
    work.height = overlay.height = video.videoHeight;
    statusEl.textContent = lockMsg + ' / Tap the grey card (optional)';
    btnRecord.disabled = false;
    requestAnimationFrame(loop);
  } catch (e) {
    statusEl.textContent = 'Camera error: ' + e.message;
    btnCamera.disabled = false;
  }
};

overlay.onclick = (e) => {
  const rect = overlay.getBoundingClientRect();
  cardPos = {
    x: (e.clientX - rect.left) * (overlay.width / rect.width),
    y: (e.clientY - rect.top) * (overlay.height / rect.height),
  };
  statusEl.textContent = 'Grey card position saved';
};

function loop(now) {
  wctx.drawImage(video, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const spots = findFingertips(video, now);

  if (cardPos) drawBox(cardPos.x, cardPos.y, CARD_BOX, 'yellow');
  if (spots) {
    for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
  }

  if (spots && now - lastSample > SAMPLE_EVERY_MS) {
    lastSample = now;
    sample(spots);
  }
  requestAnimationFrame(loop);
}

function sample(spots) {
  const palmPixel = averageRGB(wctx, spots.palm.x, spots.palm.y, spots.palm.size);
  const palmLab = linearToLab(toLinear(palmPixel));
  const card = cardPos ? averageRGB(wctx, cardPos.x, cardPos.y, CARD_BOX) : null;

  let text = rec.isRecording() ? '[RECORDING]\n' : '';
  text += card ? 'Mode: grey card + palm\n' : 'Mode: palm reference only\n';

  for (const [name, p] of Object.entries(spots)) {
    const pixel = averageRGB(wctx, p.x, p.y, p.size);
    const raw = linearToLab(toLinear(pixel));
    const lab = card ? linearToLab(correctWithCard(pixel, card)) : null;

    const dL = raw.L - palmLab.L;
    const da = raw.a - palmLab.a;
    const db = raw.b - palmLab.b;

    text += `${name}: dL ${dL.toFixed(1)}  da ${da.toFixed(1)}  db ${db.toFixed(1)}\n`;

    if (rec.isRecording()) {
      rec.addRow({
        finger: name,
        raw_L: raw.L.toFixed(2),
        raw_a: raw.a.toFixed(2),
        raw_b: raw.b.toFixed(2),
        L: lab ? lab.L.toFixed(2) : '',
        a: lab ? lab.a.toFixed(2) : '',
        b: lab ? lab.b.toFixed(2) : '',
        palm_dL: dL.toFixed(2),
        palm_da: da.toFixed(2),
        palm_db: db.toFixed(2),
        card_r: card ? card.r.toFixed(1) : '',
        card_g: card ? card.g.toFixed(1) : '',
        card_b: card ? card.b.toFixed(1) : '',
      });
    }
  }
  readout.textContent = text;
}

function drawBox(x, y, size, color) {
  octx.strokeStyle = color;
  octx.lineWidth = 3;
  octx.strokeRect(x - size / 2, y - size / 2, size, size);
}

btnRecord.onclick = () => {
  if (!rec.isRecording()) {
    rec.startRecording();
    warmLogged = false;
    btnRecord.textContent = 'Stop Recording';
    btnWarm.disabled = false;
    btnTemp.disabled = false;
    btnCsv.disabled = true;
  } else {
    rec.stopRecording();
    btnRecord.textContent = 'Start Recording';
    btnWarm.disabled = true;
    btnTemp.disabled = true;
    btnCsv.disabled = false;
  }
};

btnWarm.onclick = () => {
  rec.addEvent('warm_start');
  warmLogged = true;
  statusEl.textContent = 'Warm start time logged';
};

btnTemp.onclick = () => {
  if (tempInput.value === '') return;
  rec.addEvent('finger_temp_c', tempInput.value);
  statusEl.textContent = 'Logged ' + tempInput.value + ' °C';
  tempInput.value = '';
};

btnCsv.onclick = () => {
  const name = prompt('Session name (e.g. recovery_20261103)') || 'session';
  if (name.startsWith('recovery') && !warmLogged) {
    const ok = confirm('No Warm Start was logged. Recovery time will be wrong. Save anyway?');
    if (!ok) return;
  }
  rec.downloadCSV(name);
};