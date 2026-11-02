import { createTriage, yes, missing, feature, fromAnswer, summarize } from './levels.js';

// Trigger finger (stenosing tenosynovitis), graded with the Green classification
// (summarized in "Trigger Finger: Evaluation, Management and Outcomes", 2023):
//   I    pain and tenderness at the A1 pulley (base of the finger, palm side), catching only felt by the patient
//   II   catching that the patient can straighten actively
//   III  catching that needs the other hand to straighten (IIIA) or loss of full bending (IIIB)
//   IV   fixed bent finger (flexion contracture)
// Conservative care first for all grades; corticosteroid injection helps 45-80% after one injection.

export const NAME = 'trigger finger';
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export const QUESTIONS = [
  { section: 'Your symptoms' },
  { id: 'catching', text: 'Does a finger click, catch or lock when you bend or straighten it?' },
  { id: 'fingers', type: 'fingers', text: 'Which fingers?', showIf: (a) => yes(a, 'catching') || yes(a, 'pressTender') },
  { id: 'needHelp', text: 'Do you sometimes need your other hand to straighten it?', showIf: (a) => yes(a, 'catching') },
  { id: 'cantBend', text: 'Is it hard to bend the finger all the way into a fist?' },
  { id: 'stuckBent', text: 'Is a finger stuck bent, so you cannot straighten it even with your other hand?' },
  { id: 'morning', text: 'Is it worse in the morning, then easier later in the day?', showIf: (a) => yes(a, 'catching') || yes(a, 'pressTender') },
  {
    id: 'duration',
    type: 'choice',
    text: 'How long has this been going on?',
    options: [['lt6w', 'Less than 6 weeks'], ['6w6m', '6 weeks to 6 months'], ['gt6m', 'More than 6 months']],
    showIf: (a) => yes(a, 'catching') || yes(a, 'pressTender') || yes(a, 'stuckBent'),
  },

  { section: 'Quick check', note: 'Press firmly with your other thumb on your palm, right at the crease where the painful finger meets the palm.' },
  { id: 'pressTender', text: 'Is that spot tender, or can you feel a small lump that moves when the finger bends?', method: 'test' },

  { section: 'Warning signs' },
  { id: 'infection', text: 'Is the finger red, hot and swollen along its length, or did this start after a cut, bite or puncture?', urgent: true },
  { id: 'injury', text: 'Did it start right after an injury to the hand?' },
  { id: 'diabetes', text: 'Do you have diabetes or rheumatoid arthritis?', help: 'Both make trigger finger more common and sometimes harder to treat.' },
];

// Camera thresholds on the estimated joint angle (degrees, 180 = straight). Engineering values, not clinical.
const LIMITS = {
  thumb: { open: 150, fist: 140 }, // thumb IP joint bends less than the finger PIP joints
  index: { open: 155, fist: 115 },
  middle: { open: 155, fist: 115 },
  ring: { open: 155, fist: 115 },
  pinky: { open: 155, fist: 115 },
};
export const MARGIN = 15;

// camera: { fingers: { thumb: { catches, maxAngle, minAngle }, ... } }
export function cameraFindings(camera) {
  if (!camera || !camera.fingers) return null;
  const out = { catching: [], cannotStraighten: [], cannotBend: [], measured: Object.keys(camera.fingers) };
  const entries = Object.entries(camera.fingers);
  const opened = entries.filter(([n, f]) => f.maxAngle >= LIMITS[n].open).length;
  const fisted = entries.filter(([n, f]) => f.minAngle <= LIMITS[n].fist).length;
  for (const [n, f] of entries) {
    if (f.catches > 0) out.catching.push(n);
    // Only flag a finger when most others did reach the position, so a bad camera angle does not flag every finger.
    if (f.maxAngle < LIMITS[n].open - MARGIN && opened >= 2) out.cannotStraighten.push(n);
    if (f.minAngle > LIMITS[n].fist + MARGIN && fisted >= 2) out.cannotBend.push(n);
  }
  return out;
}

const NICE = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', pinky: 'little finger' };
const names = (list) => list.map((n) => NICE[n]).join(', ');

export function features(a, cam) {
  const camStatus = (list) => (cam ? (list.length ? 'yes' : 'no') : null);
  const pick = (camList, id, label) => {
    const c = camStatus(camList);
    if (c === 'yes') return feature(id, label, 'yes', 'camera', names(camList));
    if (yes(a, id)) return feature(id, label, 'yes', 'answer');
    if (c === 'no') return feature(id, label, 'no', 'camera', 'not seen');
    return feature(id, label, fromAnswer(a, id), 'answer');
  };
  return [
    pick(cam ? cam.catching : [], 'catching', 'Catching or snapping'),
    feature('pressTender', 'Tender spot or lump at the base of the finger', fromAnswer(a, 'pressTender'), 'test'),
    pick(cam ? cam.cannotStraighten : [], 'needHelp', 'Does not straighten on its own'),
    pick(cam ? cam.cannotBend : [], 'cantBend', 'Cannot bend fully'),
    feature('stuckBent', 'Stays bent (fixed)', fromAnswer(a, 'stuckBent'), 'answer'),
    feature('morning', 'Worse in the morning', fromAnswer(a, 'morning'), 'answer'),
  ];
}

