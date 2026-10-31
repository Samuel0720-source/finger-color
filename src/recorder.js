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

export function elapsed() {
  return startTime === null ? 0 : (performance.now() - startTime) / 1000;
}

export function getRows() {
  return rows;
}

export function getEvents() {
  return events;
}

export function addRow(row) {
  rows.push({ t: elapsed().toFixed(2), ...row });
}

export function addEvent(type, value = '') {
  events.push({ t: elapsed().toFixed(2), type, value });
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
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download in Safari and Firefox, so wait a moment.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCSV(name) {
  saveFile(toCSV(rows), name + '_data.csv');
  // Browsers may block a second download that starts at the same instant.
  setTimeout(() => saveFile(toCSV(events), name + '_events.csv'), 400);
}

// Any list of rows (same keys in every row) -> one CSV download. Used by the other tests and history.
export function downloadRows(list, filename) {
  saveFile(toCSV(list), filename);
}
