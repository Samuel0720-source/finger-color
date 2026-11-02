// Lower-case the first letter for use inside a sentence, but keep names like Phalen or Tinel.
const lc = (s) => (/^(Phalen|Tinel|Raynaud|CTS)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
// How strongly the app recommends medical care. Higher rank = more urgent.
// Every assessment returns one of these. The wording is shown to the user as-is.
export const LEVELS = {
  incomplete: { rank: 0, tag: 'Not enough answers', headline: 'Answer the questions to get a result' },
  low: { rank: 1, tag: 'Unlikely', headline: 'Unlikely from your answers' },
  selfcare: { rank: 2, tag: 'Self-care', headline: 'Self-care first, and see a doctor if it does not improve' },
  routine: { rank: 3, tag: 'Routine appointment', headline: 'Book a routine appointment with your doctor' },
  soon: { rank: 4, tag: 'See a doctor soon', headline: 'See a doctor within the next 1 to 2 weeks' },
  urgent: { rank: 5, tag: 'Get care today', headline: 'Get medical care today' },
};

// Start at a level and only ever move up. Each step remembers why.
export function createTriage(start = 'low') {
  let level = start;
  const reasons = [];
  return {
    raise(to, reason) {
      if (LEVELS[to].rank > LEVELS[level].rank) level = to;
      if (reason) reasons.push({ level: to, text: reason });
    },
    note(reason) {
      reasons.push({ level: null, text: reason });
    },
    get level() {
      return level;
    },
    reasons,
  };
}

// Answer helpers. Answers are 'yes', 'no', 'unsure' or undefined (not answered).
export const yes = (a, id) => a[id] === 'yes';
export const answered = (a, id) => a[id] !== undefined && a[id] !== null && a[id] !== '';
export const missing = (a, ids) => ids.filter((id) => !answered(a, id));

// ---------- Feature profile ----------
// Each condition lists its hallmark features. For each one the app records:
//   status: 'yes' (present) | 'no' (absent) | 'unknown' (not answered or not measured)
//   method: 'camera' (measured), 'test' (guided self-test), 'answer' (you told us)
//   cameraPlanned: the camera could check this but did not in this session
export function feature(id, label, status, method, detail = '') {
  return { id, label, status, method, detail };
}
export const fromAnswer = (a, id) => (a[id] === 'yes' ? 'yes' : a[id] === 'no' ? 'no' : 'unknown');

const METHOD_WORD = { camera: 'Measured by camera', test: 'Guided test', answer: 'You reported' };

// "Your answers and measurements match 5 of 9 Raynaud's features. Measured by camera: ... Not checked yet: ..."
export function summarize(name, features) {
  const known = features.filter((f) => f.status !== 'unknown');
  const present = features.filter((f) => f.status === 'yes');
  if (known.length === 0) {
    const n = (m) => features.filter((f) => f.method === m).length;
    const how = [[n('answer'), 'from your answers'], [n('test'), 'by guided tests'], [n('camera'), 'by the camera']].filter(([c]) => c).map(([c, w]) => `${c} ${w}`);
    return { text: `${features.length} ${name} features will be checked: ${how.join(', ')}.`, present: 0, known: 0, total: features.length };
  }
  const parts = [`${present.length} of ${features.length} ${name} features are present in your answers and measurements.`];
  for (const method of ['camera', 'test', 'answer']) {
    const items = present.filter((f) => f.method === method);
    if (items.length) parts.push(`${METHOD_WORD[method]}: ${items.map((f) => (f.detail ? `${lc(f.label)} (${f.detail})` : lc(f.label))).join('; ')}.`);
  }
  const unknown = features.filter((f) => f.status === 'unknown');
  if (unknown.length) parts.push(`Not checked yet: ${unknown.map((f) => lc(f.label)).join('; ')}.`);
  return { text: parts.join(' '), present: present.length, known: known.length, total: features.length };
}
