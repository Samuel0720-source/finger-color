import { createTriage, yes, answered, missing, feature, fromAnswer, summarize } from './levels.js';

// Raynaud's phenomenon.
// Criteria: international consensus (Maverakis et al., J Autoimmun 2014)
//   step 1 fingers unusually sensitive to cold; step 2 white AND blue color change;
//   step 3 at least 3 of 7: other triggers, both hands, numbness, sharp border, photos, other sites, red phase.
// Pattern and warning signs: Merck Manual Professional (usually the middle three fingers, rarely the thumb;
//   onset after 40, one-sided or severe attacks, ulcers or gangrene suggest a secondary cause).

export const NAME = "Raynaud's";

export const QUESTIONS = [
  { section: 'The basics' },
  { id: 'cold', text: 'Are your fingers unusually sensitive to cold?' },
  { id: 'white', text: 'During these episodes, do your fingers turn white or very pale?' },
  { id: 'blue', text: 'During these episodes, do your fingers turn blue or purple?' },

  // Follow-up questions also show for "Not sure", so an unsure answer never hides the rest of the check.
  { section: 'About the episodes', showIf: (a) => a.cold === 'yes' || a.cold === 'unsure' },
  { id: 'red', text: 'When the fingers warm up, do they turn red before going back to normal?' },
  { id: 'sharpLine', text: 'Is there a sharp line between the pale or blue part and normal skin?' },
  { id: 'bothHands', text: 'Are both hands affected, even if not at the same time or equally?' },
  { id: 'numb', text: 'Do your fingers go numb or tingle during an episode?' },
  { id: 'otherTriggers', text: 'Can something other than cold start an episode, such as stress?' },
  { id: 'otherSites', text: 'Do your nose, ears, feet or nipples ever change color the same way?' },
  { id: 'photos', text: 'Do you have photos of an episode?', help: 'Capturing an episode with the camera below also counts.' },

  // Always shown once the first question is answered: a black finger is urgent whatever the other answers.
  { section: 'Warning signs', showIf: (a) => answered(a, 'cold') },
  { id: 'after40', text: 'Did these episodes first start after age 40?' },
  { id: 'oneSide', text: 'Do episodes affect only one hand, or one or two fingers only?' },
  { id: 'severePain', text: 'Are the episodes severely painful?' },
  { id: 'sores', text: 'Do you have sores, ulcers or cracks on your fingertips that heal slowly?' },
  { id: 'otherSymptoms', text: 'Do you have joint pain or swelling, a new rash, tight or thick skin on your fingers, trouble swallowing, or a very dry mouth or eyes?' },
  { id: 'deadTissue', text: 'Is any part of a finger black, or does a finger stay white or blue now, even after warming it for an hour?', urgent: true },
];

