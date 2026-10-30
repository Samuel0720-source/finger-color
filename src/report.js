import { jsPDF } from 'jspdf';

const NAMES = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
const LEFT = 20;
const WIDTH = 170;
const PAGE_BOTTOM = 275;

function minutes(sec) {
  return (sec / 60).toFixed(1) + ' min';
}

export function makeReport(info) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 22;

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      y = 22;
    }
  };
  const heading = (text) => {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(text, LEFT, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text('Finger Color Recovery Report', LEFT, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Personal research tool. Not a medical device. It does not diagnose any condition.', LEFT, y);
  y += 10;

  doc.setFontSize(11);
  const facts = [
    ['Session', info.name],
    ['Date', info.date],
    ['Recording length', minutes(info.durationSec)],
    ['Measurement mode', info.mode],
  ];
  for (const [label, value] of facts) {
    doc.setTextColor(100, 116, 139);
    doc.text(label, LEFT, y);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value), LEFT + 50, y);
    y += 6.5;
  }
  y += 4;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(LEFT, y, WIDTH, 26, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Middle finger: time to return to normal color', LEFT + 6, y + 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text(info.headline, LEFT + 6, y + 20);
  y += 34;

  if (info.photos && (info.photos.normal || info.photos.cold)) {
    heading('Photos');
    const w = 82;
    const h = w * info.photos.ratio;
    ensureSpace(h + 10);
    if (info.photos.normal) doc.addImage(info.photos.normal, 'JPEG', LEFT, y, w, h);
    if (info.photos.cold) doc.addImage(info.photos.cold, 'JPEG', LEFT + 88, y, w, h);
    y += h + 5;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Normal color', LEFT, y);
    doc.text('Back from the cold', LEFT + 88, y);
    y += 8;
    doc.setFontSize(10);
  }

  if (info.pattern) {
    heading('Color pattern');
    doc.setTextColor(15, 23, 42);
    doc.text(info.pattern.title, LEFT, y);
    y += 5;
    doc.setTextColor(100, 116, 139);
    const lines = doc.splitTextToSize(info.pattern.detail, WIDTH);
    doc.text(lines, LEFT, y);
    y += lines.length * 5 + 4;
  }

  if (info.chartImg) {
    ensureSpace(80);
    doc.addImage(info.chartImg, 'PNG', LEFT, y, WIDTH, 70);
    y += 78;
  }

  heading('Each finger');
  const cols = [LEFT, LEFT + 40, LEFT + 90, LEFT + 135];
  doc.setFont('helvetica', 'bold');
  ['Finger', 'Biggest change', 'At the end', 'End score'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(LEFT, y, LEFT + WIDTH, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  for (const f of info.fingers) {
    ensureSpace(6);
    doc.text(NAMES[f.name], cols[0], y);
    doc.text(f.peak.toFixed(1), cols[1], y);
    doc.text(f.endLabel, cols[2], y);
    doc.text(f.endScore.toFixed(1), cols[3], y);
    y += 6;
  }
  y += 4;

  if (info.temps.length > 0) {
    heading('Finger temperature log');
    doc.setTextColor(15, 23, 42);
    const text = info.temps.map((t) => `${t.min.toFixed(1)} min: ${t.value} °C`).join('    ');
    const lines = doc.splitTextToSize(text, WIDTH);
    ensureSpace(lines.length * 5);
    doc.text(lines, LEFT, y);
    y += lines.length * 5 + 4;
  }

  const note =
    'How to read this: the change score compares each fingertip with the normal color saved before the recording. ' +
    '0 means no change. Above 3 is a difference most people can see. ' +
    'This report is a record of measurements to share with a clinician. It is not a diagnosis.';
  const noteLines = doc.splitTextToSize(note, WIDTH);
  ensureSpace(noteLines.length * 4.5);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(noteLines, LEFT, y);

  doc.save(info.name + '_report.pdf');
}

