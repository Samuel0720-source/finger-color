// Each case: answers (+ camera) -> expected level, grade or score.
// If a medical rule changes, these show exactly which outcome moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as raynaud from '../src/assess/raynaud.js';
import * as trigger from '../src/assess/trigger.js';
import * as carpal from '../src/assess/carpal.js';
import { analyzeColorRecording, PHASE_MIN } from '../src/assess/color-analysis.js';

const Y = 'yes', N = 'no';

// ---------- Raynaud's ----------
const rpBase = { cold: Y, white: Y, blue: Y };
const rpNo3 = { otherTriggers: N, bothHands: N, numb: N, sharpLine: N, photos: N, otherSites: N, red: N };

test('Raynaud: nothing answered -> incomplete', () => assert.equal(raynaud.assess({}).level, 'incomplete'));
test('Raynaud: not cold sensitive -> low', () => assert.equal(raynaud.assess({ cold: N }).level, 'low'));
test('Raynaud: cold, no color change -> low', () => assert.equal(raynaud.assess({ cold: Y, white: N, blue: N }).level, 'low'));
test('Raynaud: only white -> selfcare (criteria need white AND blue)', () => assert.equal(raynaud.assess({ cold: Y, white: Y, blue: N }).level, 'selfcare'));
test('Raynaud: white+blue + 3 features -> routine', () => {
  const r = raynaud.assess({ ...rpBase, ...rpNo3, bothHands: Y, numb: Y, red: Y });
  assert.equal(r.level, 'routine');
  assert.equal(r.score.value, 3);
});
test('Raynaud: white+blue + 2 features -> selfcare', () => assert.equal(raynaud.assess({ ...rpBase, ...rpNo3, bothHands: Y, numb: Y }).level, 'selfcare'));
test('Raynaud: onset after 40 -> soon', () => assert.equal(raynaud.assess({ ...rpBase, ...rpNo3, bothHands: Y, numb: Y, red: Y, after40: Y }).level, 'soon'));
test('Raynaud: fingertip sores -> soon', () => assert.equal(raynaud.assess({ ...rpBase, ...rpNo3, bothHands: Y, numb: Y, red: Y, sores: Y }).level, 'soon'));
test('Raynaud: black finger -> urgent even with nothing else', () => assert.equal(raynaud.assess({ deadTissue: Y }).level, 'urgent'));

const cam = (over = {}) => ({
  ok: true, involved: ['index', 'middle', 'ring'], pale: ['index', 'middle', 'ring'], blue: ['middle'], red: ['middle'],
  border: ['middle'], borderMeasured: true, thumbSpared: true, middle: { ok: true, recoverySec: 390, noChange: false }, ...over,
});
test('Raynaud camera: captured white+blue fills step 2 even if not answered', () => {
  const r = raynaud.assess({ cold: Y, ...rpNo3 }, cam());
  const f = Object.fromEntries(r.features.map((x) => [x.id, x]));
  assert.equal(f.white.method, 'camera');
  assert.equal(f.blue.status, 'yes');
  // camera supplies photo + border + red = 3 step-3 features
  assert.equal(r.score.value, 3);
  assert.equal(r.level, 'routine');
});
test('Raynaud camera: recovery, several fingers and spared thumb are measured features', () => {
  const r = raynaud.assess({ ...rpBase, ...rpNo3 }, cam());
  const f = Object.fromEntries(r.features.map((x) => [x.id, x]));
  assert.equal(f.recovery.status, 'yes');
  assert.match(f.recovery.detail, /6.5 min/);
  assert.equal(f.several.status, 'yes');
  assert.equal(f.thumb.status, 'yes');
  assert.match(r.summary.text, /Measured by camera/);
});
test('Raynaud camera: only one finger changed -> secondary warning, soon', () => {
  const r = raynaud.assess({ ...rpBase, ...rpNo3, bothHands: Y, numb: Y, red: Y }, cam({ involved: ['middle'], pale: ['middle'], thumbSpared: false }));
  assert.equal(r.level, 'soon');
});
test('Raynaud camera: no color change seen does not mark phases absent', () => {
  const r = raynaud.assess({ ...rpBase, ...rpNo3 }, cam({ involved: [], pale: [], blue: [], red: [], border: [] }));
  const f = Object.fromEntries(r.features.map((x) => [x.id, x]));
  assert.equal(f.white.status, 'yes'); // from the answer
  assert.equal(f.several.status, 'unknown');
});