const NICE = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', pinky: 'little finger' };
const fingersText = (list) => list.map((f) => NICE[f]).join(', ');
const timeText = (s) => (s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

// Camera says yes -> measured. Otherwise your answer. Camera "no" only counts when nothing else is known.
function merge(camStatus, a, id, camDetail) {
  if (camStatus === 'yes') return { status: 'yes', method: 'camera', detail: camDetail };
  if (yes(a, id)) return { status: 'yes', method: 'answer', detail: '' };
  if (camStatus === 'no') return { status: 'no', method: 'camera', detail: camDetail };
  return { status: fromAnswer(a, id), method: 'answer', detail: '' };
}

export function features(a, cam) {
  const ok = cam && cam.ok;
  const episode = ok && cam.involved.length > 0; // the camera saw a real color change
  const c = (cond) => (!episode ? null : cond ? 'yes' : 'no');

  const white = merge(c(cam?.pale.length), a, 'white', episode ? (cam.pale.length ? fingersText(cam.pale) : 'not seen') : '');
  const blue = merge(c(cam?.blue.length), a, 'blue', episode ? (cam.blue.length ? fingersText(cam.blue) : 'not seen') : '');
  const red = merge(c(cam?.red.length), a, 'red', episode ? (cam.red.length ? fingersText(cam.red) : 'not seen') : '');
  const border = merge(episode && cam.borderMeasured ? (cam.border.length ? 'yes' : 'no') : null, a, 'sharpLine', episode && cam.border.length ? fingersText(cam.border) : '');

  let recovery = { status: 'unknown', method: 'camera', detail: '' };
  if (episode && cam.middle?.ok && cam.middle.recoverySec !== null && !cam.middle.noChange) {
    recovery = { status: 'yes', method: 'camera', detail: `middle finger ${timeText(cam.middle.recoverySec)}` };
  } else if (episode && cam.middle?.ok && cam.middle.recoverySec === null && !cam.middle.noChange) {
    recovery = { status: 'unknown', method: 'camera', detail: 'not back to normal when recording stopped' };
  }

  const several = episode
    ? { status: cam.involved.length >= 2 ? 'yes' : 'no', method: 'camera', detail: `${cam.involved.length} of 5: ${fingersText(cam.involved)}` }
    : { status: 'unknown', method: 'camera', detail: '' };
  const thumb = episode && cam.involved.length >= 2
    ? { status: cam.thumbSpared ? 'yes' : 'no', method: 'camera', detail: cam.thumbSpared ? 'thumb unchanged' : 'thumb also changed' }
    : { status: 'unknown', method: 'camera', detail: '' };
  const photo = episode ? { status: 'yes', method: 'camera', detail: 'captured in this session' } : { status: fromAnswer(a, 'photos'), method: 'answer', detail: '' };

  return [
    feature('cold', 'Cold is the trigger', fromAnswer(a, 'cold'), 'answer'),
    feature('white', 'White (pale) phase', white.status, white.method, white.detail),
    feature('blue', 'Blue phase', blue.status, blue.method, blue.detail),
    feature('red', 'Red phase on rewarming', red.status, red.method, red.detail),
    feature('recovery', 'Returns to normal after rewarming', recovery.status, recovery.method, recovery.detail),
    feature('several', 'Several fingers involved', several.status, several.method, several.detail),
    feature('thumb', 'Thumb spared', thumb.status, thumb.method, thumb.detail),
    feature('border', 'Sharp border to normal skin', border.status, border.method, border.detail),
    feature('bothHands', 'Both hands affected', fromAnswer(a, 'bothHands'), 'answer'),
    feature('numb', 'Numbness or tingling in attacks', fromAnswer(a, 'numb'), 'answer'),
    feature('otherTriggers', 'Other triggers such as stress', fromAnswer(a, 'otherTriggers'), 'answer'),
    feature('otherSites', 'Other body parts change color', fromAnswer(a, 'otherSites'), 'answer'),
    feature('photo', 'Photo of an episode', photo.status, photo.method, photo.detail),
  ];
}

// The 7 consensus step-3 items, using the merged (camera or answer) features.
const STEP3 = ['otherTriggers', 'bothHands', 'numb', 'border', 'photo', 'otherSites', 'red'];

export function assess(a, cam = null) {
  if (!cam?.ok) cam = null; // a recording that was not scored (too short, too noisy) counts as no camera result
  const t = createTriage('low');
  const feats = features(a, cam);
  const f = Object.fromEntries(feats.map((x) => [x.id, x]));
  const step3 = STEP3.filter((id) => f[id].status === 'yes');
  const score = { value: step3.length, max: 7, label: 'Consensus step 3 features (3 or more needed)' };

  if (yes(a, 'deadTissue')) {
    t.raise('urgent', 'A finger that is black, or stays white or blue after warming, may not be getting enough blood. This needs care today.');
  }
  const out = (forced) => finish(t, forced, score, feats, cam, a);

  if (!answered(a, 'cold')) return out('incomplete');
  // Ulcers mean badly reduced blood supply, whether or not the full criteria are met.
  if (yes(a, 'sores')) t.raise('soon', 'Fingertip sores or ulcers mean the blood supply is badly reduced. See a doctor within days, not weeks.');

  const white = f.white.status === 'yes';
  const blue = f.blue.status === 'yes';
  const cameraSawChange = Boolean(cam?.ok && (cam.pale.length || cam.blue.length));

  if (!yes(a, 'cold')) {
    if (cameraSawChange) {
      t.raise('selfcare', `The camera saw your fingers turn ${cam.pale.length ? 'white' : 'blue'}. The criteria need cold as the trigger and you answered "${a.cold === 'no' ? 'no' : 'not sure'}". Color changes like this are still worth mentioning to a doctor, especially if they come back.`);
    } else if (a.cold === 'unsure' && (white || blue)) {
      t.raise('selfcare', 'You were not sure whether cold brings it on. Notice what starts your next episode and capture it with the camera, then check again.');
    } else {
      t.note('Your fingers are not unusually sensitive to cold. This is the first step of the Raynaud\'s criteria.');
    }
    secondaryCheck(t, a, cam, white || blue);
    return out(null);
  }
  if (f.white.status === 'unknown' || f.blue.status === 'unknown') {
    if (!(white && blue)) {
      secondaryCheck(t, a, cam, white || blue);
      return out(t.level === 'low' ? 'incomplete' : null);
    }
  }

  if (!(white && blue)) {
    if (white || blue) {
      t.raise('selfcare', `Only a ${white ? 'white' : 'blue'} color change was found. The criteria need both white and blue. Capture your next episode with the camera to check.`);
    } else {
      t.note('Your fingers do not change color, so Raynaud\'s phenomenon is unlikely. Cold sensitivity alone has many causes.');
    }
    secondaryCheck(t, a, cam, white || blue);
    return out(null);
  }

  const unknown3 = STEP3.filter((id) => f[id].status === 'unknown');
  if (step3.length < 3 && unknown3.length > 0 && missing(a, ['bothHands', 'numb', 'otherTriggers', 'otherSites']).length) return out('incomplete');

  if (step3.length >= 3) {
    t.raise('routine', `This matches the consensus criteria for Raynaud's phenomenon: cold sensitivity, white and blue color change, and ${step3.length} of the 7 supporting features (3 needed).`);
  } else {
    t.raise('selfcare', `You have cold sensitivity and white and blue color change, but ${step3.length} of the 3 supporting features the criteria need. It may still be Raynaud's. Capturing episodes helps.`);
  }
  secondaryCheck(t, a, cam, true);
  if (cam?.ok && cam.thumbSpared) t.note('The thumb stayed normal while other fingers changed. This is the usual pattern in primary Raynaud\'s.');
  return out(null);
}

// Secondary Raynaud's: another condition may be causing it. Checked whenever there is a color change,
// even if the full criteria are not met, so a missed blue phase cannot hide these warning signs.
function secondaryCheck(t, a, cam, colorChange) {
  if (!colorChange) return;
  const secondary = [
    ['after40', 'it started after age 40'],
    ['oneSide', 'only one hand or one or two fingers are affected'],
    ['severePain', 'the episodes are severely painful'],
    ['otherSymptoms', 'you have symptoms that can come with autoimmune disease'],
  ].filter(([id]) => yes(a, id));
  if (cam?.ok && cam.involved.length === 1) secondary.push(['camera', 'the camera saw only one finger change']);
  if (secondary.length) {
    t.raise('soon', `Signs that another condition may be causing it (secondary Raynaud's): ${secondary.map(([, s]) => s).join('; ')}. A doctor can check with blood tests and a look at the small blood vessels at your nail fold.`);
  }
}

function finish(t, forced, score, feats, cam, a) {
  const level = forced && t.level !== 'urgent' ? forced : t.level;
  return {
    condition: 'raynaud',
    name: NAME,
    level,
    score,
    features: feats,
    summary: summarize(NAME, feats),
    reasons: t.reasons,
    actions: actionsFor(level, a),
    limits: [
      'The camera sees one hand at a time, so it cannot compare both hands yet.',
      'On darker skin the color change is smaller, so the camera can miss a blue phase, especially under indoor light (in a simulation: 7 to 8 of 10 seen on the darkest skin, 10 of 10 on lighter skin). If you saw blue yourself, answer Yes.',
      'In dim light the camera cannot tell a real color change from noise, so those recordings are not scored.',
      'Recovery time is a camera color signal, not a blood flow measurement. Room light and camera exposure change it.',
      'A doctor separates primary from secondary Raynaud\'s with blood tests and nail fold capillaroscopy, which this app cannot do.',
    ],
  };
}

function actionsFor(level, a) {
  const care = [
    'Keep your whole body warm, not only your hands. Put gloves on before going into the cold.',
    'Do not smoke. Smoking narrows blood vessels.',
    'During an episode, warm your hands under warm (not hot) water or in your armpits.',
    'Ask a pharmacist whether any of your medicines can cause it (some migraine, decongestant and blood pressure medicines can).',
  ];
  switch (level) {
    case 'urgent':
      return ['Go to an emergency department or urgent care today.', 'Keep the hand warm on the way. Do not use direct heat like a heating pad.'];
    case 'soon':
      return ['Book an appointment with your family doctor within 1 to 2 weeks and bring this report.', 'Ask about blood tests for autoimmune disease and a nail fold capillaroscopy.', ...care.slice(0, 2)];
    case 'routine':
      return ['Book a routine appointment to confirm it and rule out other causes. Bring this report.', ...care];
    case 'selfcare':
      return ['Capture your next episode with the camera, then check again.', ...care];
    case 'low':
      return yes(a, 'cold') ? ['If your fingers start changing color, capture it with the camera and check again.'] : [];
    default:
      return [];
  }
}
