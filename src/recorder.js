const rows = [];
const events = [];
let startTime = null;

export function startRecording() {
  rows.length = 0;
  events.length = 0;
  startTime = performance.now();
}

export function stopRecording() {
  startTime = null;
}

export function isRecording() {
  return startTime !== null;
}

function elapsedSeconds() {
  return ((performance.now() - startTime) / 1000).toFixed(2);
}

export function addRow(row) {
  rows.push({ t: elapsedSeconds(), ...row });
}

export function addEvent(type, value = '') {
  events.push({ t: elapsedSeconds(), type, value });
}

function toCSV(list) {
  if (list.length === 0) return '';
  const headers = Object.keys(list[0]);
  const lines = list.map((obj) => headers.map((h) => obj[h]).join(','));
  return [headers.join(','), ...lines].join('\n');
}

function saveFile(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(name) {
  saveFile(toCSV(rows), name + '_data.csv');
  saveFile(toCSV(events), name + '_events.csv');
}