// ---------- Color analysis from recorded rows ----------
// Fingers turn pale then blue, warm up through red, and return to normal. Middle/index/ring change; thumb does not.
function episodeRows({ withProx = true, borderSharp = true } = {}) {
  const rows = [];
  for (let t = 0; t <= 200; t++) {
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const active = ['index', 'middle', 'ring'].includes(f);
      let d = { L: 0, a: 0, b: 0 };
      if (active && t < 20) d = { L: 15, a: -6, b: 0 }; // pale
      else if (active && t < 40) d = { L: -3, a: -2, b: -14 }; // blue
      else if (active && t < 60) d = { L: -2, a: 12, b: 2 }; // red on rewarming
      else if (active && t < 80) d = { L: 0, a: 4, b: 0 };
      const prox = borderSharp ? { L: d.L * 0.1, a: d.a * 0.1, b: d.b * 0.1 } : d;
      rows.push({ t: String(t), finger: f, palm_dL: d.L, palm_da: d.a, palm_db: d.b, ...(withProx ? { prox_dL: prox.L, prox_da: prox.a, prox_db: prox.b } : {}) });
    }
  }
  return rows;
}
const events = [{ type: 'warm_start', t: '40' }];

test('Color analysis: episode mode finds phases, fingers, spared thumb and sharp border', () => {
  const r = analyzeColorRecording(episodeRows(), events, null);
  assert.equal(r.ok, true);
  assert.equal(r.source, 'end');
  assert.deepEqual(r.pale, ['index', 'middle', 'ring']);
  assert.deepEqual(r.blue, ['index', 'middle', 'ring']);
  assert.deepEqual(r.red, ['index', 'middle', 'ring']);
  assert.deepEqual(r.involved, ['index', 'middle', 'ring']);
  assert.equal(r.thumbSpared, true);
  assert.deepEqual(r.border, ['index', 'middle', 'ring']);
  assert.equal(r.middle.ok, true);
  assert.ok(r.middle.recoverySec > 20 && r.middle.recoverySec < 60, `recovery ${r.middle.recoverySec}`);
});
test('Color analysis: red before warming is not counted as the rewarming phase', () => {
  const r = analyzeColorRecording(episodeRows(), [{ type: 'warm_start', t: '70' }], null);
  assert.deepEqual(r.red, []);
});
test('Color analysis: whole finger changing equally is not a sharp border', () => {
  const r = analyzeColorRecording(episodeRows({ borderSharp: false }), events, null);
  assert.deepEqual(r.border, []);
  assert.equal(r.borderMeasured, true);
});
test('Color analysis: without base-of-finger samples the border is "not measured"', () => {
  const r = analyzeColorRecording(episodeRows({ withProx: false }), events, null);
  assert.equal(r.borderMeasured, false);
});
test('Color analysis: a single noisy frame does not create a phase', () => {
  const rows = [];
  for (let t = 0; t <= 120; t++) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const spike = f === 'middle' && t === 30 ? { L: 0, a: 0, b: -20 } : { L: 0, a: 0, b: 0 };
    rows.push({ t: String(t), finger: f, palm_dL: spike.L, palm_da: spike.a, palm_db: spike.b });
  }
  const r = analyzeColorRecording(rows, [{ type: 'warm_start', t: '10' }], null);
  assert.deepEqual(r.blue, []);
  assert.ok(PHASE_MIN > 3);
});

