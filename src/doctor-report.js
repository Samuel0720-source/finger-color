import { jsPDF } from 'jspdf';
import { LEVELS } from './assess/levels.js';

// One report per condition, written for a clinician to read in two minutes:
// conclusion -> feature check -> measurements -> answers -> limits -> criteria used.

const LEVEL_RGB = {
  incomplete: [120, 130, 128],
  low: [29, 122, 76],
  selfcare: [29, 122, 76],
  routine: [36, 80, 143],
  soon: [138, 83, 0],
  urgent: [179, 38, 30],
};
const STATUS = { yes: 'Present', no: 'Absent', unknown: 'Not checked' };
const METHOD = { camera: 'Camera', test: 'Guided test', answer: 'Reported' };
const INK = [11, 31, 58];
const MUTED = [90, 105, 100];
// Helvetica in jsPDF only has Latin-1; replace the few characters we use that it lacks.
const clean = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=');

export function makeDoctorReport({ assessment: r, questions, answers, measurements = [], images = [], history = [], sources = [], fileName, build = '' }, { save = true } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 170;
  const X = 20;
  let y = 20;
  const newPage = () => {
    doc.addPage();
    y = 20;
  };
  const need = (h) => {
    if (y + h > 278) newPage();
  };
  const text = (value, { bold = false, size = 10, color = INK, indent = 0, gap = 1.5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(clean(value), W - indent)) {
      need(size * 0.45);
      doc.text(line, X + indent, y);
      y += size * 0.42 + gap;
    }
  };
  const heading = (s) => {
    need(14);
    y += 4;
    text(s, { bold: true, size: 12 });
    y += 1;
  };
  const bullets = (list) => list.forEach((s) => text('- ' + s, { indent: 2 }));

  doc.setProperties({ title: `Hand check report: ${r.name}`, subject: 'Symptom and camera feature check', author: 'finger-color' });
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 210, 6, 'F');
  text(`Hand check report: ${r.name}`, { bold: true, size: 18 });
  text(`${new Date().toLocaleString()}  |  finger-color.vercel.app  |  Self-assessment, not a diagnosis`, { size: 9, color: MUTED });
  y += 3;

  // Conclusion box
  const L = LEVELS[r.level];
  // Set the font before measuring: line breaks depend on the font size.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const summaryLines = doc.splitTextToSize(clean(r.summary.text), W - 14);
  const boxH = 18 + summaryLines.length * 4.6;
  need(boxH + 4);
  const rgb = LEVEL_RGB[r.level];
  doc.setDrawColor(...rgb);
  doc.setLineWidth(0.8);
  doc.setFillColor(248, 250, 249);
  doc.roundedRect(X, y, W, boxH, 2, 2, 'FD');
  doc.setFillColor(...rgb);
  doc.rect(X, y, 3, boxH, 'F');
  const top = y;
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...rgb);
  doc.text(clean(L.tag.toUpperCase()), X + 7, y);
  if (r.score) {
    const sc = typeof r.score.value === 'number' ? `${r.score.value} / ${r.score.max}` : String(r.score.value);
    doc.text(clean(`${r.score.label}: ${sc}`), X + W - 4, y, { align: 'right' });
  }
  y += 6;
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(clean(L.headline), X + 7, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  summaryLines.forEach((l) => {
    doc.text(l, X + 7, y);
    y += 4.6;
  });
  y = top + boxH + 4;

  // Feature table
  heading('Feature check');
  const cols = [0, 72, 98, 124];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  ['Feature', 'Status', 'How checked', 'Detail'].forEach((h, i) => doc.text(h, X + cols[i], y));
  y += 2;
  doc.setDrawColor(210, 218, 215);
  doc.setLineWidth(0.2);
  doc.line(X, y, X + W, y);
  y += 4.5;
  for (const f of r.features) {
    const label = doc.splitTextToSize(clean(f.label), 70);
    const detail = doc.splitTextToSize(clean(f.detail || ''), W - cols[3]);
    const h = Math.max(label.length, detail.length, 1) * 4.2 + 1.5;
    need(h);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(label, X + cols[0], y);
    doc.setFont('helvetica', f.status === 'yes' ? 'bold' : 'normal');
    doc.setTextColor(...(f.status === 'yes' ? INK : MUTED));
    doc.text(STATUS[f.status], X + cols[1], y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(METHOD[f.method], X + cols[2], y);
    doc.text(detail, X + cols[3], y);
    y += h;
    doc.line(X, y - 3.2, X + W, y - 3.2);
  }
  text('Camera features use engineering thresholds that have not been validated on patients.', { size: 8, color: MUTED });

  if (r.reasons.length) {
    heading('Why');
    bullets(r.reasons.map((x) => x.text));
  }
  if (r.actions.length) {
    heading('Suggested next steps');
    bullets(r.actions);
  }

  if (measurements.length || images.length) {
    heading('Measurements');
    measurements.forEach(([k, v]) => text(`${k}: ${v}`, { size: 9.5 }));
    for (const img of images) {
      const h = img.height || 60;
      need(h + 10);
      if (img.title) text(img.title, { bold: true, size: 9.5 });
      doc.addImage(img.src, 'PNG', X, y, W, h);
      y += h + 4;
    }
  }

  if (history.length) {
    heading('Measurement history (saved in this browser)');
    history.forEach(([when, what, result]) => text(`${when}  ${what}: ${result}`, { size: 9 }));
    text('Compare like with like: same hand, camera and room.', { size: 8, color: MUTED });
  }

  heading('Answers given');
  for (const q of questions) {
    if (q.section || !q.id) continue;
    const v = answers[q.id];
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;
    const shown = Array.isArray(v) ? v.join(', ') : q.options ? (q.options.find(([k]) => k === v)?.[1] ?? v) : { yes: 'Yes', no: 'No', unsure: 'Not sure' }[v] ?? v;
    text(`${q.text}  ${shown}`, { size: 9 });
  }
  for (const [id, label] of [['phalen', 'Phalen test'], ['tinel', 'Tinel test'], ['twoPoint', 'Two-point test (positive = could not tell)']]) {
    if (answers[id]) text(`${label}: ${{ yes: 'Positive', no: 'Negative', skip: 'Not done' }[answers[id]]}${id === 'phalen' && answers.phalenOnset ? ` (tingling after ${answers.phalenOnset} s)` : ''}`, { size: 9 });
  }

  heading('Limits of this check');
  bullets(r.limits);
  text('This report records symptoms and camera measurements to support a conversation with a clinician. It is not a diagnosis and the app is not a medical device.', { size: 9, color: MUTED });

  if (sources.length) {
    heading('Criteria used');
    sources.forEach(([name, url]) => text(`${name}: ${url}`, { size: 8.5, color: MUTED }));
  }

  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(clean(`finger-color hand check | ${r.name}${build ? ' | app build ' + build : ''} | page ${n} of ${pages}`), X, 290);
  }
  if (save) doc.save(fileName + '.pdf');
  return doc;
}
