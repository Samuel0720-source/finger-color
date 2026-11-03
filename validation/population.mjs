// Simulated population test: 50 diverse synthetic people, all three conditions.
//
// For each person:
//   1. A "true" state is chosen (for example: primary Raynaud's on 3 fingers, trigger finger grade II, no carpal tunnel).
//   2. The REFERENCE result = the app's own criteria given perfect information
//      (accurate answers and a noise-free camera signal on light skin in daylight).
//   3. The APP result = the same criteria given what this person would really produce:
//      their skin tone, room light, camera noise, joint-tracking jitter, and imperfect answers ("not sure", misremembering).
//   4. Compare. Under-triage (app less urgent than the reference) is the dangerous direction.
//
// This tests the app's measurement and decision code against modelled variation. It is NOT a clinical study:
// the people, skin optics and symptoms are generated, and the reference is the app's criteria, not a doctor.
//   npm run population
import { writeFileSync } from 'node:fs';
import { analyzeColorRecording } from '../src/assess/color-analysis.js';
import { toLinear, linearToLab } from '../src/color.js';
import { summarizeFinger } from '../src/tests/trigger-test.js';
import { createReachCounter, TARGETS } from '../src/tests/reach-panel.js';
import { LEVELS } from '../src/assess/levels.js';
import * as raynaud from '../src/assess/raynaud.js';
import * as trigger from '../src/assess/trigger.js';
import * as carpal from '../src/assess/carpal.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const N = 50;

