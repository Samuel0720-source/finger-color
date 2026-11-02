import { createTriage, yes, answered, missing, feature, fromAnswer, summarize } from './levels.js';

// Carpal tunnel syndrome, scored with the CTS-6 (Graham et al. 2006; MDCalc):
//   numbness mainly in thumb, index, middle or ring finger 3.5 | numbness wakes you at night 4
//   thenar wasting or weakness 5 | positive Phalen test 5 | loss of 2-point discrimination (5 mm) 4.5
//   positive Tinel sign 4.  Total 26.  12 or more: carpal tunnel syndrome is likely.
// At home the person does the items, which is less reliable than a clinician's examination.
// Urgent referral signs (NHS Scotland referral guidance): permanent numbness, wasting of the thumb muscle.

export const NAME = 'carpal tunnel';
export const LIKELY = 12;
export const POINTS = { median: 3.5, night: 4, thenar: 5, phalen: 5, twoPoint: 4.5, tinel: 4 };
export const TESTS = ['phalen', 'tinel', 'twoPoint'];

export const QUESTIONS = [
  { section: 'Your symptoms' },
  { id: 'numb', text: 'Do you get numbness, tingling or pins and needles in your hand?' },
  { id: 'numbFingers', type: 'fingers', text: 'Where do you feel it most?', help: 'Tap every finger that is affected.', showIf: (a) => yes(a, 'numb') },
  { id: 'night', text: 'Does it wake you up at night?', showIf: (a) => yes(a, 'numb') },
  { id: 'flick', text: 'Does shaking or flicking your hand make it better?', showIf: (a) => yes(a, 'numb') },
  { id: 'thenar', text: 'Is the muscle at the base of your thumb flatter than on your other hand, or is your thumb weak (dropping things, trouble with buttons or jars)?' },
  {
    id: 'duration',
    type: 'choice',
    text: 'How long have you had these symptoms?',
    options: [['lt3m', 'Less than 3 months'], ['3m6m', '3 to 6 months'], ['gt6m', 'More than 6 months']],
    showIf: (a) => yes(a, 'numb') || yes(a, 'thenar'),
  },

  { section: 'Warning signs and other causes' },
  { id: 'constant', text: 'Is the numbness there all the time, even at rest, and never fully goes away?', showIf: (a) => yes(a, 'numb') },
  { id: 'acute', text: 'Did it start suddenly after a wrist injury, with a lot of swelling or pain?', urgent: true },
  { id: 'neck', text: 'Do you have neck pain that spreads down your arm?' },
  { id: 'feet', text: 'Do you also have numbness in your feet?' },
];

// camera: { reach: { ok, reached: { index, middle, ring, pinky } } }  (thumb opposition test)
function reachFailed(camera) {
  const r = camera?.reach;
  if (!r || !r.ok) return null;
  const missed = ['index', 'middle', 'ring', 'pinky'].filter((f) => !r.reached[f]);
  return missed;
}

export function score(a, camera = null) {
  const fingers = a.numbFingers || [];
  const missed = reachFailed(camera);
  const items = {
    median: yes(a, 'numb') && fingers.some((f) => f !== 'pinky'),
    night: yes(a, 'night'),
    thenar: yes(a, 'thenar') || Boolean(missed && missed.includes('pinky')),
    phalen: a.phalen === 'yes',
    twoPoint: a.twoPoint === 'yes',
    tinel: a.tinel === 'yes',
  };
  const value = Object.entries(items).reduce((s, [k, on]) => s + (on ? POINTS[k] : 0), 0);
  const notDone = TESTS.filter((k) => a[k] !== 'yes' && a[k] !== 'no');
  const couldStillAdd = notDone.reduce((s, k) => s + POINTS[k], 0);
  return { items, value, notDone, couldStillAdd, missed };
}

const NICE = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', pinky: 'little finger' };
const testStatus = (v) => (v === 'yes' ? 'yes' : v === 'no' ? 'no' : 'unknown');

export function features(a, camera = null) {
  const s = score(a, camera);
  const fingers = a.numbFingers || [];
  const thenarCam = s.missed && s.missed.includes('pinky');
  return [
    feature('median', 'Numbness in thumb, index, middle or ring finger', !answered(a, 'numb') ? 'unknown' : s.items.median ? 'yes' : 'no', 'answer', s.items.median ? fingers.map((f) => NICE[f]).join(', ') : ''),
    feature('night', 'Wakes you at night', fromAnswer(a, 'night'), 'answer'),
    thenarCam
      ? feature('thenar', 'Thumb muscle flat or weak', 'yes', 'camera', 'thumb could not reach the little finger')
      : feature('thenar', 'Thumb muscle flat or weak', fromAnswer(a, 'thenar'), s.missed ? 'camera' : 'answer', s.missed && !yes(a, 'thenar') ? 'thumb reached every fingertip' : ''),
    feature('phalen', 'Phalen test reproduces tingling', testStatus(a.phalen), 'test', a.phalen === 'yes' && a.phalenOnset ? `after ${a.phalenOnset} s` : ''),
    feature('tinel', 'Tinel sign (tapping sends tingling into fingers)', testStatus(a.tinel), 'test'),
    feature('twoPoint', 'Cannot feel two points 5 mm apart', testStatus(a.twoPoint), 'test'),
    feature('flick', 'Shaking the hand helps', fromAnswer(a, 'flick'), 'answer'),
  ];
}