export function assess(a, camera = null) {
  const t = createTriage('low');
  const cam = cameraFindings(camera);
  const feats = features(a, cam);
  const f = Object.fromEntries(feats.map((x) => [x.id, x]));
  let grade = null;
  const out = (forced) => finish(t, forced, grade, feats, cam, a);

  if (yes(a, 'infection')) {
    t.raise('urgent', 'A red, hot, swollen finger, or one that started after a cut or bite, can be an infection of the tendon sheath. It can damage the tendon within hours and needs care today.');
  }
  if (missing(a, ['catching', 'cantBend', 'stuckBent']).length) return out('incomplete');

  if (f.stuckBent.status === 'yes') {
    grade = 'IV';
    t.raise('soon', 'A finger that stays bent and cannot be straightened even with help is the most advanced stage (Green grade IV). The longer it stays bent, the harder it is to fix.');
  } else if (f.needHelp.status === 'yes' || f.cantBend.status === 'yes') {
    grade = 'III';
    const why = f.needHelp.status === 'yes'
      ? (f.needHelp.method === 'camera' ? `In the camera test your ${f.needHelp.detail} did not straighten fully while the other fingers did.` : 'You need your other hand to straighten the finger.')
      : (f.cantBend.method === 'camera' ? `In the camera test your ${f.cantBend.detail} did not bend fully while the other fingers did.` : 'You cannot bend the finger fully.');
    t.raise('soon', `${why} This is Green grade III. Splinting alone works less well at this stage. A doctor can offer an injection or a referral.`);
  } else if (f.catching.status === 'yes') {
    grade = 'II';
    t.raise('selfcare', f.catching.method === 'camera'
      ? `The camera saw catching in your ${f.catching.detail}, and the finger still straightens on its own (Green grade II).`
      : 'You feel catching but can straighten the finger yourself (Green grade II). The camera test can measure it.');
  } else if (f.pressTender.status === 'yes') {
    grade = 'I';
    t.raise('selfcare', 'A tender spot or lump at the base of the finger without catching is the earliest stage (Green grade I).');
  } else {
    t.note('No catching, locking, or tender spot at the base of a finger. Trigger finger is unlikely.');
  }

  if (grade && (a.duration === '6w6m' || a.duration === 'gt6m') && (grade === 'I' || grade === 'II')) {
    t.raise('routine', 'It has lasted more than 6 weeks. A corticosteroid injection helps 45 to 80% of people after one injection, so it is worth seeing a doctor.');
  }
  if (grade && yes(a, 'injury')) t.raise('routine', 'It started after an injury, so a doctor should check that a tendon or joint is not damaged.');
  if (grade && yes(a, 'diabetes')) t.note('Diabetes and rheumatoid arthritis are linked to trigger finger in several fingers and to slower recovery.');
  if (cam && yes(a, 'catching') && !cam.catching.length) t.note('The camera did not see a catch this time. Catching comes and goes and is often worse in the morning.');
  return out(null);
}

function finish(t, forced, grade, feats, cam, a) {
  const level = forced && t.level !== 'urgent' ? forced : t.level;
  return {
    condition: 'trigger',
    name: NAME,
    level,
    grade,
    score: grade ? { value: grade, label: 'Green grade (I mild to IV severe)' } : null,
    features: feats,
    summary: summarize(NAME, feats),
    camera: cam,
    reasons: t.reasons,
    actions: actionsFor(level, grade),
    limits: [
      'Joint angles are estimated from a single camera and can be off by several degrees.',
      'A voluntary pause while opening the hand can look like a catch. Repeat the test to confirm.',
      'Dupuytren\'s disease (a cord in the palm) can also stop a finger straightening. A doctor can tell them apart.',
    ],
  };
}

function actionsFor(level, grade) {
  const care = [
    'Rest the finger from hard or repeated gripping (tools, phone, steering wheel) for a few weeks.',
    'A splint that keeps the finger straight at night for about 6 weeks helps many people.',
    'Gently bend and straighten the finger a few times each morning. Do not force it through a catch.',
  ];
  switch (level) {
    case 'urgent':
      return ['Go to an emergency department or urgent care today. Do not wait to see if it gets better.'];
    case 'soon':
      return ['See your family doctor within 1 to 2 weeks and bring this report. Ask about a corticosteroid injection or a referral to a hand specialist.', grade === 'IV' ? 'Do not force the finger straight.' : care[0]];
    case 'routine':
      return ['Book a routine appointment. Options are a splint, a corticosteroid injection, or a small release operation if those fail.', ...care];
    case 'selfcare':
      return [...care, 'See a doctor if it is not better in 6 weeks, if it starts locking, or if you need your other hand to straighten it.'];
    default:
      return [];
  }
}
