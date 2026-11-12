// Replays raw angle recordings (the app's "Raw data for analysis" CSV) through the app's own
// detector, so a report can check what the screen showed and test ideas on real recordings.
//
// Usage: node validation/replay-trigger.mjs docs/validation/report-02-pilot/data/trigger
//
// Reads  <folder>/raw/<participant>_run<N>_<smooth|catch>.csv   (t_ms,thumb_deg,index_deg,middle_deg,ring_deg,pinky_deg)
//        <folder>/finger_catches.csv                            (for the open-hand angle the app showed)
// Writes <folder>/replay_catches.csv         every catch the detector finds, plus how many other fingers were still closed
//        <folder>/replay_middle_cycles.csv   middle-finger cycles with the old fixed lines and with the person's own open hand
import fs from 'node:fs';
import path from 'node:path';
import { summarizeFinger, cycleLimits, ABOVE_FIST_DEG, FIST_LOOKBACK_MS } from '../src/tests/trigger-test.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little']; // the CSV calls the little finger "pinky"
const folder = process.argv[2];
const rawDir = path.join(folder, 'raw');

const refs = {};
const fc = path.join(folder, 'finger_catches.csv');
if (fs.existsSync(fc)) {
  const [head, ...lines] = fs.readFileSync(fc, 'utf8').trim().split('\n');
  const cols = head.split(',');
  for (const l of lines) {
    const r = Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]));
    refs[`${r.participant}_${r.run}`] = Number(r.open_ref_deg);
  }
}

const catchRows = ['participant,run,kind,finger,t_s,angle_deg,pause_ms,gain_deg,snap_ms,others_closed'];
const cycleRows = ['participant,run,kind,open_ref_deg,cycles_fixed_lines,cycles_own_open_hand'];

for (const file of fs.readdirSync(rawDir).filter((f) => f.endsWith('.csv')).sort()) {
  const [, p, run, kind] = file.match(/^(P\d+)_run(\d+)_(smooth|catch)\.csv$/) || [];
  if (!p) continue;
  const rows = fs.readFileSync(path.join(rawDir, file), 'utf8').trim().split('\n').slice(1).map((r) => r.split(',').map(Number));
  const t = rows.map((r) => r[0]);
  const sums = FINGERS.map((_, i) => summarizeFinger(t, rows.map((r) => r[i + 1])));
  const at = (series, ms) => series[t.findIndex((x) => x >= ms)] ?? series.at(-1);

  FINGERS.forEach((f, i) => {
    for (const c of sums[i].catches) {
      const pauseEnd = c.t - c.snapMs;
      // How far each other finger has risen above its own lowest point in the 1.5 s before the pause.
      let closed = 0;
      FINGERS.forEach((g, j) => {
        if (j === i) return;
        const s = sums[j].smoothed;
        const window = s.filter((_, k) => t[k] >= pauseEnd - FIST_LOOKBACK_MS && t[k] <= pauseEnd);
        if (at(s, pauseEnd) - Math.min(...window) < ABOVE_FIST_DEG) closed++;
      });
      catchRows.push([p, run, kind, f, (c.t / 1000).toFixed(1), c.angle.toFixed(0), c.pauseMs.toFixed(0), c.deltaDeg.toFixed(0), c.snapMs.toFixed(0), closed].join(','));
    }
  });

  const ref = refs[`${p}_${run}`];
  const mid = rows.map((r) => r[3]);
  cycleRows.push([p, run, kind, Number.isFinite(ref) ? ref : '', summarizeFinger(t, mid, cycleLimits()).cycles,
    Number.isFinite(ref) ? summarizeFinger(t, mid, cycleLimits(ref)).cycles : ''].join(','));
}

fs.writeFileSync(path.join(folder, 'replay_catches.csv'), catchRows.join('\n') + '\n');
fs.writeFileSync(path.join(folder, 'replay_middle_cycles.csv'), cycleRows.join('\n') + '\n');
console.log(catchRows.length - 1, 'catches,', cycleRows.length - 1, 'runs replayed');
