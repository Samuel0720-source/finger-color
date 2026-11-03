// Checks that analysis/analyze.py gets the same recovery time as the app for the same files.
// Makes six recordings (three with a saved normal color, three in episode mode), runs the app's analysis,
// saves the CSV files exactly as the app's download buttons do, then asks Python to recompute.
//   npm run parity        (needs Python 3 with pandas and numpy)
import { analyzeColorRecording } from '../src/assess/color-analysis.js';
import { toCSV } from '../src/recorder.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

// Index, middle and ring are pale, then fade back to normal over `recoverySec` after warming at 40 s.
function recording(recoverySec, wobble) {
  const rows = [];
  for (let t = 0; t <= 240; t++) {
    for (const f of FINGERS) {
      const on = ['index', 'middle', 'ring'].includes(f);
      const k = on ? Math.max(0, 1 - Math.max(0, t - 40) / recoverySec) : 0;
      const d = { L: 14 * k + wobble * noise(), a: -5 * k + wobble * noise(), b: wobble * noise() };
      const fx = (v) => v.toFixed(2);
      rows.push({ t: fx(t), finger: f, palm_dL: fx(d.L), palm_da: fx(d.a), palm_db: fx(d.b), prox_dL: fx(d.L * 0.1), prox_da: fx(d.a * 0.1), prox_db: fx(d.b * 0.1), change_score: '', label: '' });
    }
  }
  return rows;
}

const dir = mkdtempSync(join(tmpdir(), 'finger-color-parity-'));
const zero = { L: 0, a: 0, b: 0 };
const saved = { fingers: Object.fromEntries(FINGERS.map((f) => [f, { ...zero, prox: zero }])), noise: 1.5, noiseByFinger: Object.fromEntries(FINGERS.map((f) => [f, 1.5])) };
const cases = [[30, 0.5, null], [60, 1, null], [90, 2, null], [30, 0.5, saved], [80, 1, saved], [120, 2, saved]];

cases.forEach(([recoverySec, wobble, baseline], i) => {
  const events = [{ t: '0.00', type: 'algorithm_version', value: '3' }, ...(baseline ? [{ t: '0.00', type: 'baseline_noise', value: '1.5' }] : []), { t: '40.00', type: 'warm_start', value: '' }];
  const a = analyzeColorRecording(recording(recoverySec, wobble), events, baseline);
  if (!a.ok) throw new Error(`case ${i}: ${a.reason}`);
  // The same events the app adds after analysing a recording.
  events.push({ t: '240.00', type: 'reference', value: a.source }, { t: '240.00', type: 'reference_noise', value: String(a.noise.middle) }, { t: '240.00', type: 'app_recovery_sec', value: a.middle.recoverySec === null ? '' : a.middle.recoverySec.toFixed(2) });
  writeFileSync(join(dir, `case${i}_data.csv`), toCSV(a.rows));
  writeFileSync(join(dir, `case${i}_events.csv`), toCSV(events));
});

const analysisDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'analysis');
const python = `
import sys, math, pandas as pd
sys.path.insert(0, sys.argv[1])
from analyze import analyze_session, load_events
bad = 0
for i in range(${cases.length}):
    p = sys.argv[2] + f"/case{i}"
    r = analyze_session(pd.read_csv(p + "_data.csv"), load_events(p + "_events.csv"))
    same = abs(r["recovery_min"] - r["app_recovery_min"]) < 0.01
    bad += 0 if same else 1
    print(f"case{i}: python {r['recovery_min']*60:.1f} s, app {r['app_recovery_min']*60:.1f} s", "MATCH" if same else "MISMATCH")
sys.exit(1 if bad else 0)
`;
const run = spawnSync('python3', ['-c', python, analysisDir, dir], { encoding: 'utf8' });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exit(run.status ?? 1);