// ---------- Seeded random numbers (same people every run) ----------
let seed = 20261103;
const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
// Each person and each step gets its own random stream, so changing the app (or one person) never changes
// the noise or answer mistakes of anyone else. That makes before/after comparisons fair.
const reseed = (id, step) => {
  seed = (20261103 + id * 7919 + step * 104729) % 2147483647;
  for (let i = 0; i < 5; i++) rand();
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const shuffle = (list) => list.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

// ---------- Skin optics (simple Beer-Lambert model) ----------
// Reflectance of each color channel = exp(-(absorption)). Melanin absorbs blue most; oxygenated blood absorbs green;
// deoxygenated blood also absorbs red. More melanin = less of the blood color change reaches the camera.
// Hemoglobin values: molar extinction at ~600 / 550 / 470 nm (Prahl, OMLC tables), scaled so oxygenated blood
// in green = 0.9. Melanin follows its usual wavelength^-3.5 fall-off, relative to green.
const MELANIN = [0.74, 1.0, 1.73];
const OXY = [0.067, 0.9, 0.69];
const DEOXY = [0.31, 1.11, 0.33];
const SCATTER = [0.1, 0.15, 0.2];
const FITZ_MELANIN = { 1: 0.1, 2: 0.25, 3: 0.45, 4: 0.75, 5: 1.1, 6: 1.5 }; // palm-side skin, Fitzpatrick I-VI
const BLOOD = {
  normal: { oxy: 0.5, deoxy: 0.1 },
  white: { oxy: 0.15, deoxy: 0.05 }, // little blood: pale
  blue: { oxy: 0.1, deoxy: 0.5 }, // pooled blood that has lost its oxygen: blue
  red: { oxy: 0.9, deoxy: 0.05 }, // extra blood on rewarming: red
};
const mix = (p, q, k) => ({ oxy: p.oxy + (q.oxy - p.oxy) * k, deoxy: p.deoxy + (q.deoxy - p.deoxy) * k });

const LIGHTS = {
  daylight: { rgb: [1, 1, 1], level: 0.95, noise: 0.8, drift: 0, dropout: 0, jitter: 2 },
  'warm indoor': { rgb: [1.0, 0.85, 0.62], level: 0.65, noise: 1.3, drift: 0.05, dropout: 0, jitter: 3 },
  'cool office': { rgb: [0.88, 0.95, 1.05], level: 0.75, noise: 1.1, drift: 0.03, dropout: 0, jitter: 2.5 },
  dim: { rgb: [1.0, 0.9, 0.75], level: 0.35, noise: 2.6, drift: 0.08, dropout: 0.004, jitter: 5 },
};

// Camera: skin reflectance x light x exposure -> 8-bit sRGB with noise (already averaged over the color box).
function cameraPixel(melanin, blood, light, exposure) {
  const lin = [0, 1, 2].map((c) => Math.exp(-(SCATTER[c] + MELANIN[c] * melanin + OXY[c] * blood.oxy + DEOXY[c] * blood.deoxy)) * light.rgb[c] * light.level * exposure);
  const toSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const px = lin.map((v) => Math.max(0, Math.min(255, Math.round(toSrgb(Math.min(1, v)) * 255 + light.noise * gauss()))));
  return { r: px[0], g: px[1], b: px[2] };
}
const lab = (px) => linearToLab(toLinear(px));
const minus = (p, q) => ({ L: p.L - q.L, a: p.a - q.a, b: p.b - q.b });

// ---------- Raynaud's: one recorded episode ----------
// Tip state over time (s): white 0-25, blue 25-45 (if the person has a blue phase), red 45-75 after warming at 45,
// then a gradual return. Finger bases stay normal when the border is sharp.
function bloodAt(t, phases, recovery) {
  if (t < 25) return BLOOD.white;
  if (t < 45) return phases.includes('blue') ? BLOOD.blue : BLOOD.white;
  if (t < 75) return phases.includes('red') ? BLOOD.red : mix(BLOOD.white, BLOOD.normal, (t - 45) / 30);
  return mix(phases.includes('red') ? BLOOD.red : BLOOD.normal, BLOOD.normal, Math.min(1, (t - 75) / recovery));
}

function colorRows(p, ideal = false) {
  const light = ideal ? LIGHTS.daylight : p.light;
  const melanin = ideal ? FITZ_MELANIN[1] : FITZ_MELANIN[p.skin];
  const quiet = ideal ? { ...light, noise: 0, drift: 0 } : light;
  const rows = [];
  for (let t = 0; t <= 170; t++) {
    const exposure = 1 + quiet.drift * Math.sin((2 * Math.PI * t) / 40);
    const palm = lab(cameraPixel(melanin, BLOOD.normal, quiet, exposure));
    for (const f of FINGERS) {
      const on = p.raynaud.fingers.includes(f);
      const tipBlood = on ? bloodAt(t, p.raynaud.phases, p.raynaud.recovery) : BLOOD.normal;
      const baseBlood = on && !p.raynaud.sharp ? tipBlood : BLOOD.normal;
      const d = minus(lab(cameraPixel(melanin, tipBlood, quiet, exposure)), palm);
      const x = minus(lab(cameraPixel(melanin, baseBlood, quiet, exposure)), palm);
      rows.push({ t: String(t), finger: f, palm_dL: d.L, palm_da: d.a, palm_db: d.b, prox_dL: x.L, prox_da: x.a, prox_db: x.b });
    }
  }
  return rows;
}

// ---------- Trigger finger: 10 fist cycles at 30 fps ----------
function angleSeries(p, finger, ideal) {
  const t = [];
  const a = [];
  const tf = p.trigger;
  const open = finger === 'thumb' ? p.rom.thumbOpen : p.rom.open;
  const fist = finger === 'thumb' ? p.rom.thumbFist : p.rom.fist;
  const affected = tf.finger === finger;
  const maxOpen = affected && tf.grade === 'III' ? 128 : affected && tf.grade === 'IV' ? 110 : open;
  const catchCycles = affected && tf.grade === 'II' ? new Set(shuffle([...Array(10).keys()]).slice(0, tf.catchCount)) : new Set();
  const jitter = ideal ? 0 : p.light.jitter * p.handJitter;
  let ms = 0;
  for (let c = 0; c < 11; c++) {
    for (let i = 0; i < 60; i++) {
      const u = i / 60;
      let ang;
      if (u < 0.5) ang = maxOpen - (maxOpen - fist) * (u / 0.5);
      else {
        const v = (u - 0.5) / 0.5;
        ang = fist + (maxOpen - fist) * v;
        if (catchCycles.has(c)) {
          const stopAt = fist + (maxOpen - fist) * 0.45; // stop part way, then snap open
          if (v > 0.35 && v < 0.6) ang = stopAt;
          else if (v >= 0.6 && v < 0.66) ang = stopAt + (maxOpen - stopAt) * ((v - 0.6) / 0.06);
          else if (v >= 0.66) ang = maxOpen;
        }
      }
      if (affected && tf.grade === 'IV') ang = 100 + 10 * Math.sin(u * Math.PI); // stays bent
      const dropped = !ideal && chance(p.light.dropout);
      ms += dropped ? 140 : 1000 / 30;
      t.push(ms);
      a.push(ang + jitter * gauss());
    }
  }
  return { t, a };
}

function triggerCamera(p, ideal = false) {
  const fingers = {};
  let maxGap = 0;
  for (const f of FINGERS) {
    const { t, a } = angleSeries(p, f, ideal);
    for (let i = 1; i < t.length; i++) maxGap = Math.max(maxGap, t[i] - t[i - 1]);
    const s = summarizeFinger(t, a);
    fingers[f] = { catches: s.catches.length, maxAngle: s.maxAngle, minAngle: s.minAngle, cycles: s.cycles };
  }
  if (!ideal && maxGap > 100) return { cam: null, note: 'not scored: tracking gap' }; // the app's quality gate
  return { cam: { fingers }, note: '' };
}

// ---------- Carpal tunnel: thumb reach ----------
function reachCamera(p, ideal = false) {
  const counter = createReachCounter();
  const jitter = ideal ? 0 : 0.03 * p.handJitter * (p.light === LIGHTS.dim ? 1.6 : 1);
  for (const [name, idx] of TARGETS) {
    const closest = p.reachGap[name];
    for (let frame = 0; frame < 30 * 6; frame++) {
      if (counter.target !== name) break;
      const approach = Math.max(closest, 0.9 - frame / 40); // the thumb moves in, then holds its closest distance
      const g = Math.max(0, approach + jitter * gauss());
      const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
      w[9] = { x: 0, y: 0.08 * p.handSize, z: 0 }; // hand size scales every distance
      w[idx] = { x: 0.03 * p.handSize, y: 0.1 * p.handSize, z: 0 };
      w[4] = { x: w[idx].x + g * 0.08 * p.handSize, y: w[idx].y, z: 0 };
      counter.update(w);
    }
    if (counter.target === name) counter.skip();
  }
  return { ok: true, ...counter.result() };
}

// ---------- People ----------
const AGES = ['18-29', '30-44', '45-59', '60-74', '75+'];
function makePeople() {
  const raynaudTruth = shuffle([...Array(16).fill('none'), ...Array(14).fill('primary'), ...Array(8).fill('primary-white-red'), ...Array(12).fill('secondary')]);
  const triggerTruth = shuffle([...Array(18).fill('none'), ...Array(8).fill('I'), ...Array(12).fill('II'), ...Array(8).fill('III'), ...Array(4).fill('IV')]);
  const carpalTruth = shuffle([...Array(16).fill('none'), ...Array(12).fill('mild'), ...Array(12).fill('moderate'), ...Array(10).fill('severe')]);
  const lights = Object.keys(LIGHTS);
  return Array.from({ length: N }, (_, i) => {
    const age = AGES[i % AGES.length];
    const older = age === '60-74' || age === '75+';
    const stiff = older && chance(0.5); // arthritis-like stiffness, not trigger finger
    const handSize = 0.8 + 0.45 * rand(); // small to large hands
    const p = {
      id: i + 1,
      skin: (i % 6) + 1,
      lightName: lights[Math.floor(i / 6) % lights.length],
      age,
      handSize,
      handJitter: handSize < 0.9 ? 1.3 : 1, // small hands: fewer pixels per joint, noisier angles
      rom: {
        open: stiff ? 160 + 6 * rand() : 168 + 8 * rand(),
        fist: stiff ? 100 + 10 * rand() : 80 + 10 * rand(),
        thumbOpen: stiff ? 152 + 6 * rand() : 160 + 8 * rand(),
        thumbFist: stiff ? 128 + 8 * rand() : 115 + 10 * rand(),
      },
      stiff,
    };
    p.light = LIGHTS[p.lightName];

    const rt = raynaudTruth[i];
    const fingers = rt === 'none' ? [] : rt === 'secondary' && chance(0.4) ? [pick(['index', 'middle', 'ring'])] : rt === 'secondary' ? ['thumb', 'index', 'middle', 'ring'] : chance(0.3) ? ['index', 'middle', 'ring', 'pinky'] : ['index', 'middle', 'ring'];
    p.raynaud = {
      truth: rt,
      fingers,
      phases: rt === 'primary-white-red' ? ['white', 'red'] : ['white', 'blue', 'red'],
      sharp: chance(0.8),
      recovery: 20 + 50 * rand(),
      sores: rt === 'secondary' && chance(0.4),
      after40: rt === 'secondary' ? chance(0.7) : false,
      otherTriggers: rt !== 'none' && chance(0.5),
      severePain: rt === 'secondary' && chance(0.4),
      otherSymptoms: rt === 'secondary' && chance(0.5),
    };
    p.trigger = { grade: triggerTruth[i], finger: pick(['thumb', 'middle', 'ring', 'ring', 'index']), catchCount: 3 + Math.floor(rand() * 5), longer: chance(0.5) };
    const ct = carpalTruth[i];
    const gapNormal = 0.08 + 0.06 * rand();
    p.carpal = { truth: ct, night: ct === 'moderate' || ct === 'severe' || (ct === 'mild' && chance(0.5)), constant: ct === 'severe' && chance(0.5) };
    p.tests = guidedTests(ct);
    p.reachGap = { index: gapNormal, middle: gapNormal, ring: gapNormal + 0.02, pinky: ct === 'severe' ? 0.28 + 0.15 * rand() : stiff ? gapNormal + 0.08 + 0.1 * rand() : gapNormal + 0.03 };
    return p;
  });
}

// ---------- Answers: perfect vs realistic ----------
// realistic: each yes/no answer is "not sure" 8% of the time and flipped 6% of the time.
// Blue fingers are hard to see on darker skin, so people with Fitzpatrick V-VI often answer "not sure" to blue.
function answerer(realistic) {
  return (truth, { hardToSee = 0 } = {}) => {
    if (!realistic) return truth ? 'yes' : 'no';
    if (chance(hardToSee) || chance(0.08)) return 'unsure';
    return chance(0.06) ? (truth ? 'no' : 'yes') : truth ? 'yes' : 'no';
  };
}

function raynaudAnswers(p, realistic) {
  const say = answerer(realistic);
  const r = p.raynaud;
  const has = r.truth !== 'none';
  const dark = p.skin >= 5 ? 0.45 : p.skin >= 3 ? 0.15 : 0;
  return {
    cold: say(has),
    white: say(has),
    blue: say(has && r.phases.includes('blue'), { hardToSee: has ? dark : 0 }),
    red: say(has),
    sharpLine: say(has && r.sharp, { hardToSee: dark }),
    bothHands: say(has && r.fingers.length > 1),
    numb: say(has),
    otherTriggers: say(r.otherTriggers),
    otherSites: say(false),
    photos: say(false),
    after40: say(r.after40),
    oneSide: say(r.truth === 'secondary' && r.fingers.length === 1),
    severePain: say(r.severePain),
    sores: say(r.sores),
    otherSymptoms: say(r.otherSymptoms),
    deadTissue: 'no',
  };
}

function triggerAnswers(p, realistic) {
  const say = answerer(realistic);
  const g = p.trigger.grade;
  const has = g !== 'none';
  return {
    catching: say(['II', 'III'].includes(g)),
    fingers: has ? [p.trigger.finger] : [],
    needHelp: say(g === 'III'),
    cantBend: say(false),
    stuckBent: say(g === 'IV'),
    morning: say(has),
    duration: has ? (p.trigger.longer ? '6w6m' : 'lt6w') : undefined,
    pressTender: say(has),
    infection: 'no',
    injury: 'no',
    diabetes: say(false),
  };
}

const SENS = { phalen: { none: 0.15, mild: 0.6, moderate: 0.75, severe: 0.8 }, tinel: { none: 0.1, mild: 0.4, moderate: 0.55, severe: 0.6 }, twoPoint: { none: 0.03, mild: 0.1, moderate: 0.3, severe: 0.7 } };
function carpalAnswers(p, realistic, tests) {
  const say = answerer(realistic);
  const ct = p.carpal.truth;
  const has = ct !== 'none';
  return {
    numb: say(has),
    numbFingers: has ? ['thumb', 'index', 'middle'] : [],
    night: say(p.carpal.night),
    flick: say(has),
    thenar: say(ct === 'severe', { hardToSee: 0.3 }), // a flat thumb muscle is easy to miss yourself
    duration: has ? (ct === 'mild' ? 'lt3m' : '3m6m') : undefined,
    constant: say(p.carpal.constant),
    acute: 'no',
    neck: say(false),
    feet: say(false),
    ...tests,
  };
}
// Guided-test outcomes are part of the person (same in both runs). The reference uses them as recorded.
function guidedTests(ct) {
  return Object.fromEntries(Object.keys(SENS).map((k) => [k, chance(SENS[k][ct]) ? 'yes' : 'no']));
}

// ---------- Run ----------
const rank = (level) => LEVELS[level].rank;
// Why did the app differ from the reference? Swap in perfect answers or a perfect camera and see which one fixes it.
function cause(ref, app, answersOnly, cameraOnly) {
  if (ref === app) return '';
  if (answersOnly !== ref && cameraOnly === ref) return 'answers';
  if (cameraOnly !== ref && answersOnly === ref) return 'camera';
  return 'both';
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const people = makePeople();
const results = [];

for (const p of people) {
  const row = { id: p.id, skin: p.skin, light: p.lightName, age: p.age, hand: p.handSize < 0.9 ? 'small' : p.handSize > 1.1 ? 'large' : 'medium', stiff: p.stiff };

  // Raynaud's: people with Raynaud's record one episode in episode mode; healthy people record a cold hand that does not change.
  reseed(p.id, 1);
  const ideal = analyzeColorRecording(colorRows(p, true), [{ type: 'warm_start', t: '45' }], null);
  const real = analyzeColorRecording(colorRows(p, false), [{ type: 'warm_start', t: '45' }], null);
  reseed(p.id, 2);
  const perfectR = raynaudAnswers(p, false);
  const realisticR = raynaudAnswers(p, true);
  // Like main.js: a recording that was not scored reaches the assessment as "no camera result".
  const camOf = (x) => (x.ok ? x : null);
  const refR = raynaud.assess(perfectR, camOf(ideal));
  const appR = raynaud.assess(realisticR, camOf(real));
  row.raynaud = {
    truth: p.raynaud.truth,
    trueFingers: p.raynaud.fingers,
    seenFingers: real.ok ? real.involved : null,
    seenPhases: real.ok ? { white: real.pale.length > 0, blue: real.blue.length > 0, red: real.red.length > 0 } : null,
    peakMiddle: real.ok ? +real.fingers.middle.peak.toFixed(1) : null,
    referenceNoise: real.ok && real.noise ? +median(Object.values(real.noise)).toFixed(1) : null,
    note: real.ok ? '' : real.reason,
    reference: refR.level,
    app: appR.level,
    cause: cause(refR.level, appR.level, raynaud.assess(realisticR, camOf(ideal)).level, raynaud.assess(perfectR, camOf(real)).level),
  };

  reseed(p.id, 3);
  const tIdeal = triggerCamera(p, true);
  const tReal = triggerCamera(p, false);
  reseed(p.id, 4);
  const perfectT = triggerAnswers(p, false);
  const realisticT = triggerAnswers(p, true);
  const refT = trigger.assess(perfectT, tIdeal.cam);
  const appT = trigger.assess(realisticT, tReal.cam);
  const camT = trigger.cameraFindings(tReal.cam);
  row.trigger = { truth: p.trigger.grade, finger: p.trigger.grade === 'none' ? '' : p.trigger.finger, cameraCatching: camT?.catching ?? null, cameraCannotStraighten: camT?.cannotStraighten ?? null, cameraCannotBend: camT?.cannotBend ?? null, note: tReal.note, reference: refT.level, app: appT.level, cause: cause(refT.level, appT.level, trigger.assess(realisticT, tIdeal.cam).level, trigger.assess(perfectT, tReal.cam).level) };

  const tests = p.tests;
  // main.js passes the thumb reach result to carpal.assess as { reach }.
  reseed(p.id, 5);
  const reachReal = reachCamera(p, false);
  const reachIdeal = reachCamera(p, true);
  reseed(p.id, 6);
  const perfectC = carpalAnswers(p, false, tests);
  const realisticC = carpalAnswers(p, true, tests);
  const refC = carpal.assess(perfectC, { reach: reachIdeal });
  const appC = carpal.assess(realisticC, { reach: reachReal });
  row.carpal = { truth: p.carpal.truth, reachedLittle: reachReal.reached.pinky, scoreRef: refC.score.value, scoreApp: appC.score.value, reference: refC.level, app: appC.level, cause: cause(refC.level, appC.level, carpal.assess(realisticC, { reach: reachIdeal }).level, carpal.assess(perfectC, { reach: reachReal }).level) };
  results.push(row);
}

// ---------- Compare ----------
function compare(cond) {
  const list = results.map((r) => ({ ...r[cond], person: r }));
  const scored = list.filter((x) => x.app !== 'incomplete' && x.reference !== 'incomplete');
  const under = scored.filter((x) => rank(x.app) < rank(x.reference));
  const over = scored.filter((x) => rank(x.app) > rank(x.reference));
  return { total: list.length, agree: scored.length - under.length - over.length, scored: scored.length, incomplete: list.length - scored.length, under, over };
}

const summary = {};
const lines = [];
const out = (s = '') => lines.push(s);
out(`Simulated population test: ${N} synthetic people (seed 20261103)`);
out('Reference = app criteria with perfect information. App = same criteria with realistic answers and camera noise.');
out('');
for (const cond of ['raynaud', 'trigger', 'carpal']) {
  const c = compare(cond);
  summary[cond] = { people: c.total, scored: c.scored, incomplete: c.incomplete, agree: c.agree, underTriage: c.under.length, overTriage: c.over.length };
  out(`${cond}: ${c.agree}/${c.scored} same level, ${c.under.length} under-triage, ${c.over.length} over-triage, ${c.incomplete} incomplete`);
  const byCause = (list) => ['answers', 'camera', 'both'].map((k) => `${k} ${list.filter((x) => x.cause === k).length}`).join(', ');
  summary[cond].underCause = byCause(c.under);
  summary[cond].overCause = byCause(c.over);
  out(`   cause of under-triage: ${byCause(c.under)} | over-triage: ${byCause(c.over)}`);
  for (const x of c.under) out(`   UNDER #${x.person.id} skin ${x.person.skin}, ${x.person.light}, ${x.person.age}${x.person.stiff ? ', stiff fingers' : ''}: truth ${x.truth}, reference ${x.reference} -> app ${x.app} [${x.cause}]${x.note ? ' (' + x.note.slice(0, 50) + ')' : ''}`);
  for (const x of c.over.filter((o) => o.cause !== 'answers')) out(`   over  #${x.person.id} skin ${x.person.skin}, ${x.person.light}, ${x.person.age}${x.person.stiff ? ', stiff fingers' : ''}: truth ${x.truth}, reference ${x.reference} -> app ${x.app} [${x.cause}]`);
}

// Camera-only checks, by subgroup.
out('');
out("Raynaud's camera: fingers that really changed and were seen (sensitivity), by skin type (Fitzpatrick)");
const bySkin = {};
for (const r of results) {
  if (r.raynaud.truth === 'none') continue;
  const s = (bySkin[r.skin] ??= { truePos: 0, total: 0, blueSeen: 0, blueTotal: 0, unscored: 0, peak: [] });
  if (!r.raynaud.seenFingers) {
    s.unscored++;
    continue;
  }
  s.total += r.raynaud.trueFingers.length;
  s.truePos += r.raynaud.trueFingers.filter((f) => r.raynaud.seenFingers.includes(f)).length;
  s.peak.push(r.raynaud.peakMiddle);
  const trulyBlue = results.find((x) => x.id === r.id) && people[r.id - 1].raynaud.phases.includes('blue');
  if (trulyBlue) {
    s.blueTotal++;
    if (r.raynaud.seenPhases.blue) s.blueSeen++;
  }
}
summary.raynaudCameraBySkin = {};
for (const [skin, s] of Object.entries(bySkin)) {
  const peak = s.peak.filter((x) => x !== null);
  summary.raynaudCameraBySkin[skin] = { fingersSeen: `${s.truePos}/${s.total}`, blueSeen: `${s.blueSeen}/${s.blueTotal}`, unscored: s.unscored, meanPeakMiddle: peak.length ? +(peak.reduce((a, b) => a + b, 0) / peak.length).toFixed(1) : null };
  out(`   type ${skin}: fingers seen ${s.truePos}/${s.total}, blue phase seen ${s.blueSeen}/${s.blueTotal}, recordings not scored ${s.unscored}, mean peak change (middle) ${summary.raynaudCameraBySkin[skin].meanPeakMiddle}`);
}
const healthyFalse = results.filter((r) => r.raynaud.truth === 'none' && r.raynaud.seenFingers?.length);
out(`   healthy people with a color change wrongly seen: ${healthyFalse.length}/${results.filter((r) => r.raynaud.truth === 'none').length}`);
summary.raynaudFalseChanges = healthyFalse.length;

out('');
out('Trigger camera: catching seen in people with grade II, by light');
const byLight = {};
for (const r of results) {
  const s = (byLight[r.light] ??= { seen: 0, total: 0, falseFlags: 0, healthy: 0, unscored: 0 });
  if (r.trigger.cameraCatching === null) {
    s.unscored++;
    continue;
  }
  if (r.trigger.truth === 'II') {
    s.total++;
    if (r.trigger.cameraCatching.includes(r.trigger.finger)) s.seen++;
  }
  if (r.trigger.truth === 'none') {
    s.healthy++;
    if (r.trigger.cameraCatching.length || r.trigger.cameraCannotStraighten.length || r.trigger.cameraCannotBend.length) s.falseFlags++;
  }
}
summary.triggerCameraByLight = byLight;
for (const [l, s] of Object.entries(byLight)) out(`   ${l}: catching seen ${s.seen}/${s.total}, healthy people wrongly flagged ${s.falseFlags}/${s.healthy}, not scored ${s.unscored}`);

out('');
out('Thumb reach: little finger "not reached" by truth');
const reach = {};
for (const r of results) {
  const key = r.carpal.truth === 'none' && r.stiff ? 'none (stiff fingers)' : r.carpal.truth;
  const s = (reach[key] ??= { failed: 0, total: 0 });
  s.total++;
  if (!r.carpal.reachedLittle) s.failed++;
}
summary.reachByTruth = reach;
for (const [k, s] of Object.entries(reach)) out(`   ${k}: ${s.failed}/${s.total}`);

// Targeted fairness check: is the blue phase seen equally on every skin type? 10 episodes per skin type and
// light (dim light is excluded because those recordings are not scored).
out('');
out('Blue phase seen, 10 simulated episodes per cell (skin type x light)');
summary.blueBySkin = {};
for (const skin of [1, 2, 3, 4, 5, 6]) {
  const cells = [];
  for (const lightName of ['daylight', 'warm indoor', 'cool office']) {
    let seen = 0;
    for (let k = 0; k < 10; k++) {
      reseed(1000 + skin * 100 + k, lightName.length);
      const q = { skin, light: LIGHTS[lightName], raynaud: { fingers: ['index', 'middle', 'ring'], phases: ['white', 'blue', 'red'], sharp: true, recovery: 40 } };
      const r = analyzeColorRecording(colorRows(q, false), [{ type: 'warm_start', t: '45' }], null);
      if (r.ok && r.blue.length) seen++;
    }
    cells.push(seen);
    summary.blueBySkin[`${skin} ${lightName}`] = seen / 10;
  }
  out(`   type ${skin}: daylight ${cells[0]}/10, warm indoor ${cells[1]}/10, cool office ${cells[2]}/10`);
}
console.log(lines.join('\n'));
if (!process.argv.includes('--no-save')) writeFileSync(new URL('./population-results.json', import.meta.url), JSON.stringify({ seed: 20261103, scope: 'Synthetic people and skin optics; reference is the app criteria with perfect information, not clinical diagnosis.', summary, people: results }, null, 2) + '\n');