export function assess(a, camera = null) {
  const t = createTriage('low');
  const s = score(a, camera);
  const feats = features(a, camera);
  const result = { value: s.value, max: 26, label: `CTS-6 home score (${LIKELY} or more = likely)` };
  const out = (forced) => finish(t, forced, result, s, feats, a);

  if (yes(a, 'acute')) {
    t.raise('urgent', 'Numbness that starts suddenly after a wrist injury with a lot of swelling can mean pressure is building on the nerve. This needs care today.');
  }
  if (missing(a, ['numb', 'thenar']).length || (yes(a, 'numb') && (!(a.numbFingers && a.numbFingers.length) || !answered(a, 'night')))) {
    return out('incomplete');
  }
  if (!yes(a, 'numb') && !yes(a, 'thenar') && !s.items.thenar) {
    t.note('No numbness, tingling or thumb weakness. Carpal tunnel syndrome is unlikely.');
    return out(null);
  }

  const fingers = a.numbFingers || [];
  if (fingers.length && fingers.every((f) => f === 'pinky')) {
    t.raise('routine', 'Numbness only in the little finger usually comes from a different nerve (the ulnar nerve), not carpal tunnel. A doctor can check it.');
  }

  if (s.value >= LIKELY) {
    t.raise('routine', `Your CTS-6 home score is ${s.value} of 26. A score of ${LIKELY} or more means carpal tunnel syndrome is likely.`);
  } else if (s.value + s.couldStillAdd >= LIKELY) {
    t.raise('selfcare', `Your CTS-6 home score is ${s.value} of 26. The guided tests you have not done can add up to ${s.couldStillAdd} points, enough to reach ${LIKELY}. Do them for a clearer answer.`);
  } else if (s.value > 0) {
    t.raise('selfcare', `Your CTS-6 home score is ${s.value} of 26, below ${LIKELY}. Carpal tunnel syndrome is less likely, but mild cases can score low.`);
  }

  if (s.items.thenar) {
    t.raise('soon', s.missed && s.missed.includes('pinky') && !yes(a, 'thenar')
      ? 'In the camera test your thumb could not reach your little finger. Weak thumb muscles can mean the nerve is already damaged, so see a doctor soon.'
      : 'A flatter or weaker thumb muscle can mean the nerve is already being damaged. Damage can become permanent, so see a doctor soon.');
  }
  if (yes(a, 'constant')) t.raise('soon', 'Numbness that never goes away is a sign of more severe nerve compression. See a doctor soon.');
  if (a.duration === 'gt6m' && s.value > 0) t.raise('routine', 'Symptoms for more than 6 months are a reason to see a doctor, especially if a night splint has not helped.');
  if (yes(a, 'neck')) t.raise('routine', 'Neck pain spreading down the arm can come from a pinched nerve in the neck, which can feel like carpal tunnel. Mention it to your doctor.');
  if (yes(a, 'feet')) t.raise('routine', 'Numbness in both hands and feet can come from a nerve problem in the whole body (for example from diabetes or low vitamin B12). A doctor can test for this.');
  return out(null);
}

function finish(t, forced, result, s, feats, a) {
  const level = forced && t.level !== 'urgent' ? forced : t.level;
  return {
    condition: 'carpal',
    name: NAME,
    level,
    score: result,
    items: s.items,
    notDone: s.notDone,
    features: feats,
    summary: summarize(NAME, feats),
    reasons: t.reasons,
    actions: actionsFor(level, s),
    limits: [
      'CTS-6 was designed for a clinician to examine you. Doing the tests on yourself is less reliable.',
      'The camera cannot measure muscle strength or nerve speed. A nerve conduction test can.',
      'Shaking the hand helping is a common carpal tunnel clue but is not part of the CTS-6 score.',
    ],
  };
}

function actionsFor(level, s) {
  const care = [
    'Wear a wrist splint at night that keeps your wrist straight, for at least 12 weeks.',
    'Avoid long periods with your wrist bent, and take breaks from repeated gripping or vibrating tools.',
    'Shake or move your hand when symptoms start. This often eases them.',
  ];
  const tests = s.notDone.length ? [`Do the guided tests you skipped (${s.notDone.map(testName).join(', ')}) for a more complete score.`] : [];
  switch (level) {
    case 'urgent':
      return ['Go to an emergency department or urgent care today.'];
    case 'soon':
      return ['See your family doctor within 1 to 2 weeks and bring this report. Ask whether a nerve conduction test or a referral to a hand specialist is needed.', care[0]];
    case 'routine':
      return ['Book a routine appointment and bring this report. A doctor can confirm it and offer a steroid injection if splinting is not enough.', ...care, ...tests];
    case 'selfcare':
      return [...care, ...tests, 'See a doctor if it gets worse, wakes you often, or lasts more than 3 months.'];
    default:
      return tests;
  }
}

export function testName(k) {
  return { phalen: 'Phalen test', tinel: 'Tinel test', twoPoint: 'two-point test' }[k];
}
