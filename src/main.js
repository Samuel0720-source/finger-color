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
const btnRecord = document.getElementById('btn-record');
const btnWarm = document.getElementById('btn-warm');
const btnTemp = document.getElementById('btn-temp');
const btnCsv = document.getElementById('btn-csv');
const tempInput = document.getElementById('temp-input');

let cardPos = null;
let lastSample = 0;

document.getElementById('btn-camera').onclick = async () => {
  statusEl.textContent = 'Loading camera and hand model...';
  const track = await startCamera(video);
  const lockMsg = await tryLockCamera(track);
  await loadHandModel();
  work.width = overlay.width = video.videoWidth;
  work.height = overlay.height = video.videoHeight;
  statusEl.textContent = lockMsg + ' / Tap the grey card on screen once';
  requestAnimationFrame(loop);
};

overlay.onclick = (e) => {
  const rect = overlay.getBoundingClientRect();
  cardPos = {
    x: (e.clientX - rect.left) * (overlay.width / rect.width),
    y: (e.clientY - rect.top) * (overlay.height / rect.height),
  };
  statusEl.textContent = 'Grey card position saved';
  btnRecord.disabled = false;
};

function loop(now) {
  wctx.drawImage(video, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const spots = findFingertips(video, now);

  if (cardPos) drawBox(cardPos.x, cardPos.y, CARD_BOX, 'yellow');
  if (spots) {
    for (const p of Object.values(spots)) drawBox(p.x, p.y, p.size, 'lime');
  }

  if (spots && cardPos && now - lastSample > SAMPLE_EVERY_MS) {
    lastSample = now;
    sample(spots);
  }
  requestAnimationFrame(loop);
}

function sample(spots) {
  const card = averageRGB(wctx, cardPos.x, cardPos.y, CARD_BOX);
  let text = rec.isRecording() ? '[RECORDING]\n' : '';

  for (const [name, p] of Object.entries(spots)) {
    const pixel = averageRGB(wctx, p.x, p.y, p.size);
    const raw = linearToLab(toLinear(pixel));
    const lab = linearToLab(correctWithCard(pixel, card));
    text += `${name}: L ${lab.L.toFixed(1)}  a ${lab.a.toFixed(1)}  b ${lab.b.toFixed(1)}\n`;

    if (rec.isRecording()) {
      rec.addRow({
        finger: name,
        raw_L: raw.L.toFixed(2),
        raw_a: raw.a.toFixed(2),
        raw_b: raw.b.toFixed(2),
        L: lab.L.toFixed(2),
        a: lab.a.toFixed(2),
        b: lab.b.toFixed(2),
        card_r: card.r.toFixed(1),
        card_g: card.g.toFixed(1),
        card_b: card.b.toFixed(1),
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
  statusEl.textContent = 'Warm start time logged';
};

btnTemp.onclick = () => {
  if (tempInput.value === '') return;
  rec.addEvent('finger_temp_c', tempInput.value);
  statusEl.textContent = 'Logged ' + tempInput.value + ' °C';
  tempInput.value = '';
};

btnCsv.onclick = () => {
  const name = prompt('Session name (e.g. baseline_1103)') || 'session';
  rec.downloadCSV(name);
};