test('Color analysis: episode mode refuses a hand that is still pale at the end (no false reassurance)', () => {
  const rows = [];
  for (let t = 0; t <= 150; t++) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const d = ['index', 'middle', 'ring'].includes(f) ? { L: 15, a: -6, b: 0 } : { L: 0, a: 0, b: 0 }; // pale all the way
    rows.push({ t: String(t), finger: f, palm_dL: d.L, palm_da: d.a, palm_db: d.b, prox_dL: d.L * 0.1, prox_da: d.a * 0.1, prox_db: d.b * 0.1 });
  }
  const r = analyzeColorRecording(rows, [{ type: 'warm_start', t: '40' }], null);
  assert.equal(r.ok, false);
  assert.deepEqual(r.notRecovered, ['index', 'middle', 'ring']);
  // With a saved normal color the same recording is scored and shows the pale phase.
  const baseline = { fingers: Object.fromEntries(['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => [f, { L: 0, a: 0, b: 0, prox: { L: 0, a: 0, b: 0 } }])), noise: 1, noiseByFinger: {} };
  const s = analyzeColorRecording(rows, [{ type: 'warm_start', t: '40' }], baseline);
  assert.equal(s.ok, true);
  assert.deepEqual(s.pale, ['index', 'middle', 'ring']);
});
test('Color analysis: episode mode needs the warming mark and 60 s after it', () => {
  assert.equal(analyzeColorRecording(episodeRows(), [], null).ok, false);
  assert.equal(analyzeColorRecording(episodeRows(), [{ type: 'warm_start', t: '150' }], null).ok, false);
});

// ---------- Trigger finger ----------
const tfNone = { catching: N, cantBend: N, stuckBent: N, pressTender: N };
const open = (o = {}) => ({ catches: 0, maxAngle: 172, minAngle: 85, ...o });
const thumbOpen = (o = {}) => ({ catches: 0, maxAngle: 168, minAngle: 120, ...o });
const camFingers = (over = {}) => ({ fingers: { thumb: thumbOpen(), index: open(), middle: open(), ring: open(), pinky: open(), ...over } });

test('Trigger: no symptoms -> low', () => assert.equal(trigger.assess(tfNone).level, 'low'));
test('Trigger: tender spot only -> grade I, selfcare', () => {
  const r = trigger.assess({ ...tfNone, pressTender: Y, duration: 'lt6w' });
  assert.equal(r.grade, 'I');
  assert.equal(r.level, 'selfcare');
});
test('Trigger: camera catch in the ring finger -> grade II, measured', () => {
  const r = trigger.assess({ ...tfNone, catching: Y, needHelp: N, duration: 'lt6w' }, camFingers({ ring: open({ catches: 2 }) }));
  assert.equal(r.grade, 'II');
  const f = Object.fromEntries(r.features.map((x) => [x.id, x]));
  assert.equal(f.catching.method, 'camera');
  assert.equal(f.catching.detail, 'ring');
});
test('Trigger: thumb catching is measured too', () => {
  const r = trigger.assess({ ...tfNone, catching: Y, needHelp: N, duration: 'lt6w' }, camFingers({ thumb: thumbOpen({ catches: 1 }) }));
  assert.deepEqual(r.camera.catching, ['thumb']);
});
test('Trigger: grade II for 6+ months -> routine', () => assert.equal(trigger.assess({ ...tfNone, catching: Y, needHelp: N, duration: 'gt6m' }).level, 'routine'));
test('Trigger: needs other hand -> grade III, soon', () => {
  const r = trigger.assess({ ...tfNone, catching: Y, needHelp: Y });
  assert.equal(r.grade, 'III');
  assert.equal(r.level, 'soon');
});
test('Trigger: camera sees one finger not straighten while others do -> grade III', () => {
  const r = trigger.assess({ ...tfNone, catching: Y, needHelp: N }, camFingers({ middle: open({ maxAngle: 128 }) }));
  assert.equal(r.grade, 'III');
  assert.deepEqual(r.camera.cannotStraighten, ['middle']);
});
test('Trigger: stuck bent -> grade IV, soon', () => {
  const r = trigger.assess({ ...tfNone, stuckBent: Y });
  assert.equal(r.grade, 'IV');
  assert.equal(r.level, 'soon');
});
test('Trigger: bad camera angle (nothing straightens) does not flag every finger', () => {
  const bad = { maxAngle: 130 };
  const r = trigger.assess(tfNone, camFingers({ thumb: thumbOpen({ maxAngle: 130 }), index: open(bad), middle: open(bad), ring: open(bad), pinky: open(bad) }));
  assert.deepEqual(r.camera.cannotStraighten, []);
  assert.equal(r.level, 'low');
});
test('Trigger: infection signs -> urgent', () => assert.equal(trigger.assess({ infection: Y }).level, 'urgent'));

// ---------- Carpal tunnel ----------
const cts = { numb: Y, numbFingers: ['thumb', 'index', 'middle'], night: Y, thenar: N, constant: N, neck: N, feet: N, acute: N };
const reach = (missed = []) => ({ reach: { ok: true, reached: Object.fromEntries(['index', 'middle', 'ring', 'pinky'].map((f) => [f, !missed.includes(f)])) } });

test('Carpal: no symptoms -> low', () => assert.equal(carpal.assess({ numb: N, thenar: N }).level, 'low'));
test('Carpal: numbness + night (7.5), tests not done -> selfcare', () => {
  const r = carpal.assess(cts);
  assert.equal(r.score.value, 7.5);
  assert.equal(r.level, 'selfcare');
});
test('Carpal: + positive Phalen (12.5) -> routine, Phalen onset shown', () => {
  const r = carpal.assess({ ...cts, phalen: Y, phalenOnset: 34, tinel: N, twoPoint: N });
  assert.equal(r.score.value, 12.5);
  assert.equal(r.level, 'routine');
  assert.equal(r.features.find((f) => f.id === 'phalen').detail, 'after 34 s');
});
test('Carpal: thumb weakness -> soon', () => assert.equal(carpal.assess({ ...cts, thenar: Y }).level, 'soon'));
test('Carpal: camera thumb cannot reach little finger counts as thenar weakness', () => {
  const r = carpal.assess(cts, reach(['pinky']));
  assert.equal(r.items.thenar, true);
  assert.equal(r.score.value, 12.5);
  assert.equal(r.level, 'soon');
});
test('Carpal: camera thumb reached every finger is recorded, no points', () => {
  const r = carpal.assess(cts, reach([]));
  assert.equal(r.items.thenar, false);
  assert.equal(r.features.find((f) => f.id === 'thenar').method, 'camera');
});
test('Carpal: constant numbness -> soon', () => assert.equal(carpal.assess({ ...cts, constant: Y }).level, 'soon'));
test('Carpal: little finger only -> not median nerve, routine', () => {
  const r = carpal.assess({ ...cts, numbFingers: ['pinky'], night: N });
  assert.equal(r.items.median, false);
  assert.equal(r.level, 'routine');
});
test('Carpal: sudden after wrist injury -> urgent', () => assert.equal(carpal.assess({ acute: Y }).level, 'urgent'));
test('Carpal: maximum score is 26', () => assert.equal(carpal.assess({ ...cts, thenar: Y, phalen: Y, tinel: Y, twoPoint: Y }).score.value, 26));

// ---------- Fixes found by the simulated population test (validation/population.mjs) ----------
const U = 'unsure';
test('Raynaud: the urgent question is visible whatever the cold answer', () => {
  const section = raynaud.QUESTIONS.find((q) => q.section === 'Warning signs');
  for (const cold of [Y, N, U]) assert.equal(section.showIf({ cold }), true, cold);
  assert.equal(section.showIf({}), false);
});
test('Raynaud: "not sure" about cold plus a camera-seen white phase is not "unlikely"', () => {
  const r = raynaud.assess({ cold: U, white: U, blue: U }, cam());
  assert.notEqual(r.level, 'low');
  assert.equal(r.level, 'selfcare');
});
test('Raynaud: answering "no" to cold with nothing else stays "unlikely"', () => {
  assert.equal(raynaud.assess({ cold: N, white: N, blue: N }).level, 'low');
});
test('Raynaud: sores raise "see a doctor soon" even when the blue phase was not confirmed', () => {
  const r = raynaud.assess({ cold: Y, white: Y, blue: N, sores: Y, deadTissue: N });
  assert.equal(r.level, 'soon');
});
test('Raynaud: secondary warning signs count with only a white phase', () => {
  assert.equal(raynaud.assess({ cold: Y, white: Y, blue: N, after40: Y }).level, 'soon');
});
test('Color analysis: a recording that is too noisy (dim light) is not scored', () => {
  const rows = [];
  let s = 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let t = 0; t <= 150; t++) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    rows.push({ t: String(t), finger: f, palm_dL: 6 * r(), palm_da: 6 * r(), palm_db: 6 * r() });
  }
  const a = analyzeColorRecording(rows, [{ type: 'warm_start', t: '40' }], null);
  assert.equal(a.ok, false);
  assert.equal(a.tooNoisy, true);
});
test('Carpal: "not sure" about numbness with a positive Phalen test is not "unlikely"', () => {
  const r = carpal.assess({ numb: U, thenar: N, night: Y, phalen: Y, tinel: N, twoPoint: N });
  assert.notEqual(r.level, 'low');
});
test('Carpal: a clear "no" to everything is still "unlikely"', () => {
  assert.equal(carpal.assess({ numb: N, thenar: N }).level, 'low');
});
test('Raynaud: a camera result that was not scored is treated as no camera result', () => {
  assert.doesNotThrow(() => raynaud.assess({ cold: Y, white: Y, blue: Y }, { ok: false, reason: 'too noisy' }));
});
