// Turns the app's own result into (1) a small summary that may be sent to the AI, only after the
// user agrees, and (2) a plain explanation made on the device with no AI.
// Nothing here invents a number: every value is copied from the assessment the app already showed.

import { LEVELS } from '../assess/levels.js';

const cut = (s, n) => String(s ?? '').slice(0, n);

// r is what CONDITIONS[mode].assess() returns. No names, no dates, no video, no raw samples.
export function buildSummary(mode, r) {
  const L = LEVELS[r.level];
  return {
    condition: mode,
    level: r.level,
    tag: L.tag,
    headline: L.headline,
    score: r.score ? { label: cut(r.score.label, 80), value: typeof r.score.value === 'number' ? r.score.value : cut(r.score.value, 40), max: r.score.max ?? null } : null,
    present: r.summary.present,
    known: r.summary.known,
    total: r.summary.total,
    features: r.features.slice(0, 20).map((f) => ({ label: cut(f.label, 100), status: f.status, method: f.method, detail: cut(f.detail, 100) })),
    reasons: r.reasons.slice(0, 8).map((x) => cut(x.text, 220)),
  };
}

const STATUS_WORD = { en: { yes: 'present', no: 'absent', unknown: 'not checked' }, ko: { yes: '있음', no: '없음', unknown: '확인 안 함' } };
const METHOD_WORD = { en: { camera: 'camera', test: 'guided test', answer: 'your answer' }, ko: { camera: '카메라', test: '안내형 테스트', answer: '내 답변' } };
const NAME = { en: { raynaud: "Raynaud's", trigger: 'trigger finger', carpal: 'carpal tunnel' }, ko: { raynaud: '레이노', trigger: '방아쇠 손가락', carpal: '손목터널' } };

// What the user sees before agreeing to send: exactly the lines that would leave the device.
export function summaryLines(s, lang = 'en') {
  const lines = [`${NAME[lang][s.condition]}: ${s.tag}`];
  if (s.score) lines.push(`${s.score.label}: ${s.score.value}${s.score.max ? ' / ' + s.score.max : ''}`);
  for (const f of s.features) lines.push(`${f.label}: ${STATUS_WORD[lang][f.status]} (${METHOD_WORD[lang][f.method]}${f.detail ? ', ' + f.detail : ''})`);
  return lines;
}

// The explanation made on the device.
export function explainLocally(s, lang = 'en') {
  const present = s.features.filter((f) => f.status === 'yes');
  const unknown = s.features.filter((f) => f.status === 'unknown');
  const list = (items) => items.map((f) => (f.detail ? `${f.label} (${f.detail})` : f.label)).join('; ');
  if (lang === 'ko') {
    if (s.level === 'incomplete') {
      return `아직 ${NAME.ko[s.condition]} 결과가 없어요. 앱에 "${s.headline}"라고 나와 있어요. Symptoms 단계의 질문에 답하면 결과가 나와요.`;
    }
    const out = [`${NAME.ko[s.condition]} 체크의 현재 제안: "${s.headline}" (${s.tag}). 이것은 의사를 볼지에 대한 제안이고 진단이 아니에요.`];
    out.push(`관찰된 것: 특징 ${s.total}개 중 ${s.present}개가 있음으로 나왔어요.${present.length ? ' 있음: ' + list(present) + '.' : ''}`);
    if (s.score) out.push(`점수: ${s.score.label} = ${s.score.value}${s.score.max ? ' / ' + s.score.max : ''}.`);
    if (unknown.length) out.push(`확인 안 함 ${unknown.length}개: ${list(unknown)}. "확인 안 함"은 정상이라는 뜻이 아니에요.`);
    if (s.reasons.length) out.push(`앱이 든 이유: ${s.reasons.join(' ')}`);
    out.push('한계: 스스로 답하고 테스트한 결과이고, 카메라 기준값은 환자를 대상으로 검증되지 않았어요. 증상이 걱정되거나 심해지면 결과와 상관없이 의료진과 상담하세요.');
    return out.join('\n\n');
  }
  if (s.level === 'incomplete') {
    return `There is no ${NAME.en[s.condition]} result yet. The app says: "${s.headline}". Answer the questions in the Symptoms step to get one.`;
  }
  const out = [`Your ${NAME.en[s.condition]} check currently suggests: "${s.headline}" (${s.tag}). This is a suggestion about seeing a doctor, not a diagnosis.`];
  out.push(`What was observed: ${s.present} of ${s.total} features are marked present.${present.length ? ' Present: ' + list(present) + '.' : ''}`);
  if (s.score) out.push(`Score: ${s.score.label} = ${s.score.value}${s.score.max ? ' / ' + s.score.max : ''}.`);
  if (unknown.length) out.push(`Not checked (${unknown.length}): ${list(unknown)}. "Not checked" does not mean normal.`);
  if (s.reasons.length) out.push(`The app's reasons: ${s.reasons.join(' ')}`);
  out.push('Limits: you answered and tested yourself, and the camera thresholds have not been validated on patients. If a symptom worries you or is getting worse, talk to a healthcare professional whatever this says.');
  return out.join('\n\n');
}
